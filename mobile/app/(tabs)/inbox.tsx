import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { FilterChips } from '@/components/filter-chips';
import { ListRow } from '@/components/list-row';
import { ScreenHeader } from '@/components/screen-header';
import type { IconName } from '@/components/icon';
import { apiFetch, withProjectId } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { usePalette } from '@/lib/theme';
import { useState } from 'react';

type InboxStatus = 'raw' | 'researching' | 'ready' | 'converted' | 'archived';

const STATUS_OPTIONS = [
  { value: 'raw', label: 'Raw' },
  { value: 'researching', label: 'Researching' },
  { value: 'ready', label: 'Ready' },
  { value: 'converted', label: 'Converted' },
  { value: 'archived', label: 'Archived' },
] as const satisfies readonly { value: InboxStatus; label: string }[];

type InboxRow = {
  id: string;
  content: string;
  status: InboxStatus;
  linked_task_id?: string | null;
  created_at?: string;
  updated_at?: string;
};

export default function InboxScreen() {
  const p = usePalette();
  const { auth } = useAuth();
  const router = useRouter();
  const [filter, setFilter] = useState<Set<InboxStatus>>(new Set(['raw', 'researching', 'ready']));

  const filterCsv = Array.from(filter).join(',');

  const q = useQuery({
    queryKey: ['inbox', auth?.serverUrl, auth?.projectId, filterCsv],
    queryFn: () =>
      apiFetch<InboxRow[]>(
        auth!,
        withProjectId(`/api/inbox?status=${encodeURIComponent(filterCsv)}`, auth!.projectId),
      ),
    enabled: !!auth && filter.size > 0,
  });

  if (!auth) {
    return (
      <View style={{ flex: 1, backgroundColor: p.background }}>
        <ScreenHeader title="Inbox" />
        <Text style={[styles.empty, { color: p.textMuted }]}>
          Configure server in settings tab.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: p.background }}>
      <ScreenHeader title="Inbox" />
      <FilterChips options={STATUS_OPTIONS} selected={filter} onChange={setFilter} />

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
          keyExtractor={(i) => i.id}
          refreshControl={
            <RefreshControl
              refreshing={q.isFetching}
              onRefresh={() => q.refetch()}
              tintColor={p.tint}
            />
          }
          ListEmptyComponent={
            <Text style={[styles.empty, { color: p.textMuted }]}>
              No inbox items. Adjust filters.
            </Text>
          }
          renderItem={({ item }) => (
            <ListRow
              statusIcon={iconFor(item.status)}
              statusColor={statusColor(p, item.status)}
              primaryId={item.id}
              title={item.content}
              time={item.updated_at ?? item.created_at}
              onPress={() => router.push(`/inbox/${item.id}` as never)}
            />
          )}
        />
      )}
    </View>
  );
}

function iconFor(status: InboxStatus): IconName {
  switch (status) {
    case 'raw':
      return 'clock';
    case 'researching':
      return 'player-play';
    case 'ready':
      return 'check';
    case 'converted':
      return 'check';
    case 'archived':
      return 'x';
  }
}

function statusColor(p: ReturnType<typeof usePalette>, status: InboxStatus): string {
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
