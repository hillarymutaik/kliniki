import AsyncStorage from '@react-native-async-storage/async-storage';

import { today } from '@/domain/dates';
import { seedData } from '@/domain/seed';

import { isAppData, STORAGE_KEY, useKlinikiStore } from './store';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const state = () => useKlinikiStore.getState();
const stored = async () => JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) ?? 'null');

const patientForm = {
  name: 'Njeri Mwangi',
  phone: '0711222333',
  dob: '1990-06-15',
  sex: 'F' as const,
  sha: '',
  allergies: '',
  consent: true,
};

beforeEach(async () => {
  await AsyncStorage.clear();
  useKlinikiStore.setState({ data: seedData(today()) });
});

describe('isAppData', () => {
  it('accepts the demo data', () => {
    expect(isAppData(seedData('2026-10-01'))).toBe(true);
  });

  it('rejects anything that is not the expected shape', () => {
    expect(isAppData(null)).toBe(false);
    expect(isAppData('data')).toBe(false);
    expect(isAppData({})).toBe(false);
    expect(isAppData({ ...seedData('2026-10-01'), bills: 'none' })).toBe(false);
    expect(isAppData({ ...seedData('2026-10-01'), clinic: 5 })).toBe(false);
  });
});

describe('actions', () => {
  it('keeps the new data when an action succeeds', () => {
    const result = state().actions.registerPatient(patientForm);
    expect(result.ok).toBe(true);
    expect(state().data.patients).toHaveLength(5);
  });

  it('leaves the data alone when an action fails', () => {
    const before = state().data;
    const result = state().actions.registerPatient({ ...patientForm, phone: 'abc' });
    expect(result.ok).toBe(false);
    expect(state().data).toBe(before);
  });

  it('keeps one stable actions object, so selecting it never re-renders', () => {
    const first = state().actions;
    state().actions.registerPatient(patientForm);
    expect(state().actions).toBe(first);
  });

  it('renames the clinic, and refuses a blank name', () => {
    expect(state().actions.renameClinic(' Tumaini Clinic ').ok).toBe(true);
    expect(state().data.clinic).toBe('Tumaini Clinic');
    expect(state().actions.renameClinic('  ').ok).toBe(false);
    expect(state().data.clinic).toBe('Tumaini Clinic');
  });

  it('erases patient records but keeps the pharmacy', () => {
    state().actions.erasePatientRecords();
    expect(state().data.patients).toHaveLength(0);
    expect(state().data.bills).toHaveLength(0);
    expect(state().data.drugs).toHaveLength(5);
  });

  it('resets to the demo data', () => {
    state().actions.registerPatient(patientForm);
    state().actions.resetDemoData();
    expect(state().data.patients).toHaveLength(4);
  });
});

describe('persistence', () => {
  it('saves under the kliniki_v1 key without the actions or the ready flag', async () => {
    state().actions.registerPatient(patientForm);
    const saved = await stored();
    expect(saved.version).toBe(1);
    expect(saved.state.data.patients).toHaveLength(5);
    expect(Object.keys(saved.state)).toEqual(['data']);
  });

  it('restores saved data on rehydrate and becomes ready', async () => {
    const saved = { ...seedData(today()), clinic: 'Saved Clinic' };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { data: saved }, version: 1 }));
    await useKlinikiStore.persist.rehydrate();
    expect(state().data.clinic).toBe('Saved Clinic');
    expect(state().ready).toBe(true);
  });

  it('ignores saved data of the wrong shape', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { data: { clinic: 5 } }, version: 1 }));
    await useKlinikiStore.persist.rehydrate();
    expect(state().data.clinic).toBe('Afya Bora Medical Centre');
    expect(state().ready).toBe(true);
  });

  it('still starts when storage holds invalid JSON', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    useKlinikiStore.setState({ ready: false });
    await AsyncStorage.setItem(STORAGE_KEY, '{not json');
    await useKlinikiStore.persist.rehydrate();
    expect(state().ready).toBe(true);
    expect(state().data.patients).toHaveLength(4);
    warn.mockRestore();
  });

  it('still starts, and keeps working, when storage itself fails', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    useKlinikiStore.setState({ ready: false });
    const getItem = jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('blocked'));
    await useKlinikiStore.persist.rehydrate();
    expect(state().ready).toBe(true);

    const setItem = jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('quota'));
    expect(state().actions.registerPatient(patientForm).ok).toBe(true);
    await Promise.resolve();
    expect(state().data.patients).toHaveLength(5);

    getItem.mockRestore();
    setItem.mockRestore();
    warn.mockRestore();
  });
});
