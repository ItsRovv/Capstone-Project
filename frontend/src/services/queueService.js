import api from './api';

export const queueService = {
  listToday: () => api.get('/queue/today').then((r) => r.data),
  countWaiting: () => api.get('/queue/today/count').then((r) => r.data),
  add: (patientId, consultationType = 'normal') =>
    api.post('/queue', { patient_id: patientId, consultation_type: consultationType }).then((r) => r.data),
  updateStatus: (id, status) => api.patch(`/queue/${id}/status`, { status }).then((r) => r.data),
  remove: (id) => api.delete(`/queue/${id}`).then((r) => r.data),
};
