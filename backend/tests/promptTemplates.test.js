const {
  noteSummarizationPrompt,
  reportGenerationPrompt
} = require('../utils/promptTemplates');

describe('noteSummarizationPrompt', () => {
  test('embeds the raw note and asks for JSON', () => {
    const p = noteSummarizationPrompt('fever 3d cough');
    expect(p).toContain('fever 3d cough');
    expect(p).toContain('JSON');
  });
});

describe('reportGenerationPrompt', () => {
  const summary = {
    date: '2026-06-14',
    totalPatients: 24,
    complaints: ['fever', 'cough'],
    diagnoses: ['pharyngitis']
  };

  test('daily report mentions the date and totals', () => {
    const p = reportGenerationPrompt(summary);
    expect(p).toContain('daily');
    expect(p).toContain('2026-06-14');
    expect(p).toContain('24');
  });

  test('weekly report switches wording', () => {
    const p = reportGenerationPrompt({ ...summary, weekly: true });
    expect(p).toContain('weekly');
    expect(p).toContain('across the week');
  });
});
