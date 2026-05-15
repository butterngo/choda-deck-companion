import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { readAuth, saveAuth, clearAuth, type Auth } from './auth';

type AuthState = {
  auth: Auth | null;
  loading: boolean;
  save: (auth: Auth) => Promise<void>;
  clear: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<Auth | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    readAuth()
      .then((a) => setAuth(a))
      .finally(() => setLoading(false));
  }, []);

  const save = async (a: Auth) => {
    await saveAuth(a);
    setAuth(a);
  };
  const clear = async () => {
    await clearAuth();
    setAuth(null);
  };

  return <Ctx.Provider value={{ auth, loading, save, clear }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used within AuthProvider');
  return v;
}
