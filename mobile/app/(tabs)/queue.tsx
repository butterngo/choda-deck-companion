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

import { ListRow } from '@/components/list-row';
import { ScreenHeader } from '@/components/screen-header';
import { Fonts } from '@/constants/theme';
import { apiFetch, type QueueRunSummary } from '@/lib/api';
import { useAuth, useAuthSubtitle } from '@/lib/auth-context';
import { useLiveStatus } from '@/lib/sse';
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

  return (
    <View style={{ flex: 1, backgroundColor: p.background }}>
      <ScreenHeader title="Queue" subtitle={subtitle} />

      {activeRun ? (
        <Pressable
          style={[styles.activeRow, { borderBottomColor: p.border }]}
          onPress={() => router.push(`/queue/${activeRun.queueRunId}` as never)}>
          <View style={[styles.liveDot, { backgroundColor: p.livePulse }]} />
          <Text style={[styles.activeId, { color: p.text, fontFamily: Fonts.mono }]}>
            {activeRun.queueRunId}
          </Text>
          <Text style={[styles.activeMeta, { color: p.textMuted }]}>
            {activeRun.taskCount} task{activeRun.taskCount === 1 ? '' : 's'} · running
          </Text>
        </Pressable>
      ) : null}

      {q.isLoading ? (
        <ActivityIndicator color={p.tint} style={{ marginTop: 30 }} />
      ) : q.isError ? (
        <Text style={[styles.empty, { color: p.danger }]}>
          {String(q.error?.message ?? 'Failed to load.')}
        </Text>
      ) : (
        <FlatList
          data={q.data ?? []}
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

const styles = StyleSheet.create({
  activeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  activeId: { fontSize: 12, fontWeight: '500' },
  activeMeta: { fontSize: 12, marginLeft: 'auto' },
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
