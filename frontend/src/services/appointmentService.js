import api from './api';

export const appointmentService = {
  list: (date) =>
    api.get('/api/appointments', { params: date ? { date } : {} }).then((r) => r.data),
  get: (id) => api.get(`/api/appointments/${id}`).then((r) => r.data),
  create: (payload) => api.post('/api/appointments', payload).then((r) => r.data),
  update: (id, payload) => api.put(`/api/appointments/${id}`, payload).then((r) => r.data),
  remove: (id) => api.delete(`/api/appointments/${id}`).then((r) => r.data)
};
