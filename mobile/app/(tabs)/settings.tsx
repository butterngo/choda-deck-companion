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

import { ScreenHeader } from '@/components/screen-header';
import { Fonts } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { usePalette } from '@/lib/theme';

export default function SettingsScreen() {
  const p = usePalette();
  const { auth, loading, save, clear } = useAuth();
  const [serverUrl, setServerUrl] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (auth) {
      setServerUrl(auth.serverUrl);
      setToken(auth.token);
    }
  }, [auth]);

  const onSave = async () => {
    const trimmedUrl = serverUrl.trim().replace(/\/+$/, '');
    const trimmedToken = token.trim();
    if (!trimmedUrl || !trimmedToken) {
      Alert.alert('Missing fields', 'Server URL and token are required.');
      return;
    }
    setBusy(true);
    try {
      await save({ serverUrl: trimmedUrl, token: trimmedToken });
    } catch (e: any) {
      Alert.alert('Save failed', String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const onClear = () => {
    Alert.alert('Clear config', 'Token and server URL will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          await clear();
          setServerUrl('');
          setToken('');
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
        <Text style={[styles.hint, { color: p.textMuted }]}>
          Printed by pnpm --filter server start -- --bind 0.0.0.0.
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
            {auth ? 'Configured' : 'Not configured'}
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
