import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { addStaff, apply, billPayload, call, createEnv, mut, newDrug, newPatient, registerClinic, rows, type Env, type Session } from './helpers';

let env: Env;
let admin: Session;

beforeAll(async () => {
  env = await createEnv();
  admin = await registerClinic(env);
});
afterAll(() => env.close());

describe('patients', () => {
  it('searches by name, phone or SHA number, ignoring case, and treats wildcards as plain text', async () => {
    await newPatient(env, admin, { name: 'Wanjiru Kamau', phone: '0712345678', sha: 'SHA-4410293' });
    await newPatient(env, admin, { name: 'Otieno Ochieng', phone: '0722111333', sha: 'SHA-2203911' });
    await newPatient(env, admin, { name: '100% Real_Name', phone: '0733555777' });
    const find = async (q: string) => (await call(env, 'GET', `/v1/patients?q=${encodeURIComponent(q)}`, admin.accessToken)).body.patients.map((p: { name: string }) => p.name);

    expect(await find('WANJIRU')).toEqual(['Wanjiru Kamau']);
    expect(await find('0722')).toEqual(['Otieno Ochieng']);
    expect(await find('sha-44')).toEqual(['Wanjiru Kamau']);
    expect(await find('%')).toEqual(['100% Real_Name']); // not "everything"
    expect(await find('_')).toEqual(['100% Real_Name']);
    expect(await find('nobody')).toEqual([]);
  });

  it('pages through everyone in a stable order, without repeats or gaps', async () => {
    const clinic = await registerClinic(env);
    for (let i = 0; i < 7; i++) await newPatient(env, clinic, { name: `Patient ${String(i).padStart(2, '0')}` });
    const seen: string[] = [];
    let after: string | null = null;
    do {
      const res: any = await call(env, 'GET', `/v1/patients?limit=3${after ? `&after=${after}` : ''}`, clinic.accessToken);
      seen.push(...res.body.patients.map((p: { name: string }) => p.name));
      after = res.body.next;
    } while (after);
    expect(seen).toEqual(Array.from({ length: 7 }, (_, i) => `Patient ${String(i).padStart(2, '0')}`));
    expect((await call(env, 'GET', '/v1/patients?after=garbage', clinic.accessToken)).status).toBe(400);
  });

  it('hides erased patients from lists', async () => {
    const clinic = await registerClinic(env);
    const p = await newPatient(env, clinic, { name: 'Soon Gone' });
    await apply(env, clinic, mut('patient.erase', { id: p.id }));
    expect((await call(env, 'GET', '/v1/patients', clinic.accessToken)).body.patients).toEqual([]);
  });

  it('logs who opened a record, and who searched, but not the patients found', async () => {
    const clinic = await registerClinic(env);
    const staff = await addStaff(env, clinic, 'clinician', 'Dr. Mwangi');
    const patient = await newPatient(env, clinic, { name: 'Private Person' });
    await call(env, 'GET', `/v1/patients/${patient.id}`, staff.accessToken);
    await call(env, 'GET', '/v1/patients?q=private', staff.accessToken);

    const audit = (await call(env, 'GET', '/v1/audit?limit=50', clinic.accessToken)).body.entries as { action: string; userName: string; entityId?: string; meta: object }[];
    expect(audit.find((e) => e.action === 'patient.read')).toMatchObject({ userName: 'Dr. Mwangi', entityId: patient.id });
    const search = audit.find((e) => e.action === 'patient.list')!;
    expect(search.meta).toEqual({ search: 'private', count: 1 });
    expect(JSON.stringify(audit)).not.toContain('Private Person'); // names do not leak into the log
  });

  it('shows one patient with their recent visits and bills', async () => {
    const clinic = await registerClinic(env);
    const patient = await newPatient(env, clinic);
    await apply(env, clinic, mut('appointment.book', { id: randomUUID(), patientId: patient.id, date: '2026-10-07', time: '09:00', reason: 'Cough' }));
    await apply(env, clinic, mut('bill.create', billPayload(patient.id as string, [{ name: 'Consultation', qty: 1, price: 1000 }])));
    const res = await call(env, 'GET', `/v1/patients/${patient.id}`, clinic.accessToken);
    expect(res.body.patient.id).toBe(patient.id);
    expect(res.body.visits).toEqual([expect.objectContaining({ reason: 'Cough', queueNo: 1 })]);
    expect(res.body.bills).toEqual([expect.objectContaining({ total: 1000 })]);
    expect((await call(env, 'GET', `/v1/patients/${randomUUID()}`, clinic.accessToken)).status).toBe(404);
    expect((await call(env, 'GET', '/v1/patients/not-a-uuid', clinic.accessToken)).status).toBe(400);
  });
});

describe('pharmacy', () => {
  it('lists drugs with each batch and the total on hand, negative stock included', async () => {
    const clinic = await registerClinic(env);
    const patient = await newPatient(env, clinic);
    const drugId = await newDrug(env, clinic, [[10, 100], [5, 300]]);
    await apply(env, clinic, mut('bill.create', billPayload(patient.id as string, [{ name: 'Amox', qty: 4, price: 15, drugId }])));
    const [drug] = (await call(env, 'GET', '/v1/drugs', clinic.accessToken)).body.drugs;
    expect(drug).toMatchObject({ name: 'Amoxicillin 500mg caps', onHand: 11 });
    expect(drug.batches.map((b: { qty: number }) => b.qty)).toEqual([6, 5]);
  });
});

describe('bills and claims', () => {
  it('lists bills newest first and pages by invoice number, not by text order', async () => {
    const clinic = await registerClinic(env);
    const patient = await newPatient(env, clinic);
    for (let i = 0; i < 5; i++) await apply(env, clinic, mut('bill.create', billPayload(patient.id as string, [{ name: 'Visit', qty: 1, price: 100 * (i + 1) }])));
    // Push the numbering past a digit boundary: as text INV-10000 would sort before INV-9999.
    await rows(env, `UPDATE counters SET value = 9998 WHERE clinic_id = $1 AND name = 'inv'`, [clinic.clinic.id]);
    for (let i = 0; i < 3; i++) await apply(env, clinic, mut('bill.create', billPayload(patient.id as string, [{ name: 'Later', qty: 1, price: 1 }])));

    const numbers: string[] = [];
    let before: number | null = null;
    do {
      const res: any = await call(env, 'GET', `/v1/bills?limit=2${before ? `&before=${before}` : ''}`, clinic.accessToken);
      numbers.push(...res.body.bills.map((b: { number: string }) => b.number));
      before = res.body.next;
    } while (before);
    expect(numbers.slice(0, 3)).toEqual(['INV-10001', 'INV-10000', 'INV-9999']);
    expect(numbers).toHaveLength(8);
  });

  it('filters claims by status', async () => {
    const clinic = await registerClinic(env);
    const insured = await newPatient(env, clinic, { sha: 'SHA-1' });
    await apply(env, clinic, mut('bill.create', billPayload(insured.id as string, [{ name: 'Visit', qty: 1, price: 500 }], { method: 'SHA' })));
    expect((await call(env, 'GET', '/v1/claims?status=Draft', clinic.accessToken)).body.claims).toHaveLength(1);
    expect((await call(env, 'GET', '/v1/claims?status=Approved', clinic.accessToken)).body.claims).toEqual([]);
    expect((await call(env, 'GET', '/v1/claims?status=Bogus', clinic.accessToken)).status).toBe(400);
  });

  it("lists a day's queue in order, defaulting to today in East Africa Time", async () => {
    const clinic = await registerClinic(env);
    const patient = await newPatient(env, clinic);
    for (const reason of ['first', 'second']) {
      await apply(env, clinic, mut('appointment.book', { id: randomUUID(), patientId: patient.id, date: '2026-10-07', time: '09:00', reason }));
    }
    await apply(env, clinic, mut('appointment.book', { id: randomUUID(), patientId: patient.id, date: '2026-10-08', time: '09:00', reason: 'tomorrow' }));
    const today = (await call(env, 'GET', '/v1/appointments', clinic.accessToken)).body.appointments;
    expect(today.map((a: { reason: string }) => a.reason)).toEqual(['first', 'second']);
    expect((await call(env, 'GET', '/v1/appointments?date=2026-10-08', clinic.accessToken)).body.appointments).toHaveLength(1);
    expect((await call(env, 'GET', '/v1/appointments?date=2026-13-45', clinic.accessToken)).status).toBe(400);
  });
});

describe('dates stay dates', () => {
  it('returns calendar days exactly as stored, never shifted by a time zone', async () => {
    const clinic = await registerClinic(env);
    const patient = await newPatient(env, clinic, { dob: '1988-04-12' });
    const res = await call(env, 'GET', `/v1/patients/${patient.id}`, clinic.accessToken);
    expect(res.body.patient.dob).toBe('1988-04-12');
  });
});

describe('service health', () => {
  it('answers liveness and readiness without credentials, and sets security headers', async () => {
    const live = await env.app.inject({ method: 'GET', url: '/healthz' });
    expect(live.statusCode).toBe(200);
    expect(live.headers['x-content-type-options']).toBe('nosniff');
    expect((await env.app.inject({ method: 'GET', url: '/readyz' })).statusCode).toBe(200);
  });

  it('gives unknown endpoints a JSON 404 and oversized bodies a 413', async () => {
    const missing = await env.app.inject({ method: 'GET', url: '/v1/nope' });
    expect(missing.statusCode).toBe(404);
    expect(JSON.parse(missing.body).error.code).toBe('not_found');
    const huge = await env.app.inject({
      method: 'POST',
      url: '/v1/sync/push',
      headers: { authorization: `Bearer ${admin.accessToken}`, 'content-type': 'application/json' },
      payload: JSON.stringify({ mutations: [{ id: randomUUID(), type: 'x', payload: 'x'.repeat(1_200_000) }] }),
    });
    expect(huge.statusCode).toBe(413);
  });

  it('allows browser requests only from listed origins', async () => {
    const strict = await createEnv({ CORS_ORIGINS: 'https://app.example.co.ke' });
    try {
      const allowed = await strict.app.inject({ method: 'OPTIONS', url: '/v1/me', headers: { origin: 'https://app.example.co.ke', 'access-control-request-method': 'GET' } });
      const denied = await strict.app.inject({ method: 'OPTIONS', url: '/v1/me', headers: { origin: 'https://evil.example', 'access-control-request-method': 'GET' } });
      expect(allowed.headers['access-control-allow-origin']).toBe('https://app.example.co.ke');
      expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    } finally {
      await strict.close();
    }
  });
});
