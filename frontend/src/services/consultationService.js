import api from './api';

export const consultationService = {
  listForPatient: (patientId) =>
    api.get(`/consultations/patient/${patientId}`).then((r) => r.data),
  get: (id) => api.get(`/consultations/${id}`).then((r) => r.data),
  create: (payload) => api.post('/consultations', payload).then((r) => r.data),
  update: (id, payload) => api.put(`/consultations/${id}`, payload).then((r) => r.data),
  remove: (id) => api.delete(`/consultations/${id}`).then((r) => r.data)
};
