/**
 * AuthContext — the session, and the only piece of app-global state.
 *
 * Everything else the portal knows is page-local: a list of projects belongs
 * to the page showing it and dies with it. The signed-in user is different
 * because the shell, the route gating and half the pages all need it at once.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { navigate } from './router';
import type { User } from './types';

export interface AuthState {
  /** undefined = /api/auth/me still in flight (boot), null = signed out. */
  user: User | null | undefined;
  login(email: string, password: string): Promise<User>; // throws ApiError on 401
  logout(): Promise<void>; // always lands on /login
  /** Replace the cached user after PUT /api/profile succeeds. */
  setUser(user: User): void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Three states, not two. `undefined` is the boot window, and keeping it
  // distinct from `null` is what stops the login card flashing for a moment in
  // front of an already-signed-in user on every page load.
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    api
      .me()
      .then(me => {
        if (!cancelled) setUser(me);
      })
      // If the boot probe fails outright — server down, offline — the honest
      // answer is "not signed in". The alternative is hanging on the spinner
      // forever with nothing the user can act on.
      .catch(() => {
        if (!cancelled) setUser(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Mid-session expiry: any 401 anywhere drops the cached user, and App's
    // ordinary gating takes it from there. Pages never see a 401 as an
    // auth problem — to them it is just a request that failed.
    api.onUnauthorized(() => setUser(null));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const signedIn = await api.login(email, password);
    setUser(signedIn);
    return signedIn;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      // The cookie is gone as far as this tab is concerned either way; a
      // failed logout call must not strand someone on a dashboard they think
      // they have left.
      setUser(null);
      navigate('/login', { replace: true });
    }
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, login, logout, setUser }),
    [user, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  // Throwing beats returning a hollow default: a page rendered outside the
  // provider would otherwise look permanently signed out and nobody would know
  // why.
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>.');
  return ctx;
}
