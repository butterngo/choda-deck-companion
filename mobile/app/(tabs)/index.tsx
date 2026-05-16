import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { FilterChips } from '@/components/filter-chips';
import { LabelPill, ListRow, PriorityDot } from '@/components/list-row';
import { ScreenHeader } from '@/components/screen-header';
import type { IconName } from '@/components/icon';
import { apiFetch, withProjectId, type TaskRow } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { usePalette } from '@/lib/theme';

type Status = 'READY' | 'IN-PROGRESS' | 'TODO' | 'DONE' | 'CANCELLED';

const STATUS_OPTIONS = [
  { value: 'READY', label: 'Ready' },
  { value: 'IN-PROGRESS', label: 'In progress' },
  { value: 'TODO', label: 'Todo' },
  { value: 'DONE', label: 'Done' },
  { value: 'CANCELLED', label: 'Cancelled' },
] as const satisfies readonly { value: Status; label: string }[];

const DEFAULT_FILTER: Status[] = ['READY', 'IN-PROGRESS'];

const LABEL_OPTIONS = [
  { value: 'auto-safe', label: 'Auto-safe' },
] as const satisfies readonly { value: string; label: string }[];

export default function TasksScreen() {
  const p = usePalette();
  const { auth } = useAuth();
  const router = useRouter();
  const [filter, setFilter] = useState<Set<Status>>(new Set(DEFAULT_FILTER));
  const [labelFilter, setLabelFilter] = useState<Set<string>>(new Set());

  const filterCsv = Array.from(filter).join(',');
  const labelsCsv = Array.from(labelFilter).join(',');

  const q = useQuery({
    queryKey: ['tasks', auth?.serverUrl, auth?.projectId, filterCsv, labelsCsv],
    queryFn: () => {
      let url = withProjectId(`/api/tasks?status=${encodeURIComponent(filterCsv)}`, auth!.projectId);
      if (labelsCsv) url += `&labels=${encodeURIComponent(labelsCsv)}`;
      return apiFetch<TaskRow[]>(auth!, url);
    },
    enabled: !!auth && filter.size > 0,
  });

  if (!auth) {
    return (
      <View style={{ flex: 1, backgroundColor: p.background }}>
        <ScreenHeader title="Tasks" />
        <Text style={[styles.empty, { color: p.textMuted }]}>
          Configure server in settings tab.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: p.background }}>
      <ScreenHeader title="Tasks" />
      <FilterChips options={STATUS_OPTIONS} selected={filter} onChange={setFilter} />
      <FilterChips options={LABEL_OPTIONS} selected={labelFilter} onChange={setLabelFilter} />

      {filter.size === 0 ? (
        <Text style={[styles.empty, { color: p.textMuted }]}>No filter selected.</Text>
      ) : q.isLoading ? (
        <ActivityIndicator color={p.tint} style={{ marginTop: 30 }} />
      ) : q.isError ? (
        <Text style={[styles.empty, { color: p.danger }]}>
          {String(q.error?.message ?? 'Failed to load.')}
        </Text>
      ) : (
        <FlatList
          data={q.data ?? []}
          keyExtractor={(t) => t.id}
          refreshControl={
            <RefreshControl
              refreshing={q.isFetching}
              onRefresh={() => q.refetch()}
              tintColor={p.tint}
            />
          }
          ListEmptyComponent={
            <Text style={[styles.empty, { color: p.textMuted }]}>
              No tasks. Adjust filters.
            </Text>
          }
          renderItem={({ item }) => (
            <ListRow
              statusIcon={iconFor(item.status)}
              statusColor={statusColor(p, item.status)}
              primaryId={item.id}
              title={item.title ?? '(no title)'}
              time={item.updated_at}
              belowRow={<TaskMeta task={item} />}
              onPress={() => router.push(`/tasks/${item.id}` as never)}
            />
          )}
        />
      )}
    </View>
  );
}

function TaskMeta({ task }: { task: TaskRow }) {
  const labels = task.labels ? parseLabels(task.labels) : [];
  const visible = labels.slice(0, 2);
  const extra = labels.length - visible.length;
  return (
    <View style={metaStyles.row}>
      {visible.map((l) => (
        <LabelPill key={l} label={l} />
      ))}
      {extra > 0 ? <LabelPill label={`+${extra}`} /> : null}
      <PriorityDot priority={task.priority} />
    </View>
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

function iconFor(status: string): IconName {
  switch (status) {
    case 'IN-PROGRESS':
      return 'player-play';
    case 'READY':
      return 'check';
    case 'DONE':
      return 'check';
    case 'CANCELLED':
      return 'x';
    default:
      return 'clock';
  }
}

function statusColor(
  p: ReturnType<typeof usePalette>,
  status: string,
): string {
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
      return p.textSubtle;
  }
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
