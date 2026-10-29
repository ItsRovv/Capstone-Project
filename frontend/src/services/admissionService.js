import api from './api';

const data = (r) => r.data;

export const admissionService = {
  current: () => api.get('/admissions/current').then(data),
  list: (params = {}) => api.get('/admissions', { params }).then(data),
  forPatient: (patientId) => api.get(`/admissions/patient/${patientId}`).then(data),
  prefill: (patientId) => api.get(`/admissions/prefill/${patientId}`).then(data),
  logbook: (month) => api.get('/admissions/logbook', { params: month ? { month } : {} }).then(data),
  get: (id) => api.get(`/admissions/${id}`).then(data),
  admit: (payload) => api.post('/admissions', payload).then(data),
  update: (id, payload) => api.put(`/admissions/${id}`, payload).then(data),
  markInLabor: (id) => api.post(`/admissions/${id}/status`, { status: 'in_labor' }).then(data),
  saveDelivery: (id, payload) => api.put(`/admissions/${id}/delivery`, payload).then(data),
  addItem: (id, payload) => api.post(`/admissions/${id}/items`, payload).then(data),
  removeItem: (id, itemId) => api.delete(`/admissions/${id}/items/${itemId}`).then(data),
  sendToTransactions: (id) => api.post(`/admissions/${id}/transaction`).then(data),
  discharge: (id, payload) => api.post(`/admissions/${id}/discharge`, payload).then(data),
  refer: (id, payload) => api.post(`/admissions/${id}/referral`, payload).then(data),
  followups: (state = 'pending') => api.get('/admissions/followups', { params: { state } }).then(data),
  completeFollowup: (id, notes) => api.post(`/admissions/followups/${id}/done`, { notes }).then(data)
};

export const clinicService = {
  options: (group, { all = false } = {}) =>
    api.get('/clinic/options', { params: { ...(group ? { group } : {}), ...(all ? { all: 1 } : {}) } }).then(data),
  createOption: (payload) => api.post('/clinic/options', payload).then(data),
  updateOption: (id, payload) => api.put(`/clinic/options/${id}`, payload).then(data),
  hideOption: (id) => api.delete(`/clinic/options/${id}`).then(data),
  settings: () => api.get('/clinic/settings').then(data),
  saveSettings: (payload) => api.put('/clinic/settings', payload).then(data)
};
