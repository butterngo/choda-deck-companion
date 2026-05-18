import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { FilterChips } from '@/components/filter-chips';
import { Icon, type IconName } from '@/components/icon';
import { ListRow } from '@/components/list-row';
import { ScreenHeader } from '@/components/screen-header';
import { Fonts } from '@/constants/theme';
import { type QueueRunSummary } from '@/lib/api';
import { useApiClient } from '@/lib/api-client';
import { useAuth, useAuthSubtitle } from '@/lib/auth-context';
import { useLiveStatus } from '@/lib/sse';
import type { ActiveRunState, TaskTickState } from 'shared/sse';
import { fmtDuration } from '@/lib/time';
import { usePalette } from '@/lib/theme';

type QueueStatus = 'running' | 'finished' | 'failed';

const QUEUE_STATUS_OPTIONS = [
  { value: 'running', label: 'running' },
  { value: 'finished', label: 'finished' },
  { value: 'failed', label: 'failed' },
] as const satisfies readonly { value: QueueStatus; label: string }[];

const DEFAULT_QUEUE_FILTER: QueueStatus[] = ['running', 'finished', 'failed'];

export default function QueueScreen() {
  const p = usePalette();
  const { auth } = useAuth();
  const client = useApiClient();
  const subtitle = useAuthSubtitle();
  const router = useRouter();
  const live = useLiveStatus(auth);
  const [statusFilter, setStatusFilter] = useState<Set<QueueStatus>>(
    new Set(DEFAULT_QUEUE_FILTER),
  );

  const q = useQuery<QueueRunSummary[]>({
    queryKey: ['queue', auth?.serverUrl],
    queryFn: () => client!.listQueueRuns(),
    enabled: !!client,
    refetchInterval: live.state.active !== null ? 5000 : false,
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

  const activeRun = live.state.active;
  const activeId = activeRun?.queueRunId;
  const queueRuns = (q.data ?? []).filter(
    (r) => r.id !== activeId && statusFilter.has(r.status as QueueStatus),
  );
  const hasNonDefaultFilter = statusFilter.size !== DEFAULT_QUEUE_FILTER.length;

  return (
    <View style={{ flex: 1, backgroundColor: p.background }}>
      <ScreenHeader title="Queue" subtitle={subtitle} />

      {activeRun ? (
        <ActiveRunCard
          active={activeRun}
          onPress={() => router.push(`/queue/${activeRun.queueRunId}` as never)}
        />
      ) : null}

      <FilterChips
        options={QUEUE_STATUS_OPTIONS}
        selected={statusFilter}
        onChange={setStatusFilter}
      />

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
            <Text style={[styles.empty, { color: p.textMuted }]}>
              {statusFilter.size === 0
                ? 'No filter selected.'
                : hasNonDefaultFilter
                  ? `No ${Array.from(statusFilter).join('/')} runs.`
                  : 'No queue runs yet.'}
            </Text>
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
  active: ActiveRunState;
  onPress: () => void;
}) {
  const p = usePalette();
  const elapsedMs = active.startedAt ? Date.now() - new Date(active.startedAt).getTime() : 0;
  const taskEntries = Array.from(active.tasks.entries());

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
      {taskEntries.map(([tid, t]: [string, TaskTickState]) => (
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
        </View>
      ))}
    </Pressable>
  );
}

function iconForLive(status: string): IconName {
  if (status === 'started') return 'player-play';
  if (status === 'failed') return 'x';
  return 'check';
}

function colorForLive(p: ReturnType<typeof usePalette>, status: string): string {
  if (status === 'started') return p.inProgress;
  if (status === 'failed') return p.danger;
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
