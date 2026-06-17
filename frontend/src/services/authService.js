import api from './api';

export const authService = {
  async login(email, password) {
    const { data } = await api.post('/api/auth/login', { email, password });
    // The server sets an httpOnly cookie — we only store the public user object locally.
    return data; // { token, user }
  },
  async register(payload) {
    const { data } = await api.post('/api/auth/register', payload);
    return data;
  },
  async me() {
    const { data } = await api.get('/api/auth/me');
    return data.user;
  },
  async logout() {
    // Ask the server to clear the httpOnly cookie.
    await api.post('/api/auth/logout').catch(() => {});
  }
};
