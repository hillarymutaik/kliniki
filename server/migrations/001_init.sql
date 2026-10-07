-- Kliniki schema, version 1.
--
-- {{APP_ROLE}} is replaced with the name of the unprivileged role the API connects as (kliniki_app by default).
--
-- Conventions
--   * Every clinic-owned table leads its primary key with clinic_id, and child tables reference their
--     parent through (clinic_id, id). A row can therefore never point at another clinic's data.
--   * Row-level security is enabled AND forced on every clinic-owned table. The API connects as the
--     non-superuser role "{{APP_ROLE}}" and sets app.clinic_id for each transaction; with no tenant set
--     it sees nothing.
--   * Money is whole Kenyan shillings in integer columns. Dates are `date` (EAT calendar days), instants
--     are timestamptz.
--   * Ids that devices create while offline are uuids.

-- ---------------------------------------------------------------- tenant helper

CREATE FUNCTION app_clinic_id() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT nullif(current_setting('app.clinic_id', true), '')::uuid $$;

-- ---------------------------------------------------------------- accounts

CREATE TABLE clinics (
  id          uuid PRIMARY KEY,
  name        text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- People and their membership of a clinic carry no patient data, so they are not row-secured: login has
-- to find them before it knows which clinic is asking. The API always filters these by user.
CREATE TABLE users (
  id             uuid PRIMARY KEY,
  login          text NOT NULL UNIQUE CHECK (login = lower(login)),
  name           text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  password_hash  text NOT NULL,
  disabled_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  clinic_id   uuid NOT NULL REFERENCES clinics ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('admin', 'clinician', 'receptionist', 'pharmacist')),
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clinic_id, user_id)
);
CREATE INDEX memberships_user_idx ON memberships (user_id);

CREATE TABLE devices (
  clinic_id     uuid NOT NULL REFERENCES clinics ON DELETE CASCADE,
  id            uuid NOT NULL,
  user_id       uuid NOT NULL REFERENCES users,
  name          text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz,
  revoked_at    timestamptz,
  PRIMARY KEY (clinic_id, id)
);

-- Only hashes are stored. family_id ties together a chain of rotated tokens so that reuse of an old
-- one can revoke the whole chain.
CREATE TABLE refresh_tokens (
  id          uuid PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  clinic_id   uuid NOT NULL,
  device_id   uuid NOT NULL,
  family_id   uuid NOT NULL,
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (clinic_id, device_id) REFERENCES devices (clinic_id, id) ON DELETE CASCADE
);
CREATE INDEX refresh_tokens_family_idx ON refresh_tokens (family_id);
CREATE INDEX refresh_tokens_device_idx ON refresh_tokens (clinic_id, device_id);

-- ---------------------------------------------------------------- clinical and commercial data

CREATE TABLE patients (
  clinic_id   uuid NOT NULL REFERENCES clinics ON DELETE CASCADE,
  id          uuid NOT NULL,
  name        text NOT NULL,
  phone       text NOT NULL,
  dob         date NOT NULL,
  sex         text NOT NULL CHECK (sex IN ('F', 'M')),
  sha         text NOT NULL DEFAULT '',
  allergies   text NOT NULL DEFAULT '',
  erased_at   timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES users,
  PRIMARY KEY (clinic_id, id)
);
CREATE INDEX patients_name_idx ON patients (clinic_id, lower(name), id);
CREATE INDEX patients_phone_idx ON patients (clinic_id, phone);

CREATE TABLE services (
  clinic_id   uuid NOT NULL REFERENCES clinics ON DELETE CASCADE,
  id          uuid NOT NULL,
  name        text NOT NULL,
  price       integer NOT NULL CHECK (price >= 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clinic_id, id)
);

CREATE TABLE drugs (
  clinic_id   uuid NOT NULL REFERENCES clinics ON DELETE CASCADE,
  id          uuid NOT NULL,
  name        text NOT NULL,
  unit        text NOT NULL,
  price       integer NOT NULL CHECK (price >= 0),
  reorder     integer NOT NULL CHECK (reorder >= 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clinic_id, id)
);

-- qty may go negative: a sale made on an offline device is a fact, so it is recorded even if another
-- device sold the same stock meanwhile, and the shortfall is surfaced for reconciliation instead.
CREATE TABLE stock_batches (
  clinic_id   uuid NOT NULL REFERENCES clinics ON DELETE CASCADE,
  id          uuid NOT NULL,
  drug_id     uuid NOT NULL,
  batch_no    text NOT NULL,
  exp         date NOT NULL,
  qty         integer NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clinic_id, id),
  FOREIGN KEY (clinic_id, drug_id) REFERENCES drugs (clinic_id, id)
);
CREATE INDEX stock_batches_drug_idx ON stock_batches (clinic_id, drug_id, exp);

-- Append-only ledger: batch qty always equals the sum of its movements.
CREATE TABLE stock_movements (
  clinic_id   uuid NOT NULL REFERENCES clinics ON DELETE CASCADE,
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  drug_id     uuid NOT NULL,
  batch_id    uuid NOT NULL,
  delta       integer NOT NULL CHECK (delta <> 0),
  reason      text NOT NULL CHECK (reason IN ('receipt', 'dispense', 'adjustment')),
  bill_id     uuid,
  oversold    boolean NOT NULL DEFAULT false,
  created_by  uuid REFERENCES users,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clinic_id, id),
  FOREIGN KEY (clinic_id, batch_id) REFERENCES stock_batches (clinic_id, id)
);
CREATE INDEX stock_movements_batch_idx ON stock_movements (clinic_id, batch_id);
CREATE INDEX stock_movements_oversold_idx ON stock_movements (clinic_id, created_at) WHERE oversold;

CREATE TABLE appointments (
  clinic_id   uuid NOT NULL REFERENCES clinics ON DELETE CASCADE,
  id          uuid NOT NULL,
  patient_id  uuid NOT NULL,
  date        date NOT NULL,
  time        text NOT NULL CHECK (time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  reason      text NOT NULL,
  status      text NOT NULL CHECK (status IN ('waiting', 'consult', 'done')),
  queue_no    integer NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clinic_id, id),
  FOREIGN KEY (clinic_id, patient_id) REFERENCES patients (clinic_id, id),
  UNIQUE (clinic_id, date, queue_no)
);
CREATE INDEX appointments_date_idx ON appointments (clinic_id, date, queue_no);
CREATE INDEX appointments_patient_idx ON appointments (clinic_id, patient_id, date DESC);

CREATE TABLE bills (
  clinic_id          uuid NOT NULL REFERENCES clinics ON DELETE CASCADE,
  id                 uuid NOT NULL,
  number             text NOT NULL,
  -- The number's counter value, kept as an integer so lists sort INV-9999 before INV-10000.
  seq                bigint NOT NULL,
  patient_id         uuid NOT NULL,
  date               date NOT NULL,
  method             text NOT NULL CHECK (method IN ('M-Pesa', 'Cash', 'SHA')),
  ref                text NOT NULL DEFAULT '',
  total              integer NOT NULL CHECK (total >= 0),
  device_id          uuid,
  client_created_at  timestamptz,
  created_by         uuid REFERENCES users,
  created_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clinic_id, id),
  FOREIGN KEY (clinic_id, patient_id) REFERENCES patients (clinic_id, id),
  UNIQUE (clinic_id, number),
  UNIQUE (clinic_id, seq)
);
-- One M-Pesa confirmation code pays for one bill.
CREATE UNIQUE INDEX bills_mpesa_ref_idx ON bills (clinic_id, ref) WHERE method = 'M-Pesa';
CREATE INDEX bills_date_idx ON bills (clinic_id, date DESC, seq DESC);
CREATE INDEX bills_patient_idx ON bills (clinic_id, patient_id, date DESC);

CREATE TABLE bill_lines (
  clinic_id  uuid NOT NULL,
  bill_id    uuid NOT NULL,
  line_no    smallint NOT NULL,
  name       text NOT NULL,
  qty        integer NOT NULL CHECK (qty >= 1),
  price      integer NOT NULL CHECK (price >= 0),
  drug_id    uuid,
  PRIMARY KEY (clinic_id, bill_id, line_no),
  FOREIGN KEY (clinic_id, bill_id) REFERENCES bills (clinic_id, id) ON DELETE CASCADE
);

CREATE TABLE claims (
  clinic_id   uuid NOT NULL REFERENCES clinics ON DELETE CASCADE,
  id          uuid NOT NULL,
  number      text NOT NULL,
  seq         bigint NOT NULL,
  patient_id  uuid NOT NULL,
  bill_id     uuid,
  date        date NOT NULL,
  amount      integer NOT NULL CHECK (amount >= 0),
  status      text NOT NULL CHECK (status IN ('Draft', 'Submitted', 'Approved', 'Rejected')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clinic_id, id),
  FOREIGN KEY (clinic_id, patient_id) REFERENCES patients (clinic_id, id),
  FOREIGN KEY (clinic_id, bill_id) REFERENCES bills (clinic_id, id),
  UNIQUE (clinic_id, number),
  UNIQUE (clinic_id, seq)
);
CREATE INDEX claims_status_idx ON claims (clinic_id, status, date DESC);

-- ---------------------------------------------------------------- sync machinery

-- Named counters: seq (change feed), inv, clm, and queue:YYYY-MM-DD. They are only ever advanced by a
-- transaction that holds the clinic's write lock, so values never interleave or skip.
CREATE TABLE counters (
  clinic_id  uuid NOT NULL REFERENCES clinics ON DELETE CASCADE,
  name       text NOT NULL,
  value      bigint NOT NULL,
  PRIMARY KEY (clinic_id, name)
);

-- The change feed devices pull from. seq is allocated from counters under the clinic lock, so committed
-- seq values form a gapless prefix and a pull can never step past a change that commits later.
CREATE TABLE changes (
  clinic_id  uuid NOT NULL REFERENCES clinics ON DELETE CASCADE,
  seq        bigint NOT NULL,
  entity     text NOT NULL,
  entity_id  text NOT NULL,
  op         text NOT NULL CHECK (op IN ('upsert', 'delete')),
  data       jsonb NOT NULL,
  at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clinic_id, seq)
);

-- One row per mutation a device has pushed, written in the same savepoint as its effects. Replaying a
-- mutation id returns the stored result instead of doing the work twice.
CREATE TABLE applied_mutations (
  clinic_id   uuid NOT NULL REFERENCES clinics ON DELETE CASCADE,
  id          uuid NOT NULL,
  type        text NOT NULL,
  status      text NOT NULL CHECK (status IN ('applied', 'rejected')),
  result      jsonb NOT NULL,
  device_id   uuid,
  applied_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clinic_id, id)
);

CREATE TABLE audit_log (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  clinic_id  uuid NOT NULL REFERENCES clinics ON DELETE CASCADE,
  user_id    uuid,
  device_id  uuid,
  action     text NOT NULL,
  entity     text,
  entity_id  text,
  meta       jsonb NOT NULL DEFAULT '{}',
  at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_clinic_idx ON audit_log (clinic_id, at DESC, id DESC);

-- ---------------------------------------------------------------- row-level security

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'clinics', 'devices', 'patients', 'services', 'drugs', 'stock_batches', 'stock_movements',
    'appointments', 'bills', 'bill_lines', 'claims', 'counters', 'changes', 'applied_mutations', 'audit_log'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    -- FORCE makes the table owner obey the policy too, so a mistake in connecting as the owner
    -- cannot silently bypass tenant isolation.
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    IF t = 'clinics' THEN
      EXECUTE 'CREATE POLICY tenant ON clinics USING (id = app_clinic_id()) WITH CHECK (id = app_clinic_id())';
    ELSE
      EXECUTE format(
        'CREATE POLICY tenant ON %I USING (clinic_id = app_clinic_id()) WITH CHECK (clinic_id = app_clinic_id())', t);
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------- privileges for the API role

GRANT USAGE ON SCHEMA public TO {{APP_ROLE}};
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO {{APP_ROLE}};
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO {{APP_ROLE}};
-- Records the API must never rewrite: the ledger, the change feed, applied-mutation results, the audit
-- trail. (Pruning old feed rows is a maintenance job that runs as the owner.)
REVOKE UPDATE, DELETE ON stock_movements, changes, applied_mutations, audit_log FROM {{APP_ROLE}};
