import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { ListRow } from '@/components/list-row';
import { ScreenHeader } from '@/components/screen-header';
import { Fonts } from '@/constants/theme';
import { apiFetch, type QueueRunSummary } from '@/lib/api';
import { useAuth, useAuthSubtitle } from '@/lib/auth-context';
import { useLiveStatus, type LiveActiveRun, type LiveTaskState } from '@/lib/sse';
import { fmtDuration } from '@/lib/time';
import { usePalette } from '@/lib/theme';

export default function QueueScreen() {
  const p = usePalette();
  const { auth } = useAuth();
  const subtitle = useAuthSubtitle();
  const router = useRouter();
  const live = useLiveStatus(auth);

  const q = useQuery({
    queryKey: ['queue', auth?.serverUrl],
    queryFn: () => apiFetch<QueueRunSummary[]>(auth!, '/api/queue'),
    enabled: !!auth,
    refetchInterval: live.status === 'active' ? 5000 : false,
  });

  if (!auth) {
    return (
      <View style={{ flex: 1, backgroundColor: p.background }}>
        <ScreenHeader title="Queue" subtitle={subtitle} />
        <Text style={[styles.empty, { color: p.textMuted }]}>
          Configure server in settings tab.
        </Text>
      </View>
    );
  }

  const activeRun = live.status === 'active' ? live.active : null;
  const activeId = activeRun?.queueRunId;
  const queueRuns = (q.data ?? []).filter((r) => r.id !== activeId);

  return (
    <View style={{ flex: 1, backgroundColor: p.background }}>
      <ScreenHeader title="Queue" subtitle={subtitle} />

      {activeRun ? (
        <ActiveRunCard
          active={activeRun}
          onPress={() => router.push(`/queue/${activeRun.queueRunId}` as never)}
        />
      ) : null}

      {q.isLoading ? (
        <ActivityIndicator color={p.tint} style={{ marginTop: 30 }} />
      ) : q.isError ? (
        <Text style={[styles.empty, { color: p.danger }]}>
          {String(q.error?.message ?? 'Failed to load.')}
        </Text>
      ) : (
        <FlatList
          data={queueRuns}
          keyExtractor={(r) => r.id}
          refreshControl={
            <RefreshControl
              refreshing={q.isFetching}
              onRefresh={() => q.refetch()}
              tintColor={p.tint}
            />
          }
          ListEmptyComponent={
            <Text style={[styles.empty, { color: p.textMuted }]}>No queue runs yet.</Text>
          }
          renderItem={({ item }) => (
            <ListRow
              statusIcon={
                item.status === 'running'
                  ? 'player-play'
                  : item.status === 'failed'
                    ? 'x'
                    : 'check'
              }
              statusColor={
                item.status === 'running'
                  ? p.inProgress
                  : item.status === 'failed'
                    ? p.danger
                    : p.success
              }
              primaryId={item.id}
              title={`${item.taskCount} task${item.taskCount === 1 ? '' : 's'}`}
              time={item.finishedAt}
              belowRow={<QueueMeta cost={item.totalCostUsd} durationMs={item.durationMs} />}
              onPress={() => router.push(`/queue/${item.id}` as never)}
            />
          )}
        />
      )}
    </View>
  );
}

function QueueMeta({ cost, durationMs }: { cost: number; durationMs: number }) {
  const p = usePalette();
  return (
    <View style={metaStyles.row}>
      <Text style={[metaStyles.text, { color: p.textMuted, fontFamily: Fonts.mono }]}>
        ${cost.toFixed(2)}
      </Text>
      <Text style={[metaStyles.text, { color: p.textMuted, fontFamily: Fonts.mono }]}>
        {fmtDuration(durationMs)}
      </Text>
    </View>
  );
}

function ActiveRunCard({
  active,
  onPress,
}: {
  active: LiveActiveRun;
  onPress: () => void;
}) {
  const p = usePalette();
  const elapsedMs = active.startedAt ? Date.now() - new Date(active.startedAt).getTime() : 0;
  const taskIds = Object.keys(active.tasks);

  return (
    <Pressable
      onPress={onPress}
      style={[
        activeStyles.card,
        { borderColor: p.inProgress, backgroundColor: p.surface },
      ]}>
      <View style={activeStyles.header}>
        <View style={[activeStyles.liveDot, { backgroundColor: p.livePulse }]} />
        <Text style={[activeStyles.id, { color: p.text, fontFamily: Fonts.mono }]} numberOfLines={1}>
          {active.queueRunId}
        </Text>
        <View style={[activeStyles.activeChip, { backgroundColor: p.chipBgActive }]}>
          <Text style={[activeStyles.activeChipText, { color: p.chipTextActive }]}>active</Text>
        </View>
        <View style={activeStyles.spacer} />
        <Text style={[activeStyles.metaText, { color: p.textMuted, fontFamily: Fonts.mono }]}>
          ${active.totalCostUsd.toFixed(2)}
        </Text>
        <Text style={[activeStyles.metaText, { color: p.textMuted }]}>
          {fmtDuration(elapsedMs)}
        </Text>
      </View>
      {taskIds.map((tid) => {
        const t = active.tasks[tid] as LiveTaskState;
        return (
          <View key={tid} style={[activeStyles.taskRow, { borderTopColor: p.border }]}>
            <Icon
              name={iconForLive(t.status)}
              size={14}
              color={colorForLive(p, t.status)}
            />
            <Text
              style={[activeStyles.taskId, { color: p.text, fontFamily: Fonts.mono }]}
              numberOfLines={1}>
              {tid}
            </Text>
            {t.costUsd != null ? (
              <Text
                style={[
                  activeStyles.taskMeta,
                  { color: p.textMuted, fontFamily: Fonts.mono },
                ]}>
                ${t.costUsd.toFixed(2)}
              </Text>
            ) : null}
            {t.durationMs ? (
              <Text style={[activeStyles.taskMeta, { color: p.textMuted }]}>
                {fmtDuration(t.durationMs)}
              </Text>
            ) : null}
          </View>
        );
      })}
    </Pressable>
  );
}

function iconForLive(status: string): IconName {
  const s = status.toLowerCase();
  if (s === 'in-progress' || s === 'running') return 'player-play';
  if (s === 'failed' || s === 'preflight-failed' || s === 'cancelled') return 'x';
  return 'check';
}

function colorForLive(p: ReturnType<typeof usePalette>, status: string): string {
  const s = status.toLowerCase();
  if (s === 'in-progress' || s === 'running') return p.inProgress;
  if (s === 'failed' || s === 'preflight-failed') return p.danger;
  if (s === 'cancelled') return p.cancelled;
  return p.success;
}

const styles = StyleSheet.create({
  empty: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 24,
    paddingHorizontal: 16,
  },
});

const metaStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  text: { fontSize: 12, fontWeight: '400' },
});

const activeStyles = StyleSheet.create({
  card: {
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 6,
    borderRadius: 8,
    borderWidth: 2,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  id: { fontSize: 13, fontWeight: '500', flexShrink: 1 },
  activeChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  activeChipText: { fontSize: 11, fontWeight: '500' },
  spacer: { flex: 1 },
  metaText: { fontSize: 11 },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  taskId: { fontSize: 12, flex: 1 },
  taskMeta: { fontSize: 11 },
});
