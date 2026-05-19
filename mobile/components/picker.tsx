// Simple modal-based dropdown picker. Tap trigger → modal list → select → close.

import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Fonts } from '@/constants/theme';
import { usePalette } from '@/lib/theme';

export type PickerOption<T extends string> = {
  value: T;
  label: string;
  hint?: string;
};

export function Picker<T extends string>({
  label,
  value,
  options,
  placeholder = 'Select…',
  onChange,
  onClear,
  disabled = false,
}: {
  label: string;
  value: T | undefined;
  options: PickerOption<T>[];
  placeholder?: string;
  onChange: (value: T) => void;
  onClear?: () => void;
  disabled?: boolean;
}) {
  const p = usePalette();
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <>
      <Pressable
        onPress={() => !disabled && setOpen(true)}
        style={[
          styles.trigger,
          {
            backgroundColor: p.inputBg,
            borderColor: p.inputBorder,
            opacity: disabled ? 0.5 : 1,
          },
        ]}>
        <View style={{ flex: 1 }}>
          {selected ? (
            <>
              <Text style={[styles.value, { color: p.text }]}>{selected.label}</Text>
              {selected.hint ? (
                <Text style={[styles.hint, { color: p.textMuted, fontFamily: Fonts.mono }]}>
                  {selected.hint}
                </Text>
              ) : null}
            </>
          ) : (
            <Text style={[styles.placeholder, { color: p.textSubtle }]}>{placeholder}</Text>
          )}
        </View>
        <Icon name="chevron-right" size={16} color={p.textSubtle} />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable
            style={[
              styles.sheet,
              { backgroundColor: p.surface, borderColor: p.border },
            ]}
            onPress={(e) => e.stopPropagation()}>
            <Text style={[styles.sheetTitle, { color: p.text }]}>{label}</Text>
            <FlatList
              data={options}
              keyExtractor={(o) => o.value}
              ItemSeparatorComponent={() => (
                <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: p.border }} />
              )}
              ListEmptyComponent={
                <Text style={{ padding: 16, color: p.textMuted, textAlign: 'center' }}>
                  No options.
                </Text>
              }
              renderItem={({ item }) => {
                const active = item.value === value;
                return (
                  <Pressable
                    style={styles.option}
                    onPress={() => {
                      onChange(item.value);
                      setOpen(false);
                    }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.optionLabel, { color: p.text }]}>{item.label}</Text>
                      {item.hint ? (
                        <Text
                          style={[
                            styles.optionHint,
                            { color: p.textMuted, fontFamily: Fonts.mono },
                          ]}>
                          {item.hint}
                        </Text>
                      ) : null}
                    </View>
                    {active ? <Icon name="check" size={16} color={p.success} /> : null}
                  </Pressable>
                );
              }}
            />
            {onClear && value ? (
              <Pressable
                onPress={() => {
                  onClear();
                  setOpen(false);
                }}
                style={[styles.clearBtn, { borderTopColor: p.border }]}>
                <Text style={[styles.clearText, { color: p.danger }]}>Clear selection</Text>
              </Pressable>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  value: { fontSize: 14, fontWeight: '500' },
  hint: { fontSize: 11, marginTop: 2 },
  placeholder: { fontSize: 14, fontWeight: '400' },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    maxHeight: '70%',
    overflow: 'hidden',
  },
  sheetTitle: {
    fontSize: 14,
    fontWeight: '500',
    padding: 16,
    textTransform: 'capitalize',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 8,
  },
  optionLabel: { fontSize: 14, fontWeight: '400' },
  optionHint: { fontSize: 11, marginTop: 2 },
  clearBtn: {
    padding: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  clearText: { fontSize: 13, fontWeight: '500' },
});
