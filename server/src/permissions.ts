export const ROLES = ['admin', 'clinician', 'receptionist', 'pharmacist'] as const;
export type Role = (typeof ROLES)[number];

export type Permission =
  | 'patients.write'
  | 'patients.erase'
  | 'appointments.write'
  | 'bills.create'
  | 'pharmacy.write'
  | 'claims.update'
  | 'clinic.manage'
  | 'staff.manage'
  | 'audit.read';

// Who may do what. Everyone on staff can read clinic data (a pharmacist needs allergies, a receptionist
// needs stock), so reads are not listed; this is the table for changes.
const GRANTS: Record<Permission, readonly Role[]> = {
  'patients.write': ['admin', 'clinician', 'receptionist'],
  'patients.erase': ['admin'],
  'appointments.write': ['admin', 'clinician', 'receptionist'],
  'bills.create': ['admin', 'clinician', 'receptionist', 'pharmacist'],
  'pharmacy.write': ['admin', 'pharmacist'],
  'claims.update': ['admin', 'receptionist'],
  'clinic.manage': ['admin'],
  'staff.manage': ['admin'],
  'audit.read': ['admin'],
};

export const can = (role: Role, permission: Permission) => GRANTS[permission].includes(role);
