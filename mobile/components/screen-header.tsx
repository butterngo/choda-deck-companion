import { StyleSheet, Text, View } from 'react-native';

import { Fonts } from '@/constants/theme';
import { usePalette } from '@/lib/theme';

import { LiveBadge } from './live-badge';

export function ScreenHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const p = usePalette();
  return (
    <View style={[styles.row, { backgroundColor: p.background }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: p.text, fontFamily: Fonts.sans }]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: p.textMuted }]}>{subtitle}</Text>
        ) : null}
      </View>
      <LiveBadge />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    gap: 8,
  },
  // 22px is the spec cap for h1 — never larger
  title: { fontSize: 22, fontWeight: '500' },
  subtitle: { fontSize: 12, marginTop: 2 },
});
