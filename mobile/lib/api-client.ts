import { useMemo } from 'react';

import { createApiClient, type ApiClient } from 'shared/api';

import type { Auth } from './auth';
import { useAuth } from './auth-context';

export { ApiError } from 'shared/api';

function clientFor(auth: Auth): ApiClient {
  return createApiClient({
    baseUrl: auth.serverUrl,
    getAuthHeader: () => ({ Authorization: `Bearer ${auth.token}` }),
  });
}

export function useApiClient(): ApiClient | null {
  const { auth } = useAuth();
  return useMemo(
    () => (auth ? clientFor(auth) : null),
    [auth?.serverUrl, auth?.token],
  );
}

export function clientFromAuth(auth: Auth): ApiClient {
  return clientFor(auth);
}
