import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1',
  timeout: 120000,
  // Send the httpOnly auth cookie on every same-origin (and credentialed cross-origin) request.
  // The browser handles the cookie automatically — no JS access required.
  withCredentials: true
});

// Read the CSRF token from the `lc_csrf` cookie and attach it to every request.
// The backend validates this header against the cookie to prevent CSRF attacks.
api.interceptors.request.use((config) => {
  const match = document.cookie.match(/lc_csrf=([^;]+)/);
  if (match) {
    config.headers['x-csrf-token'] = match[1];
  }
  // Attach a request ID for end-to-end tracing.
  if (!config.headers['x-request-id']) {
    config.headers['x-request-id'] =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
  }
  return config;
});

// Auto-logout on 401 (token expired / cookie cleared)
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      // Notify AuthContext to clear user state — no localStorage involved.
      window.dispatchEvent(new Event('lc:logout'));
    }
    return Promise.reject(err);
  }
);

export default api;

export function apiError(err, fallback = 'Something went wrong') {
  return err?.response?.data?.message || err?.message || fallback;
}
