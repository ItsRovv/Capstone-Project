import api from './api';

export const patientService = {
  // Returns { data, total, page, limit }
  list: (search = '', { page = 1, limit = 50 } = {}) =>
    api.get('/api/patients', { params: { search, page, limit } }).then((r) => r.data),
  get: (id) => api.get(`/api/patients/${id}`).then((r) => r.data),
  create: (payload) => api.post('/api/patients', payload).then((r) => r.data),
  update: (id, payload) => api.put(`/api/patients/${id}`, payload).then((r) => r.data),
  remove: (id) => api.delete(`/api/patients/${id}`).then((r) => r.data),
  active: () => api.get('/api/patients/active').then((r) => r.data)
};
