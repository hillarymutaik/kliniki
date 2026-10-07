import type { Href } from 'expo-router';

import type { IconName } from '@/components/ui/Icon';

export interface NavItem {
  /** Tab name, unique within the shell. */
  name: string;
  href: Href;
  label: string;
  icon: IconName;
  /** On phones this section is reached through the More tab instead of having a tab of its own. */
  inMore?: boolean;
  /** Only exists on phones; the sidebar already lists everything that More leads to. */
  phoneOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { name: 'today', href: '/', label: 'Today', icon: 'home-outline' },
  { name: 'patients', href: '/patients', label: 'Patients', icon: 'account-group-outline' },
  { name: 'appointments', href: '/appointments', label: 'Appointments', icon: 'calendar-month-outline', inMore: true },
  { name: 'pharmacy', href: '/pharmacy', label: 'Pharmacy', icon: 'pill' },
  { name: 'billing', href: '/billing', label: 'Billing', icon: 'receipt-text-outline', inMore: true },
  { name: 'claims', href: '/claims', label: 'SHA claims', icon: 'shield-check-outline', inMore: true },
  { name: 'reports', href: '/reports', label: 'Reports', icon: 'chart-bar', inMore: true },
  { name: 'settings', href: '/settings', label: 'Settings', icon: 'cog-outline', inMore: true },
  { name: 'more', href: '/more', label: 'More', icon: 'view-grid-outline', phoneOnly: true },
];

/** The four sections that get a tab on a phone; the centre button sits between the second and third. */
export const PHONE_TABS = ['today', 'patients', 'pharmacy', 'more'] as const;

/** The nav item a URL belongs to. Nested routes such as /patients/abc belong to their section. */
export function navItemForPath(pathname: string): NavItem {
  return (
    NAV_ITEMS.find((item) => item.href !== '/' && (pathname === item.href || pathname.startsWith(`${item.href}/`))) ??
    NAV_ITEMS[0]
  );
}

/** Which tab should look selected: sections inside More light up the More tab. */
export function activeTabName(pathname: string): string {
  const item = navItemForPath(pathname);
  return item.inMore ? 'more' : item.name;
}
