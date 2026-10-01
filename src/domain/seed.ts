import { addDays } from './dates';
import type { AppData } from './types';

/** Demo data a fresh install starts with. Ids are fixed so the data is the same on every device. */
export function seedData(today: string): AppData {
  const patients: AppData['patients'] = [
    { id: 'pat-1', name: 'Wanjiru Kamau', phone: '0712345678', dob: '1988-04-12', sex: 'F', sha: 'SHA-4410293', allergies: 'Penicillin' },
    { id: 'pat-2', name: 'Otieno Ochieng', phone: '0722111333', dob: '1975-09-30', sex: 'M', sha: 'SHA-2203911', allergies: '' },
    { id: 'pat-3', name: 'Amina Hassan', phone: '0733555777', dob: '2016-01-05', sex: 'F', sha: '', allergies: '' },
    { id: 'pat-4', name: 'Kiprono Rotich', phone: '0701999888', dob: '1993-11-18', sex: 'M', sha: 'SHA-7781002', allergies: 'Sulfa' },
  ];

  const drugs: AppData['drugs'] = [
    { id: 'drg-1', name: 'Amoxicillin 500mg caps', unit: 'caps', price: 15, reorder: 100, batches: [{ no: 'AMX-231', qty: 420, exp: addDays(today, 240) }] },
    { id: 'drg-2', name: 'Paracetamol 500mg tabs', unit: 'tabs', price: 5, reorder: 200, batches: [{ no: 'PCM-118', qty: 150, exp: addDays(today, 400) }] },
    { id: 'drg-3', name: 'Artemether/Lumefantrine 20/120', unit: 'packs', price: 350, reorder: 20, batches: [{ no: 'AL-552', qty: 38, exp: addDays(today, 45) }] },
    { id: 'drg-4', name: 'ORS sachets', unit: 'sachets', price: 30, reorder: 50, batches: [{ no: 'ORS-09', qty: 210, exp: addDays(today, 600) }] },
    { id: 'drg-5', name: 'Metformin 500mg tabs', unit: 'tabs', price: 8, reorder: 150, batches: [{ no: 'MET-77', qty: 90, exp: addDays(today, 20) }] },
  ];

  const services: AppData['services'] = [
    { id: 'svc-1', name: 'Consultation', price: 1000 },
    { id: 'svc-2', name: 'Malaria RDT', price: 400 },
    { id: 'svc-3', name: 'Full haemogram', price: 800 },
    { id: 'svc-4', name: 'Dressing', price: 500 },
  ];

  return {
    clinic: 'Afya Bora Medical Centre',
    patients,
    drugs,
    services,
    appointments: [
      { id: 'apt-1', patientId: 'pat-1', date: today, time: '09:00', reason: 'Fever, headache', status: 'done', queueNo: 1 },
      { id: 'apt-2', patientId: 'pat-2', date: today, time: '09:30', reason: 'BP review', status: 'consult', queueNo: 2 },
      { id: 'apt-3', patientId: 'pat-3', date: today, time: '10:15', reason: 'Diarrhoea', status: 'waiting', queueNo: 3 },
    ],
    bills: [
      {
        id: 'bill-1',
        no: 'INV-0001',
        patientId: 'pat-1',
        date: today,
        lines: [
          { name: 'Consultation', qty: 1, price: 1000 },
          { name: 'Malaria RDT', qty: 1, price: 400 },
          { name: 'Artemether/Lumefantrine 20/120', qty: 1, price: 350, drugId: 'drg-3' },
        ],
        method: 'M-Pesa',
        ref: 'SIJ4K2LQ8P',
        total: 1750,
      },
    ],
    claims: [
      { id: 'clm-1', no: 'CLM-0001', patientId: 'pat-4', date: addDays(today, -3), amount: 2400, status: 'Submitted', billId: null },
    ],
  };
}
