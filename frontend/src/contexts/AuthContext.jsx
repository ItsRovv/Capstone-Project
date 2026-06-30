import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { authService } from '../services/authService';

export const AuthContext = createContext(null);
// The user object is kept ONLY in React state — never in localStorage.
// On mount we call /api/auth/me to rehydrate from the httpOnly cookie.
// This prevents XSS from exfiltrating even non-sensitive profile data.

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // On mount: validate the httpOnly cookie by calling /me.
  // This handles both regular login and OAuth redirect flows.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const u = await authService.me();
        if (!cancelled) setUser(u);
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Listen for forced logout triggered by the axios 401 interceptor
  useEffect(() => {
    const onLogout = () => setUser(null);
    window.addEventListener('lc:logout', onLogout);
    return () => window.removeEventListener('lc:logout', onLogout);
  }, []);

  const login = useCallback(async (email, password) => {
    setLoading(true);
    try {
      const { user: u } = await authService.login(email, password);
      setUser(u);
      return u;
    } finally {
      setLoading(false);
    }
  }, []);

  const register = useCallback(async (payload) => {
    setLoading(true);
    try {
      const { user: u } = await authService.register(payload);
      setUser(u);
      return u;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    // Tell the server to clear the httpOnly cookie, then wipe local state.
    await authService.logout();
    setUser(null);
  }, []);

  // `isAuthenticated` is true when the user object exists (implies a valid cookie session).
  const isAuthenticated = Boolean(user);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
