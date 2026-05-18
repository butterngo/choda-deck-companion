import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
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
import { type ConversationRow } from '@/lib/api';
import { useApiClient } from '@/lib/api-client';
import { useAuth, useAuthSubtitle } from '@/lib/auth-context';
import { usePalette } from '@/lib/theme';

type ConvStatus = 'discussing' | 'open' | 'decided' | 'closed';

const STATUS_OPTIONS = [
  { value: 'discussing', label: 'Discussing' },
  { value: 'open', label: 'Open' },
  { value: 'decided', label: 'Decided' },
  { value: 'closed', label: 'Closed' },
] as const satisfies readonly { value: ConvStatus; label: string }[];

export default function ConversationsScreen() {
  const p = usePalette();
  const { auth } = useAuth();
  const client = useApiClient();
  const subtitle = useAuthSubtitle();
  const router = useRouter();
  const [filter, setFilter] = useState<Set<ConvStatus>>(new Set(['discussing', 'open']));

  const filterCsv = Array.from(filter).join(',');

  const q = useQuery<ConversationRow[]>({
    queryKey: ['conversations', auth?.serverUrl, auth?.projectId, filterCsv],
    queryFn: () =>
      client!.listConversations({ status: filterCsv, projectId: auth!.projectId }),
    enabled: !!client && filter.size > 0,
  });

  if (!auth) {
    return (
      <View style={{ flex: 1, backgroundColor: p.background }}>
        <ScreenHeader title="Conversations" subtitle={subtitle} />
        <Text style={[styles.empty, { color: p.textMuted }]}>
          Configure server in settings tab.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: p.background }}>
      <ScreenHeader title="Conversations" subtitle={subtitle} />
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
          keyExtractor={(c) => c.id}
          refreshControl={
            <RefreshControl
              refreshing={q.isFetching}
              onRefresh={() => q.refetch()}
              tintColor={p.tint}
            />
          }
          ListEmptyComponent={
            <Text style={[styles.empty, { color: p.textMuted }]}>
              No conversations. Adjust filters.
            </Text>
          }
          renderItem={({ item }) => (
            <ListRow
              statusIcon={iconFor(item.status as ConvStatus)}
              statusColor={statusColor(p, item.status as ConvStatus)}
              primaryId={item.id}
              title={item.title ?? ''}
              time={item.decided_at ?? item.created_at}
              onPress={() => router.push(`/conversations/${item.id}`)}
            />
          )}
        />
      )}
    </View>
  );
}

function iconFor(status: ConvStatus): IconName {
  switch (status) {
    case 'discussing':
      return 'player-play';
    case 'open':
      return 'clock';
    case 'decided':
      return 'check';
    case 'closed':
      return 'x';
  }
}

function statusColor(p: ReturnType<typeof usePalette>, status: ConvStatus): string {
  switch (status) {
    case 'discussing':
      return p.inProgress;
    case 'open':
      return p.queued;
    case 'decided':
      return p.success;
    case 'closed':
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
