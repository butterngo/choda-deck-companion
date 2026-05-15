import * as SecureStore from 'expo-secure-store';

const KEYS = {
  serverUrl: 'companion.serverUrl',
  token: 'companion.token',
} as const;

export type Auth = { serverUrl: string; token: string };

export async function readAuth(): Promise<Auth | null> {
  const [serverUrl, token] = await Promise.all([
    SecureStore.getItemAsync(KEYS.serverUrl),
    SecureStore.getItemAsync(KEYS.token),
  ]);
  if (!serverUrl || !token) return null;
  return { serverUrl, token };
}

export async function saveAuth(auth: Auth): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(KEYS.serverUrl, auth.serverUrl),
    SecureStore.setItemAsync(KEYS.token, auth.token),
  ]);
}

export async function clearAuth(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(KEYS.serverUrl),
    SecureStore.deleteItemAsync(KEYS.token),
  ]);
}
