import api from './api';

export const reportService = {
  list: () => api.get('/reports').then((r) => r.data),
  getByDate: (date) => api.get(`/reports/${date}`).then((r) => r.data)
};
