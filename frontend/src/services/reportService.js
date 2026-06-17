import api from './api';

export const reportService = {
  list: () => api.get('/api/reports').then((r) => r.data),
  getByDate: (date) => api.get(`/api/reports/${date}`).then((r) => r.data)
};
