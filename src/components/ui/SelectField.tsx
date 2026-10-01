import { useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
  type ViewStyle,
} from 'react-native';

import { fontFamily } from '@/theme/fonts';
import { useTheme } from '@/theme/theme';

import { AppText } from './AppText';
import { Field, inputBoxStyle } from './Field';
import { Icon } from './Icon';

export interface SelectOption {
  value: string;
  label: string;
  /** A second, muted line under the label, e.g. price and stock left. */
  detail?: string;
  disabled?: boolean;
  /** Consecutive options with the same group are listed under a shared heading. */
  group?: string;
}

interface SelectFieldProps {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  error?: string;
  /** Shown while nothing is selected. A picker that only adds things keeps `value` empty so this stays visible. */
  placeholder?: string;
}

/** React Native has no <select>, so this opens a list in a modal sheet. */
export function SelectField({ label, value, options, onChange, error, placeholder = 'Select…' }: SelectFieldProps) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <Field label={label} error={error}>
      <Pressable
        role="combobox"
        aria-label={`${label}: ${selected?.label ?? placeholder}`}
        aria-expanded={open}
        onPress={() => setOpen(true)}
        style={[inputBoxStyle(colors, { invalid: !!error }), styles.trigger]}
      >
        <AppText numberOfLines={1} color={selected ? 'ink' : 'muted'} style={styles.triggerText}>
          {selected ? selected.label : placeholder}
        </AppText>
        <Icon name="chevron-down" size={20} color="muted" />
      </Pressable>
      {open ? (
        <OptionSheet
          title={label}
          options={options}
          value={value}
          onClose={() => setOpen(false)}
          onSelect={(next) => {
            setOpen(false);
            onChange(next);
          }}
        />
      ) : null}
    </Field>
  );
}

type Row = { kind: 'group'; label: string } | { kind: 'option'; option: SelectOption };

/** Long lists (patients) get a filter box. */
const SEARCH_THRESHOLD = 8;

interface OptionSheetProps {
  title: string;
  options: SelectOption[];
  value: string;
  onSelect: (value: string) => void;
  onClose: () => void;
}

function OptionSheet({ title, options, value, onSelect, onClose }: OptionSheetProps) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const visible = q ? options.filter((o) => `${o.label} ${o.detail ?? ''}`.toLowerCase().includes(q)) : options;
    const list: Row[] = [];
    let lastGroup: string | undefined;
    for (const option of visible) {
      if (option.group && option.group !== lastGroup) list.push({ kind: 'group', label: option.group });
      lastGroup = option.group;
      list.push({ kind: 'option', option });
    }
    return list;
  }, [options, query]);

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.backdrop, { backgroundColor: colors.overlay }]}
      >
        {/* Sits under the sheet, so a tap outside it dismisses the list. */}
        <Pressable focusable={false} aria-hidden style={StyleSheet.absoluteFill} onPress={onClose} />
        {/* React Native has no listbox role; a radio group says the same thing: pick one of these. */}
        <View
          role="radiogroup"
          aria-label={title}
          style={[styles.sheet, { width: Math.min(480, width * 0.92), backgroundColor: colors.surface }]}
        >
          <View style={[styles.sheetHeader, { borderBottomColor: colors.line }]}>
            <AppText role="heading" aria-level={2} weight={700} size={16}>
              {title}
            </AppText>
            <Pressable role="button" aria-label="Close" hitSlop={10} onPress={onClose}>
              <Icon name="close" size={22} color="muted" />
            </Pressable>
          </View>
          {options.length > SEARCH_THRESHOLD ? (
            <TextInput
              role="searchbox"
              accessibilityLabel={`Filter ${title.toLowerCase()}`}
              value={query}
              onChangeText={setQuery}
              placeholder="Type to filter"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.search, { color: colors.ink, backgroundColor: colors.bg, borderColor: colors.line }]}
            />
          ) : null}
          <FlatList
            data={rows}
            keyExtractor={(row) => (row.kind === 'group' ? `group:${row.label}` : `option:${row.option.value}`)}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <AppText color="muted" style={styles.none}>
                Nothing matches “{query}”.
              </AppText>
            }
            renderItem={({ item }) =>
              item.kind === 'group' ? (
                <AppText size={12} weight={700} color="muted" style={styles.group}>
                  {item.label.toUpperCase()}
                </AppText>
              ) : (
                <OptionRow option={item.option} selected={item.option.value === value} onSelect={onSelect} />
              )
            }
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function OptionRow({
  option,
  selected,
  onSelect,
}: {
  option: SelectOption;
  selected: boolean;
  onSelect: (value: string) => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      role="radio"
      aria-checked={selected}
      aria-disabled={option.disabled}
      disabled={option.disabled}
      onPress={() => onSelect(option.value)}
      style={({ pressed }) => [
        styles.option,
        { borderBottomColor: colors.line, backgroundColor: pressed ? colors.bg : 'transparent', opacity: option.disabled ? 0.45 : 1 },
      ]}
    >
      <View style={styles.optionText}>
        <AppText weight={selected ? 700 : 500}>{option.label}</AppText>
        {option.detail ? (
          <AppText size={13} color="muted">
            {option.detail}
          </AppText>
        ) : null}
      </View>
      {selected ? <Icon name="check" size={20} color="brand" /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    ...Platform.select<ViewStyle>({ web: { cursor: 'pointer' } }),
  },
  triggerText: { flex: 1 },
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sheet: { maxHeight: '70%', borderRadius: 12, overflow: 'hidden' },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  search: {
    fontFamily: fontFamily(400),
    fontSize: 15,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 11,
    margin: 12,
    marginBottom: 4,
  },
  group: { paddingTop: 12, paddingBottom: 4, paddingHorizontal: 16, letterSpacing: 0.6 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  optionText: { flex: 1 },
  none: { padding: 20, textAlign: 'center' },
});
