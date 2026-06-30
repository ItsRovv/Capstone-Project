import api from './api';

export const authService = {
  async login(email, password) {
    const { data } = await api.post('/auth/login', { email, password });
    // The server sets an httpOnly cookie — we only store the public user object locally.
    return data; // { token, user }
  },
  async register(payload) {
    const { data } = await api.post('/auth/register', payload);
    return data;
  },
  async me() {
    const { data } = await api.get('/auth/me');
    return data.user;
  },
  async logout() {
    // Ask the server to clear the httpOnly cookie.
    await api.post('/auth/logout').catch(() => {});
  },
  // Request a password-reset OTP to be emailed.
  async forgotPassword(email) {
    const { data } = await api.post('/auth/forgot-password', { email });
    return data;
  },
  // Reset the password using the emailed OTP.
  async resetPassword({ email, otp, newPassword }) {
    const { data } = await api.post('/auth/reset-password', { email, otp, newPassword });
    return data;
  },
  // Verify a newly created account using the emailed OTP.
  async verifyEmail({ email, otp }) {
    const { data } = await api.post('/auth/verify-email', { email, otp });
    return data;
  }
};
