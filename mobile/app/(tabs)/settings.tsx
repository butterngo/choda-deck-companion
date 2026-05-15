import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Picker, type PickerOption } from '@/components/picker';
import { ScreenHeader } from '@/components/screen-header';
import { Fonts } from '@/constants/theme';
import { apiFetch, type ProjectRow, type WorkspaceRow } from '@/lib/api';
import type { Auth } from '@/lib/auth';
import { useAuth } from '@/lib/auth-context';
import { usePalette } from '@/lib/theme';

export default function SettingsScreen() {
  const p = usePalette();
  const { auth, loading, save, clear } = useAuth();
  const [serverUrl, setServerUrl] = useState('');
  const [token, setToken] = useState('');
  const [projectId, setProjectId] = useState<string | undefined>();
  const [workspaceId, setWorkspaceId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (auth) {
      setServerUrl(auth.serverUrl);
      setToken(auth.token);
      setProjectId(auth.projectId);
      setWorkspaceId(auth.workspaceId);
    }
  }, [auth]);

  const probeAuth: Auth | null =
    serverUrl.trim() && token.trim()
      ? {
          serverUrl: serverUrl.trim().replace(/\/+$/, ''),
          token: token.trim(),
        }
      : null;

  const projectsQ = useQuery({
    queryKey: ['projects', probeAuth?.serverUrl, probeAuth?.token],
    queryFn: () => apiFetch<ProjectRow[]>(probeAuth!, '/api/projects'),
    enabled: !!probeAuth,
  });

  const workspacesQ = useQuery({
    queryKey: ['workspaces', probeAuth?.serverUrl, probeAuth?.token, projectId],
    queryFn: () =>
      apiFetch<WorkspaceRow[]>(probeAuth!, `/api/workspaces?projectId=${projectId}`),
    enabled: !!probeAuth && !!projectId,
  });

  const projectOptions: PickerOption<string>[] =
    projectsQ.data?.map((pr) => ({ value: pr.id, label: pr.name, hint: pr.id })) ?? [];

  const workspaceOptions: PickerOption<string>[] =
    workspacesQ.data?.map((w) => ({ value: w.id, label: w.label, hint: w.id })) ?? [];

  const onSave = async () => {
    const trimmedUrl = serverUrl.trim().replace(/\/+$/, '');
    const trimmedToken = token.trim();
    if (!trimmedUrl || !trimmedToken) {
      Alert.alert('Missing fields', 'Server URL and token are required.');
      return;
    }
    setBusy(true);
    try {
      await save({ serverUrl: trimmedUrl, token: trimmedToken, projectId, workspaceId });
    } catch (e: any) {
      Alert.alert('Save failed', String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const onClear = () => {
    Alert.alert('Clear config', 'Token, project + workspace will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          await clear();
          setServerUrl('');
          setToken('');
          setProjectId(undefined);
          setWorkspaceId(undefined);
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: p.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title="Settings" />
      <ScrollView contentContainerStyle={styles.body}>
        {loading ? (
          <Text style={[styles.hint, { color: p.textMuted }]}>Loading…</Text>
        ) : null}

        <Text style={[styles.label, { color: p.text }]}>Server URL</Text>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: p.inputBg,
              borderColor: p.inputBorder,
              color: p.text,
              fontFamily: Fonts.mono,
            },
          ]}
          value={serverUrl}
          onChangeText={setServerUrl}
          placeholder="http://192.168.1.13:7777"
          placeholderTextColor={p.textSubtle}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <Text style={[styles.hint, { color: p.textMuted }]}>
          e.g. http://&lt;windows-LAN-IP&gt;:7777
        </Text>

        <Text style={[styles.label, { color: p.text, marginTop: 20 }]}>Bearer token</Text>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: p.inputBg,
              borderColor: p.inputBorder,
              color: p.text,
              fontFamily: Fonts.mono,
            },
          ]}
          value={token}
          onChangeText={setToken}
          placeholder="Paste token from CLI output"
          placeholderTextColor={p.textSubtle}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />

        <Text style={[styles.label, { color: p.text, marginTop: 20 }]}>Project</Text>
        <Picker
          label="Pick a project"
          value={projectId}
          options={projectOptions}
          placeholder={
            !probeAuth
              ? 'Enter server URL + token first'
              : projectsQ.isLoading
                ? 'Loading…'
                : projectsQ.isError
                  ? 'Cannot load. Check URL + token.'
                  : projectOptions.length === 0
                    ? 'No projects.'
                    : 'Pick a project'
          }
          disabled={!probeAuth || projectsQ.isLoading || projectsQ.isError}
          onChange={(v) => {
            setProjectId(v);
            setWorkspaceId(undefined);
          }}
          onClear={() => {
            setProjectId(undefined);
            setWorkspaceId(undefined);
          }}
        />
        <Text style={[styles.hint, { color: p.textMuted }]}>
          Scopes Tasks / Inbox / Convos. Leave empty for all projects.
        </Text>

        <Text style={[styles.label, { color: p.text, marginTop: 20 }]}>Workspace (optional)</Text>
        <Picker
          label="Pick a workspace"
          value={workspaceId}
          options={workspaceOptions}
          placeholder={
            !projectId
              ? 'Pick a project first'
              : workspacesQ.isLoading
                ? 'Loading…'
                : workspaceOptions.length === 0
                  ? 'No workspaces.'
                  : 'Pick a workspace'
          }
          disabled={!projectId || workspacesQ.isLoading}
          onChange={setWorkspaceId}
          onClear={() => setWorkspaceId(undefined)}
        />
        <Text style={[styles.hint, { color: p.textMuted }]}>
          Reserved for queue run context. Read views don&apos;t filter by workspace yet.
        </Text>

        <Pressable
          style={[
            styles.btn,
            { backgroundColor: p.chipBgActive },
            busy && { opacity: 0.6 },
          ]}
          onPress={onSave}
          disabled={busy}>
          <Text style={[styles.btnText, { color: p.chipTextActive }]}>
            {busy ? 'Saving…' : 'Save'}
          </Text>
        </Pressable>

        {auth ? (
          <Pressable style={[styles.btn, { marginTop: 8 }]} onPress={onClear}>
            <Text style={[styles.btnText, { color: p.danger }]}>Clear config</Text>
          </Pressable>
        ) : null}

        <View
          style={[
            styles.statusBox,
            { backgroundColor: p.surface, borderColor: p.border },
          ]}>
          <Text style={[styles.statusLabel, { color: p.textMuted }]}>Status</Text>
          <Text style={[styles.statusValue, { color: p.text }]}>
            {auth
              ? auth.projectId
                ? `${auth.projectId}${auth.workspaceId ? ` · ${auth.workspaceId}` : ''}`
                : 'Configured · all projects'
              : 'Not configured'}
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 40 },
  label: { fontSize: 13, fontWeight: '500', marginBottom: 6 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  hint: { fontSize: 12, marginTop: 4, fontWeight: '400' },
  btn: {
    marginTop: 20,
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  btnText: { fontWeight: '500', fontSize: 14 },
  statusBox: {
    marginTop: 24,
    padding: 12,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statusLabel: { fontSize: 12, fontWeight: '400' },
  statusValue: { fontSize: 14, fontWeight: '500', marginTop: 2 },
});
