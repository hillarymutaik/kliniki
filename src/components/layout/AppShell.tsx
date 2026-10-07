import { usePathname } from 'expo-router';
import { Tabs, TabList, TabSlot, TabTrigger, type TabListProps, type TabTriggerSlotProps } from 'expo-router/ui';
import { Children, isValidElement, useEffect, type ReactElement, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLayout } from '@/hooks/use-layout';
import { activeTabName, NAV_ITEMS, navItemForPath, PHONE_TABS, type NavItem } from '@/navigation/items';
import { useData } from '@/store/hooks';
import { useTheme } from '@/theme/theme';

import { useModals } from '../modals/ModalHost';
import { AppText } from '../ui/AppText';
import { Icon } from '../ui/Icon';

/**
 * The app frame: a sidebar beside the page on wide screens; on phones a floating tab bar with a
 * quick-action button in the middle. Each page is a route; the tabs only decide which one is showing.
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
    <Tabs style={[styles.shell, { backgroundColor: colors.bg, flexDirection: isWide ? 'row' : 'column' }]}>
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

/** Every section needs a trigger so it can be routed to, but each bar only shows some of them. */
function pick(children: ReactNode, names: readonly string[]): ReactElement[] {
  const all = Children.toArray(children).filter(isValidElement) as ReactElement<{ name: string }>[];
  return names.flatMap((name) => all.filter((child) => child.props.name === name));
}

function NavBar({ children }: TabListProps) {
  const { isWide } = useLayout();
  return isWide ? (
    <Sidebar>{Children.toArray(children).filter((c) => !(isValidElement(c) && isPhoneOnly(c)))}</Sidebar>
  ) : (
    <FloatingBar>{children}</FloatingBar>
  );
}

const isPhoneOnly = (child: ReactElement) =>
  NAV_ITEMS.some((item) => item.phoneOnly && item.name === (child.props as { name?: string }).name);

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

/** Two tabs, the quick-action button, then two more: five slots instead of a crowded row of eight. */
function FloatingBar({ children }: { children: ReactNode }) {
  const { colors, dark } = useTheme();
  const insets = useSafeAreaInsets();
  const modals = useModals();
  const [first, second, third, fourth] = PHONE_TABS;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.floatWrap, { bottom: Math.max(insets.bottom, 10), left: 12 + insets.left, right: 12 + insets.right }]}
    >
      <View
        role="navigation"
        aria-label="Main"
        style={[
          styles.pill,
          {
            backgroundColor: colors.surface,
            borderColor: colors.line,
            boxShadow: dark ? '0 6px 20px rgba(0, 0, 0, 0.45)' : '0 6px 20px rgba(18, 38, 58, 0.16)',
          },
        ]}
      >
        {pick(children, [first, second])}
        <View style={styles.centerSlot}>
          <Pressable
            role="button"
            aria-label="Quick actions"
            onPress={modals.openQuickActions}
            style={({ pressed }) => [
              styles.centerButton,
              {
                backgroundColor: colors.brand,
                borderColor: colors.surface,
                opacity: pressed ? 0.85 : 1,
                boxShadow: `0 4px 14px ${dark ? 'rgba(70, 199, 154, 0.35)' : 'rgba(31, 122, 90, 0.4)'}`,
              },
            ]}
          >
            <Icon name="plus" size={32} color="onBrand" />
          </Pressable>
        </View>
        {pick(children, [third, fourth])}
      </View>
    </View>
  );
}

function NavButton({ item, isFocused, ...pressable }: TabTriggerSlotProps & { item: NavItem }) {
  const { colors } = useTheme();
  const { isWide } = useLayout();
  const pathname = usePathname();
  // On a phone a section inside More lights up the More tab; the trigger's own isFocused only knows its own route.
  const active = isWide ? !!isFocused : activeTabName(pathname) === item.name;

  if (isWide) {
    const tone = active ? 'onBrand' : 'sideInk';
    return (
      <Pressable
        {...pressable}
        role="link"
        aria-label={item.label}
        aria-current={active ? 'page' : undefined}
        style={({ pressed }) => [
          styles.navWide,
          { backgroundColor: active ? colors.brand : pressed ? 'rgba(255,255,255,0.06)' : 'transparent' },
        ]}
      >
        <Icon name={item.icon} size={20} color={tone} />
        <AppText size={15} weight={500} color={tone} numberOfLines={1}>
          {item.label}
        </AppText>
      </Pressable>
    );
  }

  const tone = active ? 'brandText' : 'muted';
  return (
    <Pressable
      {...pressable}
      role="link"
      aria-label={item.label}
      aria-current={active ? 'page' : undefined}
      style={({ pressed }) => [
        styles.navNarrow,
        { backgroundColor: active ? colors.brandSoft : pressed ? colors.bg : 'transparent' },
      ]}
    >
      <Icon name={item.icon} size={26} color={tone} />
      <AppText size={12} weight={active ? 700 : 500} color={tone} numberOfLines={1} style={styles.navLabel}>
        {item.label}
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
  // The bar comes before the page in the tree, so without a z-index the page paints (and takes taps) over it.
  floatWrap: { position: 'absolute', alignItems: 'center', zIndex: 20, elevation: 20 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    maxWidth: 520,
    padding: 6,
    borderRadius: 36,
    borderWidth: 1,
  },
  centerSlot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centerButton: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: -10,
    ...pointer,
  },
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
    paddingVertical: 8,
    borderRadius: 28,
    ...pointer,
  },
  navLabel: { lineHeight: 16, marginTop: 1 },
});
