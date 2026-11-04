import api from './api';

export const patientService = {
  // Returns { data, total, page, limit }
  list: (search = '', { page = 1, limit = 50 } = {}) =>
    api.get('/patients', { params: { search, page, limit } }).then((r) => r.data),
  get: (id) => api.get(`/patients/${id}`).then((r) => r.data),
  listImages: (id) => api.get(`/patients/${id}/images`).then((r) => r.data),
  uploadImage: (id, label, dataUrl) =>
    api.post(`/patients/${id}/images`, { label, dataUrl }).then((r) => r.data),
  deleteImage: (imageId) => api.delete(`/patients/images/${imageId}`).then((r) => r.data),
  imageUrl: (imageId) => `${api.defaults.baseURL}/patients/images/${imageId}`,
  create: (payload) => api.post('/patients', payload).then((r) => r.data),
  update: (id, payload) => api.put(`/patients/${id}`, payload).then((r) => r.data),
  remove: (id) => api.delete(`/patients/${id}`).then((r) => r.data),
  active: () => api.get('/patients/active').then((r) => r.data)
};
