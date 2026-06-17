import api from './api';

export const consultationService = {
  listForPatient: (patientId) =>
    api.get(`/api/consultations/patient/${patientId}`).then((r) => r.data),
  get: (id) => api.get(`/api/consultations/${id}`).then((r) => r.data),
  create: (payload) => api.post('/api/consultations', payload).then((r) => r.data),
  update: (id, payload) => api.put(`/api/consultations/${id}`, payload).then((r) => r.data),
  remove: (id) => api.delete(`/api/consultations/${id}`).then((r) => r.data)
};
