import api from './api';

export const consultationTransactionService = {
  listAll: () => api.get('/consultation-transactions').then((r) => r.data),
  listForPatient: (patientId) =>
    api.get(`/consultation-transactions/patient/${patientId}`).then((r) => r.data),
  listForConsultation: (consultationId) =>
    api.get(`/consultation-transactions/consultation/${consultationId}`).then((r) => r.data),
  get: (id) => api.get(`/consultation-transactions/${id}`).then((r) => r.data),
  create: (payload) => api.post('/consultation-transactions', payload).then((r) => r.data),
  update: (id, payload) => api.put(`/consultation-transactions/${id}`, payload).then((r) => r.data),
  remove: (id) => api.delete(`/consultation-transactions/${id}`).then((r) => r.data)
};
