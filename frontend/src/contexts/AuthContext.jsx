import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { authService } from '../services/authService';

export const AuthContext = createContext(null);
// We no longer store the JWT in localStorage — the server issues an httpOnly cookie
// that JavaScript cannot read (mitigates XSS token theft).
// Only the non-sensitive public user object (id, name, email, role) is kept locally
// so the UI can display the logged-in user without an extra round-trip.
const STORAGE_USER = 'lc_user';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_USER);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(false);

  // On mount: validate the httpOnly cookie by calling /me.
  // This handles both regular login and OAuth redirect flows.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const u = await authService.me();
        if (!cancelled) {
          localStorage.setItem(STORAGE_USER, JSON.stringify(u));
          setUser(u);
        }
      } catch {
        // Cookie expired or invalid — clear stale local state.
        localStorage.removeItem(STORAGE_USER);
        if (!cancelled) setUser(null);
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
      // Cookie is set by the server; we only persist the public profile locally.
      localStorage.setItem(STORAGE_USER, JSON.stringify(u));
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
      localStorage.setItem(STORAGE_USER, JSON.stringify(u));
      setUser(u);
      return u;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    // Tell the server to clear the httpOnly cookie, then wipe local state.
    await authService.logout();
    localStorage.removeItem(STORAGE_USER);
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
