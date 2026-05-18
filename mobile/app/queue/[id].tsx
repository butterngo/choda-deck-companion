import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { MarkdownView } from '@/components/markdown-view';
import { Fonts } from '@/constants/theme';
import { type QueueRunDetail } from '@/lib/api';
import { useApiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { fmtDuration, fmtRelative } from '@/lib/time';
import { usePalette } from '@/lib/theme';

export default function QueueRunDetailScreen() {
  const p = usePalette();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { auth } = useAuth();
  const client = useApiClient();

  const q = useQuery<QueueRunDetail>({
    queryKey: ['queue', id, auth?.serverUrl],
    queryFn: () => client!.getQueueRun(id),
    enabled: !!client && !!id,
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
          Cannot read queue run. {String(q.error?.message ?? 'not found')}
        </Text>
      </View>
    );
  }

  const { meta, report } = q.data;
  const status = meta.endedAt ? (meta.halted ? 'failed' : 'finished') : 'running';
  const durationMs = meta.startedAt
    ? (meta.endedAt ? new Date(meta.endedAt).getTime() : Date.now()) -
      new Date(meta.startedAt).getTime()
    : 0;

  return (
    <ScrollView style={{ backgroundColor: p.background }} contentContainerStyle={styles.body}>
      <Text style={[styles.title, { color: p.text, fontFamily: Fonts.mono }]}>
        {meta.queueRunId}
      </Text>
      <Text style={[styles.meta, { color: p.textMuted }]}>
        {status} · {fmtRelative(meta.startedAt)}
        {meta.endedAt ? ` · ended ${fmtRelative(meta.endedAt)}` : ''}
      </Text>

      <View style={styles.metrics}>
        <Metric label="Tasks" value={String(meta.taskOutcomes?.length ?? 0)} />
        <Metric label="Cost" value={`$${(meta.totalCostUsd ?? 0).toFixed(2)}`} mono />
        <Metric label="Duration" value={fmtDuration(durationMs)} mono />
      </View>

      {meta.taskOutcomes && meta.taskOutcomes.length > 0 ? (
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: p.textMuted }]}>Tasks</Text>
          {meta.taskOutcomes.map((t) => (
            <View
              key={t.taskId}
              style={[
                styles.taskRow,
                { backgroundColor: p.surface, borderColor: p.border },
              ]}>
              <View style={styles.taskRowHeader}>
                <Text style={[styles.taskId, { color: p.text, fontFamily: Fonts.mono }]}>
                  {t.taskId}
                </Text>
                <Text style={[styles.taskOutcome, { color: outcomeColor(p, t.outcome) }]}>
                  {t.outcome}
                </Text>
                {t.costUsd != null ? (
                  <Text style={[styles.taskCost, { color: p.textMuted, fontFamily: Fonts.mono }]}>
                    ${t.costUsd.toFixed(3)}
                  </Text>
                ) : null}
              </View>
              {t.reason && t.outcome !== 'DONE' ? (
                <Text style={[styles.taskReason, { color: p.textMuted }]}>{t.reason}</Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      {report ? (
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: p.textMuted }]}>Report</Text>
          <View style={[styles.reportBox, { backgroundColor: p.surface, borderColor: p.border }]}>
            <MarkdownView>{report}</MarkdownView>
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

function Metric({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const p = usePalette();
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricLabel, { color: p.textMuted }]}>{label}</Text>
      <Text
        style={[
          styles.metricValue,
          { color: p.text, fontFamily: mono ? Fonts.mono : undefined },
        ]}>
        {value}
      </Text>
    </View>
  );
}

function outcomeColor(p: ReturnType<typeof usePalette>, outcome: string): string {
  if (outcome === 'merged' || outcome === 'success') return p.success;
  if (outcome === 'failed' || outcome === 'preflight-failed') return p.danger;
  return p.textMuted;
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 16, fontWeight: '500' },
  meta: { fontSize: 12, marginTop: 4 },
  metrics: { flexDirection: 'row', gap: 16, marginTop: 16 },
  metric: { flex: 1 },
  metricLabel: { fontSize: 12, fontWeight: '400' },
  metricValue: { fontSize: 16, fontWeight: '500', marginTop: 2 },
  section: { marginTop: 24 },
  sectionLabel: { fontSize: 12, fontWeight: '500', marginBottom: 8 },
  taskRow: {
    flexDirection: 'column',
    padding: 10,
    borderRadius: 6,
    marginBottom: 6,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  taskRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  taskId: { fontSize: 13, fontWeight: '500', flex: 1 },
  taskOutcome: { fontSize: 12, fontWeight: '400' },
  taskCost: { fontSize: 12 },
  taskReason: { fontSize: 12, lineHeight: 16 },
  reportBox: {
    padding: 12,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  reportText: { fontSize: 12, lineHeight: 18 },
  center: { flex: 1, padding: 30, alignItems: 'center', justifyContent: 'center' },
});
