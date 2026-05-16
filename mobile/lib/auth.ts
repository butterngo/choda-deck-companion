import * as SecureStore from 'expo-secure-store';

const KEYS = {
  serverUrl: 'companion.serverUrl',
  token: 'companion.token',
  projectId: 'companion.projectId',
  workspaceId: 'companion.workspaceId',
} as const;

export type Auth = {
  serverUrl: string;
  token: string;
  projectId?: string;
  workspaceId?: string;
};

export async function readAuth(): Promise<Auth | null> {
  const [serverUrl, token, projectId, workspaceId] = await Promise.all([
    SecureStore.getItemAsync(KEYS.serverUrl),
    SecureStore.getItemAsync(KEYS.token),
    SecureStore.getItemAsync(KEYS.projectId),
    SecureStore.getItemAsync(KEYS.workspaceId),
  ]);
  if (!serverUrl || !token) return null;
  return {
    serverUrl,
    token,
    projectId: projectId ?? undefined,
    workspaceId: workspaceId ?? undefined,
  };
}

export async function saveAuth(auth: Auth): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(KEYS.serverUrl, auth.serverUrl),
    SecureStore.setItemAsync(KEYS.token, auth.token),
    auth.projectId
      ? SecureStore.setItemAsync(KEYS.projectId, auth.projectId)
      : SecureStore.deleteItemAsync(KEYS.projectId),
    auth.workspaceId
      ? SecureStore.setItemAsync(KEYS.workspaceId, auth.workspaceId)
      : SecureStore.deleteItemAsync(KEYS.workspaceId),
  ]);
}

export async function clearAuth(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(KEYS.serverUrl),
    SecureStore.deleteItemAsync(KEYS.token),
    SecureStore.deleteItemAsync(KEYS.projectId),
    SecureStore.deleteItemAsync(KEYS.workspaceId),
  ]);
}
