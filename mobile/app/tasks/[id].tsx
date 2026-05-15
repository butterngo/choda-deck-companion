import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { LabelPill, PriorityDot } from '@/components/list-row';
import { Fonts } from '@/constants/theme';
import { apiFetch, type TaskRow } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { fmtRelative } from '@/lib/time';
import { usePalette } from '@/lib/theme';

export default function TaskDetailScreen() {
  const p = usePalette();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { auth } = useAuth();

  const q = useQuery({
    queryKey: ['task', id, auth?.serverUrl],
    queryFn: () => apiFetch<TaskRow>(auth!, `/api/tasks/${id}`),
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
          Cannot read task. {String(q.error?.message ?? 'not found')}
        </Text>
      </View>
    );
  }

  const task = q.data;
  const labels = task.labels ? parseLabels(task.labels) : [];
  const body = typeof task.body === 'string' ? (task.body as string) : '';

  return (
    <ScrollView style={{ backgroundColor: p.background }} contentContainerStyle={styles.body}>
      <Text style={[styles.id, { color: p.textMuted, fontFamily: Fonts.mono }]}>{task.id}</Text>
      <Text style={[styles.title, { color: p.text }]}>{task.title ?? '(no title)'}</Text>

      <View style={styles.metaRow}>
        <Text style={[styles.metaText, { color: statusColor(p, task.status) }]}>
          {task.status.toLowerCase()}
        </Text>
        {task.priority ? (
          <View style={styles.priorityWrap}>
            <PriorityDot priority={task.priority} />
            <Text style={[styles.metaText, { color: p.textMuted }]}>{task.priority}</Text>
          </View>
        ) : null}
        {task.updated_at ? (
          <Text style={[styles.metaText, { color: p.textMuted }]}>
            {fmtRelative(task.updated_at)}
          </Text>
        ) : null}
      </View>

      {labels.length > 0 ? (
        <View style={styles.labels}>
          {labels.map((l) => (
            <LabelPill key={l} label={l} />
          ))}
        </View>
      ) : null}

      {body ? (
        <View style={[styles.bodyBox, { backgroundColor: p.surface, borderColor: p.border }]}>
          <Text style={[styles.bodyText, { color: p.text, fontFamily: Fonts.mono }]}>{body}</Text>
        </View>
      ) : (
        <Text style={[styles.bodyEmpty, { color: p.textMuted }]}>No body.</Text>
      )}
    </ScrollView>
  );
}

function parseLabels(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
}

function statusColor(p: ReturnType<typeof usePalette>, status: string): string {
  switch (status) {
    case 'IN-PROGRESS':
      return p.inProgress;
    case 'DONE':
      return p.success;
    case 'CANCELLED':
      return p.cancelled;
    case 'READY':
      return p.queued;
    default:
      return p.textMuted;
  }
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 40 },
  id: { fontSize: 12, fontWeight: '400' },
  title: { fontSize: 18, fontWeight: '500', marginTop: 4 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 10,
    flexWrap: 'wrap',
  },
  metaText: { fontSize: 12, fontWeight: '400' },
  priorityWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  labels: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 12 },
  bodyBox: {
    marginTop: 20,
    padding: 12,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  bodyText: { fontSize: 13, lineHeight: 19 },
  bodyEmpty: { fontSize: 13, marginTop: 20, textAlign: 'center' },
  center: { flex: 1, padding: 30, alignItems: 'center', justifyContent: 'center' },
});
