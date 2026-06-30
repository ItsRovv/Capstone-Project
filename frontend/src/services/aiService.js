import api from './api';

export const aiService = {
  summarizeNote: (rawNote) =>
    api.post('/ai/summarize-note', { rawNote }).then((r) => r.data.structured),
  // type: 'daily' (default) | 'weekly'
  generateReport: (date, type = 'daily') =>
    api.post('/ai/generate-report', { date, type }).then((r) => r.data),
  // Summarize an existing consultation's notes by id
  summarizeConsultation: (id) =>
    api.post(`/consultations/${id}/summarize`).then((r) => r.data.structured)
};
