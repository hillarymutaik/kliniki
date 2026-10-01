import { fail, ok, type Result } from './result';
import type { AppData, Claim, ClaimStatus } from './types';

/** A claim only moves forward: drafted, submitted, then decided. */
const NEXT: Record<ClaimStatus, readonly ClaimStatus[]> = {
  Draft: ['Submitted'],
  Submitted: ['Approved', 'Rejected'],
  Approved: [],
  Rejected: [],
};

export const nextClaimStatuses = (status: ClaimStatus): readonly ClaimStatus[] => NEXT[status];

export function setClaimStatus(
  data: AppData,
  id: string,
  status: ClaimStatus,
): Result<{ data: AppData; claim: Claim }> {
  const current = data.claims.find((c) => c.id === id);
  if (!current) return fail({ _form: 'Claim not found.' });
  if (!NEXT[current.status].includes(status)) {
    return fail({ _form: `A claim that is ${current.status.toLowerCase()} cannot be marked ${status.toLowerCase()}.` });
  }
  const claim: Claim = { ...current, status };
  return ok({ data: { ...data, claims: data.claims.map((c) => (c.id === id ? claim : c)) }, claim });
}
