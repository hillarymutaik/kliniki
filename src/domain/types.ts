export type Sex = 'F' | 'M';
export type ApptStatus = 'waiting' | 'consult' | 'done';
export type PayMethod = 'M-Pesa' | 'Cash' | 'SHA';
export type ClaimStatus = 'Draft' | 'Submitted' | 'Approved' | 'Rejected';

export const PAY_METHODS: readonly PayMethod[] = ['M-Pesa', 'Cash', 'SHA'];

export interface Patient {
  id: string;
  name: string;
  phone: string;
  /** YYYY-MM-DD */
  dob: string;
  sex: Sex;
  /** Empty for cash patients. */
  sha: string;
  /** Free text, empty when none are known. */
  allergies: string;
}

export interface Batch {
  no: string;
  qty: number;
  /** YYYY-MM-DD */
  exp: string;
}

export interface Drug {
  id: string;
  name: string;
  unit: string;
  /** Selling price in KES per unit. */
  price: number;
  reorder: number;
  batches: Batch[];
}

export interface Service {
  id: string;
  name: string;
  price: number;
}

export interface Appointment {
  id: string;
  patientId: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM, 24h, EAT */
  time: string;
  reason: string;
  status: ApptStatus;
  /** Queue number, counted per day. */
  queueNo: number;
}

export interface BillLine {
  name: string;
  qty: number;
  price: number;
  /** Set when the line dispenses a drug, so stock can be deducted. */
  drugId?: string;
}

export interface Bill {
  id: string;
  /** INV-0001 */
  no: string;
  patientId: string;
  date: string;
  lines: BillLine[];
  method: PayMethod;
  /** M-Pesa confirmation code, empty for other methods. */
  ref: string;
  total: number;
}

export interface Claim {
  id: string;
  /** CLM-0001 */
  no: string;
  patientId: string;
  date: string;
  amount: number;
  status: ClaimStatus;
  billId: string | null;
}

export interface AppData {
  clinic: string;
  patients: Patient[];
  drugs: Drug[];
  services: Service[];
  appointments: Appointment[];
  bills: Bill[];
  claims: Claim[];
}

/** Everything a domain action needs from the outside world, injected so tests are deterministic. */
export interface Ctx {
  /** Today in EAT, YYYY-MM-DD. */
  today: string;
  newId: () => string;
}
