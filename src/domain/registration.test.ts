import { advanceAppointment, bookAppointment, nextQueueNumber } from './appointments';
import { addDays } from './dates';
import { addDrug, receiveStock, searchDrugs, type DrugForm } from './drugs';
import { registerPatient, searchPatients, updatePatient, type PatientForm } from './patients';
import { expectOk, freshData, makeCtx, TODAY } from './testing';

const patientForm = (overrides: Partial<PatientForm> = {}): PatientForm => ({
  name: 'Njeri Mwangi',
  phone: '0711222333',
  dob: '1990-06-15',
  sex: 'F',
  sha: '',
  allergies: '',
  consent: true,
  ...overrides,
});

describe('registerPatient', () => {
  it('adds the patient with trimmed fields and a normalised phone number', () => {
    const data = freshData();
    const { data: next, patient } = expectOk(
      registerPatient(data, patientForm({ name: '  Njeri Mwangi ', phone: '0711 222 333', sha: ' SHA-1 ' }), makeCtx()),
    );
    expect(patient).toMatchObject({ id: 'id-1', name: 'Njeri Mwangi', phone: '0711222333', sha: 'SHA-1' });
    expect(next.patients).toHaveLength(5);
    expect(data.patients).toHaveLength(4);
  });

  it('uses the prototype wording for a bad phone number', () => {
    const result = registerPatient(freshData(), patientForm({ phone: '12345' }), makeCtx());
    expect(result).toEqual({
      ok: false,
      errors: { phone: 'Enter a valid Kenyan phone number, e.g. 0712345678.' },
    });
  });

  it('accepts both 07 and 01 mobile prefixes and nothing else', () => {
    const ok = (phone: string) => registerPatient(freshData(), patientForm({ phone }), makeCtx()).ok;
    expect(ok('0712345678')).toBe(true);
    expect(ok('0112345678')).toBe(true);
    expect(ok('0212345678')).toBe(false);
    expect(ok('+254712345678')).toBe(false);
    expect(ok('071234567')).toBe(false);
  });

  it('requires a name, a valid date of birth and consent', () => {
    const result = registerPatient(
      freshData(),
      patientForm({ name: '   ', dob: '', consent: false }),
      makeCtx(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(['consent', 'dob', 'name']);
  });

  it('rejects a date of birth in the future or before 1900', () => {
    const future = registerPatient(freshData(), patientForm({ dob: addDays(TODAY, 1) }), makeCtx());
    expect(future).toMatchObject({ ok: false, errors: { dob: 'Date of birth cannot be in the future.' } });
    expect(registerPatient(freshData(), patientForm({ dob: '1850-01-01' }), makeCtx()).ok).toBe(false);
    expect(registerPatient(freshData(), patientForm({ dob: '2020-02-30' }), makeCtx()).ok).toBe(false);
  });
});

describe('updatePatient', () => {
  it('edits in place without asking for consent again', () => {
    const data = freshData();
    const { data: next } = expectOk(
      updatePatient(data, 'pat-3', patientForm({ name: 'Amina H. Hassan', sha: 'SHA-9', consent: false }), makeCtx()),
    );
    expect(next.patients.find((p) => p.id === 'pat-3')).toMatchObject({ name: 'Amina H. Hassan', sha: 'SHA-9' });
    expect(next.patients).toHaveLength(4);
  });

  it('fails for a patient that does not exist', () => {
    const result = updatePatient(freshData(), 'ghost', patientForm(), makeCtx());
    expect(result).toEqual({ ok: false, errors: { _form: 'Patient not found.' } });
  });
});

describe('searchPatients', () => {
  const { patients } = freshData();

  it('matches name, phone and SHA number, ignoring case', () => {
    expect(searchPatients(patients, 'wanjiru').map((p) => p.id)).toEqual(['pat-1']);
    expect(searchPatients(patients, '0733').map((p) => p.id)).toEqual(['pat-3']);
    expect(searchPatients(patients, 'sha-22').map((p) => p.id)).toEqual(['pat-2']);
  });

  it('returns everyone for a blank query and no one for a miss', () => {
    expect(searchPatients(patients, '  ')).toHaveLength(4);
    expect(searchPatients(patients, 'zzz')).toHaveLength(0);
  });
});

describe('appointments and the queue', () => {
  it('numbers each day on its own, one past the visits already booked', () => {
    const data = freshData();
    expect(nextQueueNumber(data.appointments, TODAY)).toBe(4);
    expect(nextQueueNumber(data.appointments, addDays(TODAY, 1))).toBe(1);
  });

  it('books a walk-in at the back of the queue as waiting', () => {
    const { appointment, data } = expectOk(
      bookAppointment(
        freshData(),
        { patientId: 'pat-4', date: TODAY, time: '11:00', reason: ' Cough ' },
        makeCtx(),
      ),
    );
    expect(appointment).toMatchObject({ queueNo: 4, status: 'waiting', reason: 'Cough' });
    expect(data.appointments).toHaveLength(4);
  });

  it('validates patient, date, time and reason', () => {
    const result = bookAppointment(
      freshData(),
      { patientId: 'nobody', date: '2026-02-31', time: '25:00', reason: '' },
      makeCtx(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(['date', 'patientId', 'reason', 'time']);
  });

  it('moves a patient waiting, then in consultation, then seen, and stops there', () => {
    let data = freshData();
    const id = 'apt-3';
    expect(data.appointments.find((a) => a.id === id)?.status).toBe('waiting');
    data = expectOk(advanceAppointment(data, id)).data;
    expect(data.appointments.find((a) => a.id === id)?.status).toBe('consult');
    data = expectOk(advanceAppointment(data, id)).data;
    expect(data.appointments.find((a) => a.id === id)?.status).toBe('done');
    expect(advanceAppointment(data, id)).toEqual({
      ok: false,
      errors: { _form: 'This patient has already been seen.' },
    });
  });
});

describe('drugs', () => {
  const drugForm = (overrides: Partial<DrugForm> = {}): DrugForm => ({
    name: 'Ibuprofen 400mg tabs',
    unit: 'tabs',
    price: '12',
    reorder: '50',
    batchNo: 'IBU-1',
    qty: '300',
    exp: addDays(TODAY, 365),
    ...overrides,
  });

  it('adds a drug with its first batch', () => {
    const { drug, data } = expectOk(addDrug(freshData(), drugForm(), makeCtx()));
    expect(drug).toMatchObject({ name: 'Ibuprofen 400mg tabs', price: 12, reorder: 50 });
    expect(drug.batches).toEqual([{ no: 'IBU-1', qty: 300, exp: addDays(TODAY, 365) }]);
    expect(data.drugs).toHaveLength(6);
  });

  it('rejects a batch that has already expired, with the prototype wording', () => {
    for (const exp of [addDays(TODAY, -1), TODAY]) {
      const result = addDrug(freshData(), drugForm({ exp }), makeCtx());
      expect(result).toEqual({
        ok: false,
        errors: { exp: 'This batch has already expired. Check the expiry date.' },
      });
    }
  });

  it('insists on whole numbers where the form uses number inputs', () => {
    const result = addDrug(freshData(), drugForm({ price: '12.5', reorder: '-1', qty: '0' }), makeCtx());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(['price', 'qty', 'reorder']);
  });

  it('receives a new batch onto an existing drug', () => {
    const { drug, batch } = expectOk(
      receiveStock(freshData(), 'drg-2', { batchNo: 'PCM-200', qty: '500', exp: addDays(TODAY, 700) }, makeCtx()),
    );
    expect(batch).toEqual({ no: 'PCM-200', qty: 500, exp: addDays(TODAY, 700) });
    expect(drug.batches).toHaveLength(2);
  });

  it('refuses expired or unknown stock receipts', () => {
    const expired = receiveStock(freshData(), 'drg-2', { batchNo: 'X', qty: '5', exp: TODAY }, makeCtx());
    expect(expired.ok).toBe(false);
    const unknown = receiveStock(freshData(), 'nope', { batchNo: 'X', qty: '5', exp: addDays(TODAY, 9) }, makeCtx());
    expect(unknown).toEqual({ ok: false, errors: { _form: 'Drug not found.' } });
  });

  it('searches the formulary by name', () => {
    const { drugs } = freshData();
    expect(searchDrugs(drugs, 'amox').map((d) => d.id)).toEqual(['drg-1']);
    expect(searchDrugs(drugs, 'TABS').map((d) => d.id)).toEqual(['drg-2', 'drg-5']);
  });
});
