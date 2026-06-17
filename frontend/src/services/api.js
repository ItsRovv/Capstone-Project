import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000',
  timeout: 120000,
  // Send the httpOnly auth cookie on every same-origin (and credentialed cross-origin) request.
  // The browser handles the cookie automatically — no JS access required.
  withCredentials: true
});

// Auto-logout on 401 (token expired / cookie cleared)
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      const hadUser = localStorage.getItem('lc_user');
      if (hadUser) {
        localStorage.removeItem('lc_user');
        // Avoid hard reload loop; let AuthContext pick it up.
        window.dispatchEvent(new Event('lc:logout'));
      }
    }
    return Promise.reject(err);
  }
);

export default api;

export function apiError(err, fallback = 'Something went wrong') {
  return err?.response?.data?.message || err?.message || fallback;
}
