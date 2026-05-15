// List row component per design system catalog:
// [STATUS-ICON] [PRIMARY-ID-mono] [TITLE-truncate] [META] [TIME-relative] [>]

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Fonts } from '@/constants/theme';
import { Icon, type IconName } from '@/components/icon';
import { fmtRelative } from '@/lib/time';
import { usePalette } from '@/lib/theme';

export type ListRowProps = {
  statusIcon: IconName;
  statusColor: string;
  primaryId: string;
  title: string;
  meta?: React.ReactNode;
  belowRow?: React.ReactNode;
  time?: string | null;
  onPress?: () => void;
};

export function ListRow({
  statusIcon,
  statusColor,
  primaryId,
  title,
  meta,
  belowRow,
  time,
  onPress,
}: ListRowProps) {
  const p = usePalette();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: pressed ? p.surface : 'transparent',
          borderBottomColor: p.border,
        },
      ]}>
      <View style={styles.topRow}>
        <Icon name={statusIcon} size={16} color={statusColor} />
        <Text style={[styles.primaryId, { color: p.text, fontFamily: Fonts.mono }]}>
          {primaryId}
        </Text>
        <Text
          style={[styles.title, { color: p.text }]}
          numberOfLines={1}
          ellipsizeMode="tail">
          {title}
        </Text>
        {meta}
        {time ? (
          <Text style={[styles.time, { color: p.textMuted }]}>{fmtRelative(time)}</Text>
        ) : null}
        {onPress ? <Icon name="chevron-right" size={14} color={p.textSubtle} /> : null}
      </View>
      {belowRow ? <View style={styles.belowRow}>{belowRow}</View> : null}
    </Pressable>
  );
}

export function LabelPill({ label }: { label: string }) {
  const p = usePalette();
  return (
    <View style={[styles.pill, { backgroundColor: p.surfaceMuted }]}>
      <Text style={[styles.pillText, { color: p.chipText }]}>{label}</Text>
    </View>
  );
}

export function PriorityDot({ priority }: { priority: string | undefined }) {
  const p = usePalette();
  if (!priority || priority === 'low') return null;
  const color =
    priority === 'critical'
      ? p.priorityCritical
      : priority === 'high'
        ? p.priorityHigh
        : p.priorityMedium;
  return <View style={[styles.priorityDot, { backgroundColor: color }]} />;
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  belowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6,
    paddingLeft: 24,
  },
  primaryId: {
    fontSize: 12,
    fontWeight: '400',
  },
  title: {
    flex: 1,
    fontSize: 14,
    fontWeight: '400',
  },
  time: {
    fontSize: 12,
    fontWeight: '400',
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 9999,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '400',
  },
  priorityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
