import api from './api';

export const pregnancyTrackingService = {
  getByMonthYear: (monthYear) =>
    api.get(`/pregnancy-tracking/${monthYear}`).then((r) => r.data),
  getActivePregnancies: () =>
    api.get('/pregnancy-tracking/active-pregnancies').then((r) => r.data),
  save: (monthYear, rows) =>
    api.post('/pregnancy-tracking', { monthYear, rows }).then((r) => r.data)
};
