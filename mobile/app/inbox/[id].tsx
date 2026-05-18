import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Fonts } from '@/constants/theme';
import { apiFetch, type InboxRow } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { fmtRelative } from '@/lib/time';
import { usePalette } from '@/lib/theme';

export default function InboxDetailScreen() {
  const p = usePalette();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { auth } = useAuth();

  const q = useQuery({
    queryKey: ['inbox', id, auth?.serverUrl],
    queryFn: () => apiFetch<InboxRow>(auth!, `/api/inbox/${id}`),
    enabled: !!auth && !!id,
  });

  if (!auth) {
    return (
      <View style={[styles.center, { backgroundColor: p.background }]}>
        <Text style={{ fontSize: 13, color: p.textMuted }}>
          Configure server in settings.
        </Text>
      </View>
    );
  }
  if (q.isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: p.background }}>
        <ActivityIndicator color={p.tint} style={{ marginTop: 30 }} />
      </View>
    );
  }
  if (q.isError || !q.data) {
    return (
      <View style={[styles.center, { backgroundColor: p.background }]}>
        <Text style={{ fontSize: 13, color: p.danger }}>
          Cannot read inbox item. {String(q.error?.message ?? 'not found')}
        </Text>
      </View>
    );
  }

  const item = q.data;

  return (
    <ScrollView style={{ backgroundColor: p.background }} contentContainerStyle={styles.body}>
      <Text style={[styles.id, { color: p.textMuted, fontFamily: Fonts.mono }]}>{item.id}</Text>

      <View style={styles.metaRow}>
        <Text style={[styles.metaText, { color: statusColor(p, item.status) }]}>
          {item.status}
        </Text>
        {item.updated_at ? (
          <Text style={[styles.metaText, { color: p.textMuted }]}>
            {fmtRelative(item.updated_at)}
          </Text>
        ) : null}
      </View>

      {item.linked_task_id ? (
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: p.textMuted }]}>Linked task</Text>
          <Text style={[styles.sectionBody, { color: p.text, fontFamily: Fonts.mono }]}>
            {item.linked_task_id}
          </Text>
        </View>
      ) : null}

      <View style={[styles.contentBox, { backgroundColor: p.surface, borderColor: p.border }]}>
        <Text style={[styles.contentText, { color: p.text, fontFamily: Fonts.mono }]}>
          {item.content}
        </Text>
      </View>
    </ScrollView>
  );
}

function statusColor(p: ReturnType<typeof usePalette>, status: string): string {
  switch (status) {
    case 'raw':
      return p.queued;
    case 'researching':
      return p.inProgress;
    case 'ready':
      return p.success;
    case 'converted':
      return p.success;
    case 'archived':
      return p.cancelled;
    default:
      return p.textMuted;
  }
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 40 },
  id: { fontSize: 12, fontWeight: '400' },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 6,
  },
  metaText: { fontSize: 12, fontWeight: '400' },
  section: { marginTop: 14 },
  sectionLabel: { fontSize: 12, fontWeight: '500', marginBottom: 4 },
  sectionBody: { fontSize: 13, lineHeight: 19 },
  contentBox: {
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  contentText: { fontSize: 13, lineHeight: 19 },
  center: { flex: 1, padding: 30, alignItems: 'center', justifyContent: 'center' },
});
