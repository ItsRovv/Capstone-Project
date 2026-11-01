const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret';

jest.mock('../config/db');
jest.mock('../models/PregnancyTrackingForm');
jest.mock('../models/Patient');
jest.mock('../models/Pregnancy');
jest.mock('../models/AuditLog');

const PregnancyTrackingForm = require('../models/PregnancyTrackingForm');
const Pregnancy = require('../models/Pregnancy');
const AuditLog = require('../models/AuditLog');
const app = require('../server');

const token = (role) => `Bearer ${jwt.sign({ id: 5, role, name: role }, 'test-secret')}`;
const as = (role, method, url) => request(app)[method](`/api/v1${url}`).set('Authorization', token(role));

beforeEach(() => {
  jest.resetAllMocks();
  AuditLog.create.mockResolvedValue(1);
});

describe('Pregnancy Tracking Form syncs to the pregnancy record', () => {
  test('saving updates EDD and OB index and fills a missing LMP from the EDD', async () => {
    PregnancyTrackingForm.findByMonthYear.mockResolvedValue({ id: 3 });
    Pregnancy.findByPatientId.mockResolvedValue([{ id: 7, status: 'Ongoing' }]);
    Pregnancy.updateTracking.mockResolvedValue(true);

    const res = await as('staff', 'post', '/pregnancy-tracking').send({
      monthYear: 'November 2026',
      rows: [{ patient_id: 2, edd: '2027-01-15', obIndex: 'G2P1', deliveryDate: '' }]
    });

    expect(res.status).toBe(200);
    expect(res.body.pregnancySynced).toBe(1);
    expect(Pregnancy.updateTracking).toHaveBeenCalledWith(7, {
      edd: '2027-01-15',
      obIndex: 'G2P1',
      lmpIfMissing: '2026-04-10',
      status: null
    });
  });

  test('a delivery date marks the active pregnancy delivered', async () => {
    PregnancyTrackingForm.findByMonthYear.mockResolvedValue({ id: 3 });
    Pregnancy.findByPatientId.mockResolvedValue([{ id: 7, status: 'Ongoing' }]);
    Pregnancy.updateTracking.mockResolvedValue(true);

    const res = await as('staff', 'post', '/pregnancy-tracking').send({
      monthYear: 'November 2026',
      rows: [{ patient_id: 2, edd: '2027-01-15', deliveryDate: '2026-10-31' }]
    });

    expect(res.status).toBe(200);
    expect(Pregnancy.updateTracking).toHaveBeenCalledWith(7, expect.objectContaining({ status: 'delivered' }));
  });

  test('unparseable dates and rows without a patient are ignored', async () => {
    PregnancyTrackingForm.findByMonthYear.mockResolvedValue({ id: 3 });
    Pregnancy.findByPatientId.mockResolvedValue([{ id: 7, status: 'Ongoing' }]);
    Pregnancy.updateTracking.mockImplementation(async (id, o) => [o.edd, o.obIndex, o.lmpIfMissing, o.status].some(Boolean));

    const res = await as('staff', 'post', '/pregnancy-tracking').send({
      monthYear: 'November 2026',
      rows: [{ patient_id: 2, edd: 'not a date' }, { name: 'free text row' }]
    });

    expect(res.status).toBe(200);
    expect(Pregnancy.updateTracking).toHaveBeenCalledTimes(1);
    expect(Pregnancy.updateTracking).toHaveBeenCalledWith(7, {
      edd: null, obIndex: null, lmpIfMissing: null, status: null
    });
    expect(res.body.pregnancySynced).toBe(0);
  });

  test('a patient with no active pregnancy is skipped', async () => {
    PregnancyTrackingForm.findByMonthYear.mockResolvedValue({ id: 3 });
    Pregnancy.findByPatientId.mockResolvedValue([{ id: 7, status: 'delivered' }]);
    Pregnancy.updateTracking.mockResolvedValue(true);

    const res = await as('staff', 'post', '/pregnancy-tracking').send({
      monthYear: 'November 2026',
      rows: [{ patient_id: 2, edd: '2027-01-15' }]
    });

    expect(res.status).toBe(200);
    expect(Pregnancy.updateTracking).not.toHaveBeenCalled();
  });
});
