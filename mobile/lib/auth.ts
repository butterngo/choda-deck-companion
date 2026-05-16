import * as SecureStore from 'expo-secure-store';

const KEYS = {
  serverUrl: 'companion.serverUrl',
  token: 'companion.token',
  projectId: 'companion.projectId',
  projectName: 'companion.projectName',
  workspaceId: 'companion.workspaceId',
  workspaceLabel: 'companion.workspaceLabel',
} as const;

export type Auth = {
  serverUrl: string;
  token: string;
  projectId?: string;
  projectName?: string;
  workspaceId?: string;
  workspaceLabel?: string;
};

export async function readAuth(): Promise<Auth | null> {
  const [serverUrl, token, projectId, projectName, workspaceId, workspaceLabel] =
    await Promise.all([
      SecureStore.getItemAsync(KEYS.serverUrl),
      SecureStore.getItemAsync(KEYS.token),
      SecureStore.getItemAsync(KEYS.projectId),
      SecureStore.getItemAsync(KEYS.projectName),
      SecureStore.getItemAsync(KEYS.workspaceId),
      SecureStore.getItemAsync(KEYS.workspaceLabel),
    ]);
  if (!serverUrl || !token) return null;
  return {
    serverUrl,
    token,
    projectId: projectId ?? undefined,
    projectName: projectName ?? undefined,
    workspaceId: workspaceId ?? undefined,
    workspaceLabel: workspaceLabel ?? undefined,
  };
}

async function setOrDelete(key: string, value: string | undefined): Promise<void> {
  if (value) {
    await SecureStore.setItemAsync(key, value);
  } else {
    await SecureStore.deleteItemAsync(key);
  }
}

export async function saveAuth(auth: Auth): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(KEYS.serverUrl, auth.serverUrl),
    SecureStore.setItemAsync(KEYS.token, auth.token),
    setOrDelete(KEYS.projectId, auth.projectId),
    setOrDelete(KEYS.projectName, auth.projectName),
    setOrDelete(KEYS.workspaceId, auth.workspaceId),
    setOrDelete(KEYS.workspaceLabel, auth.workspaceLabel),
  ]);
}

export async function clearAuth(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(KEYS.serverUrl),
    SecureStore.deleteItemAsync(KEYS.token),
    SecureStore.deleteItemAsync(KEYS.projectId),
    SecureStore.deleteItemAsync(KEYS.projectName),
    SecureStore.deleteItemAsync(KEYS.workspaceId),
    SecureStore.deleteItemAsync(KEYS.workspaceLabel),
  ]);
}
