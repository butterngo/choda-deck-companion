import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { LabelPill, PriorityDot } from '@/components/list-row';
import { Fonts } from '@/constants/theme';
import { ApiError, apiFetch, startQueueRun, type TaskRow } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { fmtRelative } from '@/lib/time';
import { usePalette } from '@/lib/theme';

export default function TaskDetailScreen() {
  const p = usePalette();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { auth } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);

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

  const canRun = task.status === 'READY' && !!auth.projectId && !!auth.workspaceId;
  const runHint = !auth.projectId
    ? 'Pick a project in Settings to enable.'
    : !auth.workspaceId
      ? 'Pick a workspace in Settings to enable.'
      : task.status !== 'READY'
        ? 'Only READY tasks can be queued.'
        : null;

  const handleRun = () => {
    if (!canRun || !auth.projectId || !auth.workspaceId) return;
    const taskId = task.id;
    const projectId = auth.projectId;
    const workspaceId = auth.workspaceId;
    Alert.alert(
      `Start queue run for ${taskId}?`,
      `${task.title ?? ''}\nWorkspace: ${auth.workspaceLabel ?? workspaceId}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start',
          onPress: async () => {
            setSubmitting(true);
            try {
              await startQueueRun(auth, { taskId, projectId, workspaceId });
              await queryClient.invalidateQueries({ queryKey: ['queue'] });
              router.push('/queue');
            } catch (err) {
              const message =
                err instanceof ApiError
                  ? err.status === 401
                    ? 'Re-pair in Settings.'
                    : err.status === 409
                      ? 'Already running or worktree exists — check Queue tab.'
                      : err.message
                  : err instanceof Error
                    ? err.message
                    : String(err);
              Alert.alert('Queue start failed', message);
            } finally {
              setSubmitting(false);
            }
          },
        },
      ],
    );
  };

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

      <Pressable
        style={[
          styles.runBtn,
          {
            backgroundColor: canRun ? p.chipBgActive : p.surfaceMuted,
            opacity: submitting ? 0.6 : 1,
          },
        ]}
        onPress={handleRun}
        disabled={!canRun || submitting}>
        <Text
          style={[
            styles.runBtnText,
            { color: canRun ? p.chipTextActive : p.textSubtle },
          ]}>
          {submitting ? 'Starting…' : 'Run in queue'}
        </Text>
      </Pressable>
      {runHint ? (
        <Text style={[styles.runHint, { color: p.textMuted }]}>{runHint}</Text>
      ) : null}
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
  runBtn: {
    marginTop: 24,
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  runBtnText: { fontWeight: '500', fontSize: 14 },
  runHint: { fontSize: 12, marginTop: 6, textAlign: 'center' },
  center: { flex: 1, padding: 30, alignItems: 'center', justifyContent: 'center' },
});
