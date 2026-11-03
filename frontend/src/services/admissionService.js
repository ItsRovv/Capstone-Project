import api from './api';

const data = (r) => r.data;

export const admissionService = {
  current: () => api.get('/admissions/current').then(data),
  ward: () => api.get('/admissions/ward').then(data),
  list: (params = {}) => api.get('/admissions', { params }).then(data),
  forPatient: (patientId) => api.get(`/admissions/patient/${patientId}`).then(data),
  latestDelivery: (patientId) => api.get(`/admissions/patient/${patientId}/latest-delivery`).then(data),
  prefill: (patientId) => api.get(`/admissions/prefill/${patientId}`).then(data),
  logbook: (month) => api.get('/admissions/logbook', { params: month ? { month } : {} }).then(data),
  get: (id) => api.get(`/admissions/${id}`).then(data),
  admit: (payload) => api.post('/admissions', payload).then(data),
  update: (id, payload) => api.put(`/admissions/${id}`, payload).then(data),
  markInLabor: (id) => api.post(`/admissions/${id}/status`, { status: 'in_labor' }).then(data),
  saveDelivery: (id, payload) => api.put(`/admissions/${id}/delivery`, payload).then(data),
  addItem: (id, payload) => api.post(`/admissions/${id}/items`, payload).then(data),
  saveChecklist: (id, payload) => api.put(`/admissions/${id}/checklist`, payload).then(data),
  labor: (id) => api.get(`/admissions/${id}/labor`).then(data),
  addLabor: (id, payload) => api.post(`/admissions/${id}/labor`, payload).then(data),
  vitals: (id) => api.get(`/admissions/${id}/vitals`).then(data),
  addVitals: (id, payload) => api.post(`/admissions/${id}/vitals`, payload).then(data),
  notes: (id) => api.get(`/admissions/${id}/notes`).then(data),
  addNote: (id, description) => api.post(`/admissions/${id}/notes`, { description }).then(data),
  correctNote: (id, noteId, description, reason) => api.put(`/admissions/${id}/notes/${noteId}`, { description, reason }).then(data),
  voidItem: (id, itemId, reason) => api.post(`/admissions/${id}/items/${itemId}/void`, { reason }).then(data),
  correctItem: (id, itemId, payload) => api.put(`/admissions/${id}/items/${itemId}`, payload).then(data),
  addBundle: (id, optionId) => api.post(`/admissions/${id}/items/bundle/${optionId}`).then(data),
  itemUsageReport: (params) => api.get('/admissions/reports/item-usage', { params }).then(data),
  itemUsageCsvUrl: (params) => `/admissions/reports/item-usage?${new URLSearchParams({ ...params, format: 'csv' })}`,
  setPackages: (id, packages) => api.put(`/admissions/${id}/packages`, { packages }).then(data),
  sendToTransactions: (id, body = {}) => api.post(`/admissions/${id}/transaction`, body).then(data),
  discharge: (id, payload) => api.post(`/admissions/${id}/discharge`, payload).then(data),
  medications: (id) => api.get(`/admissions/${id}/medications`).then(data),
  addMedication: (id, payload) => api.post(`/admissions/${id}/medications`, payload).then(data),
  history: (id) => api.get(`/admissions/${id}/history`).then(data),
  chartingActivity: (params) => api.get('/monitoring/charting-activity', { params }).then(data),
  staff: () => api.get('/admissions/staff').then(data),
  refer: (id, payload) => api.post(`/admissions/${id}/referral`, payload).then(data),
  reverseReferral: (id, reason) => api.post(`/admissions/${id}/referral/reverse`, { reason }).then(data),
  acknowledgeRisk: (id, reason) => api.post(`/admissions/${id}/risk-ack`, { reason }).then(data),
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
