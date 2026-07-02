import api from './api';

export const reportService = {
  list: () => api.get('/reports').then((r) => r.data),
  getByDate: (date) => api.get(`/reports/${date}`).then((r) => r.data),
  generate: (date, type = 'daily') =>
    api.post('/summary/generate-report', { date, type }).then((r) => r.data)
};
