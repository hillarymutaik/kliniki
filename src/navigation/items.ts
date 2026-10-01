import type { Href } from 'expo-router';

import type { IconName } from '@/components/ui/Icon';

export interface NavItem {
  /** Tab name, unique within the shell. */
  name: string;
  href: Href;
  label: string;
  /** Used in the bottom bar, where seven labels have to fit on a phone. */
  shortLabel: string;
  icon: IconName;
}

export const NAV_ITEMS: NavItem[] = [
  { name: 'today', href: '/', label: 'Today', shortLabel: 'Today', icon: 'home-outline' },
  { name: 'patients', href: '/patients', label: 'Patients', shortLabel: 'Patients', icon: 'account-group-outline' },
  { name: 'appointments', href: '/appointments', label: 'Appointments', shortLabel: 'Appts', icon: 'calendar-month-outline' },
  { name: 'pharmacy', href: '/pharmacy', label: 'Pharmacy', shortLabel: 'Pharmacy', icon: 'pill' },
  { name: 'billing', href: '/billing', label: 'Billing', shortLabel: 'Billing', icon: 'receipt-text-outline' },
  { name: 'claims', href: '/claims', label: 'SHA claims', shortLabel: 'Claims', icon: 'shield-check-outline' },
  { name: 'reports', href: '/reports', label: 'Reports', shortLabel: 'Reports', icon: 'chart-bar' },
];

/** The nav item a URL belongs to. Nested routes such as /patients/abc belong to their section. */
export function navItemForPath(pathname: string): NavItem {
  return (
    NAV_ITEMS.find((item) => item.href !== '/' && (pathname === item.href || pathname.startsWith(`${item.href}/`))) ??
    NAV_ITEMS[0]
  );
}
