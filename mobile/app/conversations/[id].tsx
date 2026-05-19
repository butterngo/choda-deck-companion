import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Fonts } from '@/constants/theme';
import { type ConversationThread } from '@/lib/api';
import { useApiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { fmtRelative } from '@/lib/time';
import { usePalette } from '@/lib/theme';

export default function ConversationThreadScreen() {
  const p = usePalette();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { auth } = useAuth();
  const client = useApiClient();

  const q = useQuery<ConversationThread>({
    queryKey: ['conversation', id, auth?.serverUrl],
    queryFn: () => client!.getConversation(id) as Promise<ConversationThread>,
    enabled: !!client && !!id,
  });

  if (!auth) {
    return (
      <View style={[styles.center, { backgroundColor: p.surface }]}>
        <Text style={{ fontSize: 13, color: p.textMuted }}>
          Configure server in settings.
        </Text>
      </View>
    );
  }
  if (q.isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: p.surface }}>
        <ActivityIndicator color={p.tint} style={{ marginTop: 30 }} />
      </View>
    );
  }
  if (q.isError || !q.data) {
    return (
      <View style={[styles.center, { backgroundColor: p.surface }]}>
        <Text style={{ fontSize: 13, color: p.danger }}>
          Cannot read conversation. {String(q.error?.message ?? 'not found')}
        </Text>
      </View>
    );
  }

  const { conversation, participants, messages, actions, links } = q.data;

  return (
    <ScrollView style={{ backgroundColor: p.surface }} contentContainerStyle={styles.body}>
      <Text style={[styles.title, { color: p.text }]}>{conversation.title}</Text>
      <Text style={[styles.meta, { color: p.textMuted, fontFamily: Fonts.mono }]}>
        {conversation.id} · {conversation.status} · {fmtRelative(conversation.created_at)}
      </Text>

      {participants.length > 0 ? (
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: p.textMuted }]}>Participants</Text>
          <Text style={[styles.sectionBody, { color: p.text }]}>
            {participants.map((pa) => `${pa.participant_name} (${pa.participant_type})`).join(', ')}
          </Text>
        </View>
      ) : null}

      {conversation.decision_summary ? (
        <View style={[styles.decision, { backgroundColor: p.surfaceRaised, borderLeftColor: p.success }]}>
          <Text style={[styles.sectionLabel, { color: p.success }]}>Decision</Text>
          <Text style={[styles.sectionBody, { color: p.text }]}>
            {conversation.decision_summary}
          </Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: p.textMuted }]}>
          Messages ({messages.length})
        </Text>
        {messages.length === 0 ? (
          <Text style={[styles.sectionBody, { color: p.text }]}>No messages yet.</Text>
        ) : (
          messages.map((m) => (
            <View
              key={m.id}
              style={[
                styles.message,
                { backgroundColor: p.surfaceRaised, borderColor: p.border },
              ]}>
              <View style={styles.msgHeader}>
                <Text style={[styles.msgAuthor, { color: p.text }]}>{m.author_name}</Text>
                <Text style={[styles.msgMeta, { color: p.textMuted }]}>
                  {m.message_type} · {fmtRelative(m.created_at)}
                </Text>
              </View>
              <Text style={[styles.msgBody, { color: p.text, fontFamily: Fonts.mono }]}>
                {m.content}
              </Text>
            </View>
          ))
        )}
      </View>

      {actions.length > 0 ? (
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: p.textMuted }]}>Actions</Text>
          {actions.map((a) => (
            <Text key={a.id} style={[styles.sectionBody, { color: p.text }]}>
              [{a.status}] {a.assignee}: {a.description}
            </Text>
          ))}
        </View>
      ) : null}

      {links.length > 0 ? (
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: p.textMuted }]}>Links</Text>
          {links.map((l, idx) => (
            <Text
              key={idx}
              style={[styles.sectionBody, { color: p.text, fontFamily: Fonts.mono }]}>
              {l.linked_type}: {l.linked_id}
            </Text>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 18, fontWeight: '500' },
  meta: { fontSize: 12, marginTop: 4 },
  section: { marginTop: 20 },
  sectionLabel: { fontSize: 12, fontWeight: '500', marginBottom: 6 },
  sectionBody: { fontSize: 14, lineHeight: 20 },
  decision: {
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 3,
  },
  message: {
    marginTop: 10,
    padding: 12,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  msgHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  msgAuthor: { fontSize: 13, fontWeight: '500' },
  msgMeta: { fontSize: 11 },
  msgBody: { fontSize: 13, lineHeight: 19 },
  center: { flex: 1, padding: 30, alignItems: 'center', justifyContent: 'center' },
});
