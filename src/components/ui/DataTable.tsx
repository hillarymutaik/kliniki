import { useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View, useWindowDimensions, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/theme';

import { AppText } from './AppText';
import { Button } from './Button';

export interface Column<T> {
  key: string;
  title: string;
  /** Strings and numbers are wrapped in text for you; return an element for anything richer. */
  render: (row: T) => ReactNode;
  /** Share of the row in table layout. */
  flex?: number;
  /** Narrowest the column may get in table layout. */
  minWidth?: number;
  align?: 'left' | 'right';
  /** Card layout: becomes the card heading. Defaults to the first column that is not `actions`. */
  primary?: boolean;
  /** Card layout: shown as the card footer, without a label. */
  actions?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  keyOf: (row: T) => string;
  /** Rendered instead of the table when there are no rows. */
  empty: ReactNode;
  onRowPress?: (row: T) => void;
  /** Accessible name for a pressable row. */
  rowLabel?: (row: T) => string;
  /** Rows shown before a "Show more" button appears. */
  pageSize?: number;
}

const DEFAULT_MIN_WIDTH = 110;
const ROW_PADDING = 16;
const COLUMN_GAP = 12;

/**
 * A table where there is room for one, and a list of cards where there is not, so no screen
 * ever needs sideways scrolling. Both layouts are driven by the same column definitions.
 */
export function DataTable<T>({ columns, rows, keyOf, empty, onRowPress, rowLabel, pageSize = 100 }: DataTableProps<T>) {
  const { colors } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const [measured, setMeasured] = useState<number | null>(null);
  const [limit, setLimit] = useState(pageSize);

  if (rows.length === 0) return <>{empty}</>;

  const needed =
    columns.reduce((sum, c) => sum + (c.minWidth ?? DEFAULT_MIN_WIDTH), 0) +
    COLUMN_GAP * (columns.length - 1) +
    ROW_PADDING * 2;
  const compact = (measured ?? windowWidth) < needed;
  const shown = rows.slice(0, limit);
  const heading = columns.find((c) => c.primary) ?? columns.find((c) => !c.actions) ?? columns[0];

  return (
    <View role="table" onLayout={(event) => setMeasured(event.nativeEvent.layout.width)}>
      {compact ? null : (
        <View role="row" style={[styles.row, styles.headerRow, { borderBottomColor: colors.line }]}>
          {columns.map((column) => (
            <View key={column.key} role="columnheader" style={cellStyle(column)}>
              <AppText size={13} weight={600} color="muted" numberOfLines={1} style={alignText(column)}>
                {column.title}
              </AppText>
            </View>
          ))}
        </View>
      )}

      {shown.map((row, index) => {
        const last = index === shown.length - 1 && rows.length <= limit;
        const border = { borderBottomColor: colors.line, borderBottomWidth: last ? 0 : 1 };
        const content = compact ? (
          <Card row={row} columns={columns} heading={heading} />
        ) : (
          <View role="row" style={styles.row}>
            {columns.map((column) => (
              <View key={column.key} role="cell" style={[cellStyle(column), styles.cell]}>
                {cellContent(column.render(row), column)}
              </View>
            ))}
          </View>
        );

        return onRowPress ? (
          <Pressable
            key={keyOf(row)}
            role="button"
            aria-label={rowLabel?.(row)}
            onPress={() => onRowPress(row)}
            style={({ pressed }) => [border, pressed && { backgroundColor: colors.bg }, webPointer]}
          >
            {content}
          </Pressable>
        ) : (
          <View key={keyOf(row)} style={border}>
            {content}
          </View>
        );
      })}

      {rows.length > limit ? (
        <View style={styles.more}>
          <Button
            variant="ghost"
            size="sm"
            label={`Show more (${rows.length - limit} hidden)`}
            onPress={() => setLimit(limit + pageSize)}
          />
        </View>
      ) : null}
    </View>
  );
}

function Card<T>({ row, columns, heading }: { row: T; columns: Column<T>[]; heading: Column<T> }) {
  const details = columns.filter((c) => c !== heading && !c.actions);
  const actions = columns.find((c) => c.actions);

  return (
    <View style={styles.card}>
      <View>{cellContent(heading.render(row), heading, 15, 700)}</View>
      {details.map((column) => (
        <View key={column.key} style={styles.detail}>
          <AppText size={13} color="muted">
            {column.title}
          </AppText>
          <View style={styles.detailValue}>{cellContent(column.render(row), { ...column, align: 'right' })}</View>
        </View>
      ))}
      {actions ? <View style={styles.actions}>{actions.render(row)}</View> : null}
    </View>
  );
}

function cellContent<T>(node: ReactNode, column: Column<T>, size = 14, weight?: 400 | 700): ReactNode {
  if (typeof node === 'string' || typeof node === 'number') {
    return (
      <AppText size={size} weight={weight} style={alignText(column)}>
        {node}
      </AppText>
    );
  }
  return node;
}

const alignText = <T,>(column: Column<T>) => (column.align === 'right' ? { textAlign: 'right' as const } : undefined);

function cellStyle<T>(column: Column<T>): ViewStyle {
  return {
    flexGrow: column.flex ?? 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: column.minWidth ?? DEFAULT_MIN_WIDTH,
    alignItems: column.align === 'right' ? 'flex-end' : 'flex-start',
  };
}

const webPointer = Platform.select<ViewStyle>({ web: { cursor: 'pointer' } });

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: COLUMN_GAP, paddingHorizontal: ROW_PADDING },
  headerRow: { paddingVertical: 10, borderBottomWidth: 1 },
  cell: { justifyContent: 'center', paddingVertical: 11 },
  card: { gap: 6, paddingVertical: 14, paddingHorizontal: ROW_PADDING },
  detail: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  detailValue: { flexShrink: 1, alignItems: 'flex-end' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  more: { alignItems: 'center', padding: 12 },
});
