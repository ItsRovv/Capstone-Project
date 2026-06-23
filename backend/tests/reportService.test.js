// Mock the models, DB, and AI service so no real connections or API keys are needed.
jest.mock('../config/db');
jest.mock('../models/Consultation');
jest.mock('../models/Report');
jest.mock('../services/aiService');

const db = require('../config/db');
const Consultation = require('../models/Consultation');
const Report = require('../models/Report');
const aiService = require('../services/aiService');
const { generateDailyReport, generateWeeklyReport } = require('../services/reportService');

beforeEach(() => {
  jest.clearAllMocks();
  aiService.generateReport.mockResolvedValue('Daily summary text');
  Report.save.mockResolvedValue(42);
  db.query.mockResolvedValue([[]]);
});

describe('generateDailyReport', () => {
  test('builds a daily report and persists it', async () => {
    Consultation.findByDate.mockResolvedValue([
      { id: 1, diagnosis: 'UTI', chief_complaint: 'burning urination' },
      { id: 2, diagnosis: 'Fever', chief_complaint: 'high fever 3d' }
    ]);

    const result = await generateDailyReport('2026-06-15');

    expect(Consultation.findByDate).toHaveBeenCalledWith('2026-06-15');
    expect(aiService.generateReport).toHaveBeenCalled();
    expect(Report.save).toHaveBeenCalled();
    expect(result).toMatchObject({
      id: 42,
      total_patients: 2,
      report_type: 'daily',
      date: '2026-06-15'
    });
  });

  test('works with zero consultations', async () => {
    Consultation.findByDate.mockResolvedValue([]);

    const result = await generateDailyReport('2026-06-16');

    expect(result.total_patients).toBe(0);
    expect(Report.save).toHaveBeenCalled();
  });
});

describe('generateWeeklyReport', () => {
  test('queries a 7-day inclusive window and persists the report', async () => {
    Consultation.findByDateRange.mockResolvedValue([
      { id: 1, diagnosis: 'Hypertension', chief_complaint: 'headache' }
    ]);

    const result = await generateWeeklyReport('2026-06-14');

    expect(Consultation.findByDateRange).toHaveBeenCalledWith('2026-06-08', '2026-06-14');
    expect(result.report_type).toBe('weekly');
    expect(result.range).toEqual({ start: '2026-06-08', end: '2026-06-14' });
  });
});
