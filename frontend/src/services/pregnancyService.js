import api from './api';

export const pregnancyService = {
  listForPatient: (patientId) =>
    api.get(`/api/patients/${patientId}/pregnancies`).then((r) => r.data),
  create: (patientId, payload) =>
    api.post(`/api/patients/${patientId}/pregnancies`, payload).then((r) => r.data),
  update: (patientId, id, payload) =>
    api.put(`/api/patients/${patientId}/pregnancies/${id}`, payload).then((r) => r.data),
  remove: (patientId, id) =>
    api.delete(`/api/patients/${patientId}/pregnancies/${id}`).then((r) => r.data)
};
