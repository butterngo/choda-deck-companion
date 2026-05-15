// Filter chip strip per design system catalog.
// Multi-select with OR-semantics. Active state = solid bg + contrast text.

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { usePalette } from '@/lib/theme';

export type ChipOption<T extends string> = { value: T; label: string };

export function FilterChips<T extends string>({
  options,
  selected,
  onChange,
}: {
  options: readonly ChipOption<T>[];
  selected: Set<T>;
  onChange: (next: Set<T>) => void;
}) {
  const p = usePalette();
  return (
    <View style={styles.row}>
      {options.map((opt) => {
        const active = selected.has(opt.value);
        return (
          <Pressable
            key={opt.value}
            onPress={() => {
              const next = new Set(selected);
              if (active) next.delete(opt.value);
              else next.add(opt.value);
              onChange(next);
            }}
            style={[
              styles.chip,
              {
                backgroundColor: active ? p.chipBgActive : p.chipBg,
              },
            ]}>
            <Text
              style={[
                styles.chipText,
                { color: active ? p.chipTextActive : p.chipText },
              ]}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '400',
  },
});
