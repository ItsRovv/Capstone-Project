import api from './api';

export const analyticsService = {
  getOverview: (days = 30) =>
    api.get('/analytics/overview', { params: { days } }).then((r) => r.data),
  getAiInsight: (days = 30) =>
    api.get('/analytics/ai-insight', { params: { days } }).then((r) => r.data),
  getOllamaStatus: () =>
    api.get('/analytics/ollama-status').then((r) => r.data)
};
