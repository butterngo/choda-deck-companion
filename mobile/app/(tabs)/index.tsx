import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { FilterChips } from '@/components/filter-chips';
import { Icon } from '@/components/icon';
import { LabelPill, ListRow, PriorityDot } from '@/components/list-row';
import { ScreenHeader } from '@/components/screen-header';
import type { IconName } from '@/components/icon';
import { ApiError, apiFetch, withProjectId, type TaskRow } from '@/lib/api';
import { useAuth, useAuthSubtitle } from '@/lib/auth-context';
import { usePalette } from '@/lib/theme';

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

type Status = 'IN-PROGRESS' | 'READY' | 'TODO' | 'FAILED' | 'DONE' | 'CANCELLED';

const STATUS_OPTIONS = [
  { value: 'IN-PROGRESS', label: 'In progress' },
  { value: 'READY', label: 'Ready' },
  { value: 'TODO', label: 'Todo' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'DONE', label: 'Done' },
  { value: 'CANCELLED', label: 'Cancelled' },
] as const satisfies readonly { value: Status; label: string }[];

const DEFAULT_FILTER: Status[] = ['READY', 'IN-PROGRESS', 'TODO', 'FAILED'];

const STATUS_ORDER: Record<string, number> = {
  'IN-PROGRESS': 0,
  READY: 1,
  TODO: 2,
  FAILED: 3,
  DONE: 4,
  CANCELLED: 5,
};

const PRIORITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function sortTasks(tasks: TaskRow[]): TaskRow[] {
  return [...tasks].sort((a, b) => {
    const so = (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99);
    if (so) return so;
    const po =
      (PRIORITY_ORDER[(a.priority ?? '').toLowerCase()] ?? 99) -
      (PRIORITY_ORDER[(b.priority ?? '').toLowerCase()] ?? 99);
    if (po) return po;
    return (b.updated_at ?? '').localeCompare(a.updated_at ?? '');
  });
}

const LABEL_OPTIONS = [
  { value: 'auto-safe', label: 'Auto-safe' },
] as const satisfies readonly { value: string; label: string }[];

export default function TasksScreen() {
  const p = usePalette();
  const { auth } = useAuth();
  const subtitle = useAuthSubtitle();
  const router = useRouter();
  const [filter, setFilter] = useState<Set<Status>>(new Set(DEFAULT_FILTER));
  const [labelFilter, setLabelFilter] = useState<Set<string>>(new Set());
  const [searchText, setSearchText] = useState('');
  const debouncedSearch = useDebounced(searchText.trim(), 250);

  const filterCsv = Array.from(filter).join(',');
  const labelsCsv = Array.from(labelFilter).join(',');

  const q = useQuery({
    queryKey: ['tasks', auth?.serverUrl, auth?.projectId, filterCsv, labelsCsv, debouncedSearch],
    queryFn: () => {
      let url = withProjectId(`/api/tasks?status=${encodeURIComponent(filterCsv)}`, auth!.projectId);
      if (labelsCsv) url += `&labels=${encodeURIComponent(labelsCsv)}`;
      if (debouncedSearch) url += `&query=${encodeURIComponent(debouncedSearch)}`;
      return apiFetch<TaskRow[]>(auth!, url);
    },
    enabled: !!auth && filter.size > 0,
    retry: (failureCount, err) =>
      err instanceof ApiError && err.status === 503 && failureCount < 3,
    retryDelay: 3000,
    placeholderData: keepPreviousData,
  });

  const dbBusy =
    q.failureCount > 0 &&
    q.failureReason instanceof ApiError &&
    q.failureReason.status === 503;

  if (!auth) {
    return (
      <View style={{ flex: 1, backgroundColor: p.background }}>
        <ScreenHeader title="Tasks" subtitle={subtitle} />
        <Text style={[styles.empty, { color: p.textMuted }]}>
          Configure server in settings tab.
        </Text>
      </View>
    );
  }

  const sortedData = sortTasks(q.data ?? []);
  const hasSearch = debouncedSearch !== '';

  return (
    <View style={{ flex: 1, backgroundColor: p.background }}>
      <ScreenHeader title="Tasks" subtitle={subtitle} />

      <View style={[searchStyles.wrap, { borderColor: p.border }]}>
        <Icon name="search" size={16} color={p.textMuted} style={searchStyles.icon} />
        <TextInput
          style={[searchStyles.input, { color: p.text }]}
          placeholder="Search by id or title…"
          placeholderTextColor={p.textSubtle}
          value={searchText}
          onChangeText={setSearchText}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {searchText.length > 0 ? (
          <Pressable
            onPress={() => setSearchText('')}
            hitSlop={8}
            style={searchStyles.clearBtn}>
            <Icon name="x" size={14} color={p.textMuted} />
          </Pressable>
        ) : null}
      </View>

      <FilterChips options={STATUS_OPTIONS} selected={filter} onChange={setFilter} />
      <FilterChips options={LABEL_OPTIONS} selected={labelFilter} onChange={setLabelFilter} />

      {filter.size === 0 ? (
        <Text style={[styles.empty, { color: p.textMuted }]}>No filter selected.</Text>
      ) : q.isLoading || dbBusy ? (
        <>
          {dbBusy ? (
            <Text style={[styles.empty, { color: p.textMuted }]}>Database busy. Retrying…</Text>
          ) : null}
          <ActivityIndicator color={p.tint} style={{ marginTop: dbBusy ? 8 : 30 }} />
        </>
      ) : q.isError ? (
        <Text style={[styles.empty, { color: p.danger }]}>
          {String(q.error?.message ?? 'Failed to load.')}
        </Text>
      ) : (
        <FlatList
          data={sortedData}
          keyExtractor={(t) => t.id}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={q.isFetching}
              onRefresh={() => q.refetch()}
              tintColor={p.tint}
            />
          }
          ListEmptyComponent={
            <Text style={[styles.empty, { color: p.textMuted }]}>
              {hasSearch
                ? `No match for "${debouncedSearch}". Adjust filters or clear search.`
                : 'No tasks. Adjust filters.'}
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
              onPress={() => {
                Keyboard.dismiss();
                router.push(`/tasks/${item.id}` as never);
              }}
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
    case 'FAILED':
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
    case 'FAILED':
      return p.danger;
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

const searchStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  icon: { marginRight: 6 },
  input: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 2,
  },
  clearBtn: {
    padding: 2,
    marginLeft: 6,
  },
});
