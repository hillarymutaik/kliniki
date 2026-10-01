import { StyleSheet, View } from 'react-native';

import { hasExpiredStock, hasExpiringStock, stockStatus } from '@/domain/stock';
import type { ApptStatus, ClaimStatus, Drug, PayMethod } from '@/domain/types';

import { Tag, type Tone } from '../ui/Tag';

const APPT: Record<ApptStatus, { tone: Tone; label: string }> = {
  waiting: { tone: 'amber', label: 'Waiting' },
  consult: { tone: 'blue', label: 'In consultation' },
  done: { tone: 'green', label: 'Seen' },
};

const CLAIM: Record<ClaimStatus, Tone> = { Draft: 'amber', Submitted: 'blue', Approved: 'green', Rejected: 'red' };

const PAY: Record<PayMethod, Tone> = { 'M-Pesa': 'green', Cash: 'blue', SHA: 'amber' };

export function ApptStatusTag({ status }: { status: ApptStatus }) {
  return <Tag tone={APPT[status].tone}>{APPT[status].label}</Tag>;
}

export function ClaimStatusTag({ status }: { status: ClaimStatus }) {
  return <Tag tone={CLAIM[status]}>{status}</Tag>;
}

export function PayMethodTag({ method }: { method: PayMethod }) {
  return <Tag tone={PAY[method]}>{method}</Tag>;
}

/** Stock level, plus a warning when part of the stock has expired or is about to. */
export function StockTags({ drug, today }: { drug: Drug; today: string }) {
  const status = stockStatus(drug, today);
  return (
    <View style={styles.tags}>
      {status === 'out' ? <Tag tone="red">Out of stock</Tag> : null}
      {status === 'reorder' ? <Tag tone="amber">Reorder</Tag> : null}
      {status === 'ok' ? <Tag tone="green">OK</Tag> : null}
      {hasExpiredStock(drug, today) ? (
        <Tag tone="red">Expired</Tag>
      ) : hasExpiringStock(drug, today) ? (
        <Tag tone="red">Expiring</Tag>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
