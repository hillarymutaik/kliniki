import { erasePatientRecords, exportAllData, renameClinic } from './clinic';
import { greeting, initials, validateProfile } from './profile';
import { expectOk, freshData } from './testing';

describe('renameClinic', () => {
  it('trims and saves the name', () => {
    const { data } = expectOk(renameClinic(freshData(), '  Tumaini Clinic '));
    expect(data.clinic).toBe('Tumaini Clinic');
  });

  it('rejects blank and over-long names and leaves the data alone', () => {
    expect(renameClinic(freshData(), '   ')).toEqual({ ok: false, errors: { name: 'Enter the clinic name.' } });
    expect(renameClinic(freshData(), 'x'.repeat(81)).ok).toBe(false);
    expect(renameClinic(freshData(), 'x'.repeat(80)).ok).toBe(true);
  });
});

describe('erasePatientRecords', () => {
  it('removes patients, visits, bills and claims but keeps the pharmacy and services', () => {
    const before = freshData();
    const after = erasePatientRecords(before);
    expect([after.patients, after.appointments, after.bills, after.claims].map((l) => l.length)).toEqual([0, 0, 0, 0]);
    expect(after.drugs).toEqual(before.drugs);
    expect(after.services).toEqual(before.services);
    expect(after.clinic).toBe(before.clinic);
    expect(before.patients).toHaveLength(4);
  });
});

describe('exportAllData', () => {
  it('round-trips through JSON', () => {
    const data = freshData();
    expect(JSON.parse(exportAllData(data))).toEqual(data);
  });
});

describe('validateProfile', () => {
  it('cleans up the name and keeps the role', () => {
    expect(validateProfile({ name: '  Wanjiru   Kamau ', role: 'Clinician' })).toEqual({
      ok: true,
      value: { name: 'Wanjiru Kamau', role: 'Clinician' },
    });
  });

  it('needs a name and a known role', () => {
    expect(validateProfile({ name: ' ', role: 'Clinician' })).toEqual({ ok: false, errors: { name: 'Enter your name.' } });
    expect(validateProfile({ name: 'A', role: 'Boss' as never }).ok).toBe(false);
    expect(validateProfile({ name: 'x'.repeat(61), role: 'Clinician' }).ok).toBe(false);
  });
});

describe('initials and greeting', () => {
  it('uses first and last word', () => {
    expect(initials('Wanjiru Kamau')).toBe('WK');
    expect(initials('wanjiru wa kamau')).toBe('WK');
    expect(initials('Otieno')).toBe('O');
    expect(initials('  ')).toBe('?');
  });

  it('greets by the EAT hour', () => {
    expect(greeting('00:30')).toBe('Good morning');
    expect(greeting('11:59')).toBe('Good morning');
    expect(greeting('12:00')).toBe('Good afternoon');
    expect(greeting('16:59')).toBe('Good afternoon');
    expect(greeting('17:00')).toBe('Good evening');
  });
});
