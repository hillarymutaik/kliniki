import { usePathname } from 'expo-router';
import { Tabs, TabList, TabSlot, TabTrigger, type TabListProps, type TabTriggerSlotProps } from 'expo-router/ui';
import { useEffect, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useData } from '@/store/hooks';
import { useLayout } from '@/hooks/use-layout';
import { NAV_ITEMS, navItemForPath, type NavItem } from '@/navigation/items';
import { useTheme } from '@/theme/theme';

import { AppText } from '../ui/AppText';
import { Icon } from '../ui/Icon';

/**
 * The app frame: a sidebar beside the page on wide screens, a tab bar under it on narrow ones.
 * Each page is a route; the tabs only decide which one is showing.
 */
export function AppShell() {
  const { colors } = useTheme();
  const { isWide } = useLayout();
  const pathname = usePathname();
  const current = navItemForPath(pathname);

  useEffect(() => {
    if (Platform.OS === 'web') document.title = `${current.label} · Kliniki`;
  }, [current.label]);

  return (
    <Tabs style={[styles.shell, { backgroundColor: colors.bg, flexDirection: isWide ? 'row' : 'column-reverse' }]}>
      <TabList asChild>
        <NavBar>
          {NAV_ITEMS.map((item) => (
            // resetOnFocus: choosing Patients while on a patient's page goes back to the list.
            <TabTrigger key={item.name} name={item.name} href={item.href} resetOnFocus asChild>
              <NavButton item={item} />
            </TabTrigger>
          ))}
        </NavBar>
      </TabList>
      <TabSlot style={styles.slot} />
    </Tabs>
  );
}

function NavBar({ children }: TabListProps) {
  const { isWide } = useLayout();
  return isWide ? <Sidebar>{children}</Sidebar> : <BottomBar>{children}</BottomBar>;
}

function Sidebar({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const clinic = useData().clinic;

  return (
    <View
      style={[
        styles.sidebar,
        {
          backgroundColor: colors.side,
          paddingTop: 22 + insets.top,
          paddingBottom: 22 + insets.bottom,
          paddingLeft: 14 + insets.left,
        },
      ]}
    >
      <View style={styles.logo}>
        <View style={[styles.logoMark, { backgroundColor: colors.brand }]}>
          <View style={[styles.plusBar, { backgroundColor: colors.onBrand, width: 16, height: 4 }]} />
          <View style={[styles.plusBar, { backgroundColor: colors.onBrand, width: 4, height: 16 }]} />
        </View>
        <AppText weight={800} size={20} style={styles.logoText}>
          Kliniki
        </AppText>
      </View>
      <View role="navigation" aria-label="Main">
        {children}
      </View>
      <View style={styles.clinic}>
        <AppText weight={700} size={13} style={styles.clinicName}>
          {clinic}
        </AppText>
        <AppText size={13} color="sideInk">
          Nairobi · EAT
        </AppText>
      </View>
    </View>
  );
}

function BottomBar({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      role="navigation"
      aria-label="Main"
      style={[
        styles.bottomBar,
        {
          backgroundColor: colors.side,
          paddingBottom: 6 + insets.bottom,
          paddingLeft: 6 + insets.left,
          paddingRight: 6 + insets.right,
        },
      ]}
    >
      {children}
    </View>
  );
}

function NavButton({ item, isFocused, ...pressable }: TabTriggerSlotProps & { item: NavItem }) {
  const { colors } = useTheme();
  const { isWide } = useLayout();
  const active = !!isFocused;
  const tone = active ? 'onBrand' : 'sideInk';

  return (
    <Pressable
      {...pressable}
      role="link"
      aria-label={item.label}
      aria-current={active ? 'page' : undefined}
      style={({ pressed }) => [
        isWide ? styles.navWide : styles.navNarrow,
        { backgroundColor: active ? colors.brand : pressed ? 'rgba(255,255,255,0.06)' : 'transparent' },
      ]}
    >
      <Icon name={item.icon} size={isWide ? 20 : 22} color={tone} />
      <AppText size={isWide ? 15 : 11} weight={500} color={tone} numberOfLines={1} style={styles.navLabel}>
        {isWide ? item.label : item.shortLabel}
      </AppText>
    </Pressable>
  );
}

const pointer = Platform.select<ViewStyle>({ web: { cursor: 'pointer' } });

const styles = StyleSheet.create({
  shell: { flex: 1 },
  slot: { flex: 1 },
  sidebar: { width: 230, paddingRight: 14 },
  logo: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, paddingBottom: 22 },
  logoMark: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  plusBar: { position: 'absolute', borderRadius: 1 },
  logoText: { color: '#FFFFFF' },
  clinic: {
    marginTop: 24,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  clinicName: { color: '#FFFFFF' },
  bottomBar: { flexDirection: 'row', justifyContent: 'space-around', paddingTop: 6 },
  navWide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 2,
    ...pointer,
  },
  navNarrow: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 2,
    borderRadius: 8,
    ...pointer,
  },
  navLabel: { lineHeight: 16 },
});
