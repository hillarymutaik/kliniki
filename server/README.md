# Kliniki server

The backend for Kliniki: an HTTP API in front of PostgreSQL, built to be shared by many independent
clinics and to take writes from tablets that have been offline for hours.

**Stack:** Node 22+, TypeScript, Fastify 5, Zod, PostgreSQL (developed and tested on 18 only), `pg`, `jose`.
It reuses the app's own business rules from [`../src/domain`](../src/domain) (FEFO stock, M-Pesa and phone
validation, claim transitions), so the app and the server cannot disagree about a rule.

**Status:** tenants, staff, sign-in, offline sync, billing with stock, SHA claims, audit. **Not built yet:**
M-Pesa Daraja payments, and connecting the Expo app to this server (see [What is not here](#what-is-not-here)).

## Run it

**Easiest (no Docker, nothing to install).** This starts a local PostgreSQL for development, applies the
migrations and writes `.env` for you:

```sh
cd server
npm install
npm run dev:db      # leave this terminal open; it keeps the database running
```

Then, in a second terminal:

```sh
cd server
npm run dev         # http://localhost:3000   (check: http://localhost:3000/readyz)
```

Data is kept in `server/.pgdata` between runs (delete that folder to start over). This is for development only.

The local credentials are all `kliniki`: database `kliniki`, API user `kliniki`, password `kliniki`. That user is
deliberately restricted (it is subject to row-level security, so a database tool connected as it will show no rows).
To browse the data yourself, connect as `postgres` with password `kliniki` on port 54329.

If `npm run dev:db` says your local database is from an older version of the script, delete `server/.pgdata` and
`server/.env` and run it again (it only holds development data).

**With your own PostgreSQL** (or in production): `cp .env.example .env`, fill in `DATABASE_URL`,
`DATABASE_OWNER_URL`, `APP_DB_PASSWORD` and `JWT_SECRET`, run `npm run migrate`, then `npm run dev`
(or `npm run build && npm start`). **With Docker:** `docker compose -f server/docker-compose.yml up --build`
(untested; see [Hosting](#hosting)).

The API connects as **`kliniki_app`**, an unprivileged role. Only `npm run migrate` uses the owner connection.

```sh
npm test            # 106 tests against a real PostgreSQL it starts itself (no Docker or install needed)
npm run typecheck
```

## How it is built, and why

**One lock per clinic.** Every request that changes data first takes a row lock on its clinic. Within a
clinic, writes happen one at a time; different clinics never wait on each other. That one rule gives:
no two devices can sell the same last tablets, invoice/claim/queue numbers are gap-free and never repeat,
and the change feed can never skip an entry (below). Measured on a developer laptop over loopback with an embedded
Postgres (so **not a production benchmark**): a bill (stock + invoice + feed) took ~11 ms, which would allow one clinic
~30 bills a second; a clinic does a few a minute. Reads take no lock. A writer that waits more than
`DB_LOCK_TIMEOUT_MS` gets `503 busy`, and overload or an outage (no free connection within
`DB_CONNECT_TIMEOUT_MS`, too many connections, a timed-out statement, the database restarting) also returns
`503` with `Retry-After`, so a sync client knows to retry rather than treating it as a bug.

**Tenants are separated by the database, not just by code.** Every clinic-owned table has `clinic_id`, row-level
security that is enabled **and forced**, and foreign keys on `(clinic_id, id)`, so a row can't even *reference*
another clinic's data. The API role is `NOSUPERUSER NOBYPASSRLS`; the clinic is set per transaction
(`set_config(..., true)`), so a pooled connection can't carry one request's clinic into the next. With no
clinic set, queries return nothing. A test fails if a new clinic table is added without RLS.

**Sync.** Devices keep working offline, queue what they did, and send it later.

- `POST /v1/sync/push` `{ mutations: [{ id, type, payload, createdAt?, offline? }] }` (max 200). `id` is a UUID the
  device makes up; it is the idempotency key. Each mutation is answered on its own:
  `applied` · `rejected` (permanent: drop it, tell the user) · `error` (our fault: nothing recorded, resend; the
  rest of the batch is `skipped` so order is kept). Sending a batch again is harmless: a repeated id gets the
  original answer (`duplicate: true`), including for rejections. The record of "done" is written in the same
  savepoint as the change itself, so the two can never disagree.
- `GET /v1/sync/pull?cursor=N&limit=500` returns changes after `N`, oldest first, with `cursor`, `more` and `head`.
  Entries come from an append-only feed whose numbers are allocated under the clinic lock, so committed numbers
  are consecutive and a pull can never step past a change that commits later. A new device starts at `cursor=0`.

| Mutation | Who | Notes |
| --- | --- | --- |
| `patient.create` / `patient.update` | admin, clinician, receptionist | updates are per field, so two devices editing different fields both keep their edit |
| `patient.erase` | admin | blanks personal details **everywhere they were copied** (the row, earlier change-feed entries, the reasons on their visits) and keeps the row, so bills and claims stay intact. Sex is kept on the row. |
| `appointment.book` / `appointment.advance` | admin, clinician, receptionist | the server assigns the day's queue number; `advance` only moves forward |
| `bill.create` | everyone | server totals it, numbers it (`INV-0001`), deducts stock, drafts a claim for SHA |
| `claim.setStatus` | admin, receptionist | Draft → Submitted → Approved/Rejected only |
| `drug.create` / `drug.update` / `stock.receive` / `service.upsert` | admin, pharmacist | |
| `clinic.rename` | admin | |

**Stock.** FEFO, expired batches never used, every change recorded in an append-only ledger (`stock_movements`)
so a batch's quantity always equals the sum of its movements. A sale from a device that says `offline: true` is
**always accepted** (the tablets were handed over): the real stock is used first, the missing units drive a batch
negative and are flagged, and `GET /v1/stock/oversold` lists them for reconciliation. Online, an oversell is
rejected as `insufficient_stock`. A change's date is when the device made it (if plausible), not when it arrived.

A known gap in that policy: an offline bill is still **permanently rejected** if its M-Pesa code was already used, or if
the patient was erased or lost their SHA number in the meantime, so the device drops the record of a real sale.
A better rule is to accept and flag these the way oversold stock is flagged; that is not done yet.

**Accounts.** Phone number or email + password (scrypt). Short-lived access tokens (15 min) that only say who
is asking; the role, staff status and device status are read from the database on every request, so a demotion
or a revoked tablet takes effect immediately. Refresh tokens rotate and are stored hashed; presenting an old one
again revokes the whole chain. Refresh tokens last 30 days, so a device offline all day just refreshes and syncs.
Login is rate limited per account and address; creating a clinic can require `REGISTRATION_CODE`.

**Audit.** Every applied mutation, sign-in, staff/device change, patient record opened, patient search and full
sync is logged: who, which device, what. Patient details are not copied into it, but the text of a search is (it
could be a name), so treat the log as sensitive too. The log, the change feed, the stock ledger and
mutation results can't be updated or deleted by the API role. Admins read it at `GET /v1/audit`.

## API

All under `/v1`, JSON. Errors are `{ "error": { "code", "message", "details?" } }`.

| | |
| --- | --- |
| `POST /auth/register` `/auth/login` `/auth/refresh` `/auth/logout` | sessions (login also takes the device `{ id: uuid, name }`) |
| `GET /me` | who and which clinic |
| `POST /sync/push` · `GET /sync/pull` | offline sync |
| `GET /patients?q=&limit=&after=` · `GET /patients/:id` | search (name, phone, SHA no.) and record; both audited |
| `GET /drugs` · `GET /stock/oversold` · `GET /bills?before=` · `GET /claims?status=` · `GET /appointments?date=` | reads |
| `GET /staff` `POST /staff` `PATCH /staff/:userId` | admin: add people, change role, deactivate (never the last admin) |
| `GET /devices` · `POST /devices/:id/revoke` | admin: lock out a lost device |
| `GET /audit` | admin |
| `GET /healthz` · `GET /readyz` | liveness / database reachable (no auth) |

## Hosting

Patient data is sensitive personal data under Kenya's Data Protection Act, and I believe the 2021 regulations
require some health processing to happen in Kenya (or keep a serving copy there). **Check this with a Kenyan
data-protection lawyer before choosing a region**; as far as I know no major cloud has a Kenyan region, so plan on
running PostgreSQL yourself at a Kenyan data centre (a Kubernetes operator such as CloudNativePG, or Patroni),
with point-in-time backups to S3-compatible storage and a standby, both in Kenya. Don't put the API behind a
foreign proxy (it would decrypt patient data abroad), and keep patient data out of third-party error trackers,
analytics and email/SMS providers. Set `TRUST_PROXY=true` only behind a proxy you control.

`Dockerfile` and `docker-compose.yml` are provided but **were not run** (no Docker on the machine this was built
on); the compose file is for development, not production. The production bundle itself (`npm run build`, then
`node dist/migrate-cli.js` and `node dist/index.js`) was run against a real PostgreSQL and worked.

## What is not here

- **M-Pesa (Daraja) payments.** Bills accept a typed confirmation code and refuse a reused one, but nothing is
  verified against Safaricom yet. This needs a callback endpoint, a `payments` table and reconciliation.
- **The app is not connected.** It still stores everything on the device. Before it can sync it needs UUID ids,
  a local SQLite store with an outbox, and a sync client. Its privacy policy says nothing leaves the device;
  update it when that changes.
- **Housekeeping:** `changes` grows without limit (add pruning plus a snapshot for new devices before clinics
  have years of history); no password change/reset flow; no per-clinic rate limits; no metrics; claim submission
  to SHA is out of scope.
