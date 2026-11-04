const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret';

jest.mock('../config/db');
jest.mock('../models/PregnancyTrackingForm');
jest.mock('../models/Patient');
jest.mock('../models/Pregnancy');
jest.mock('../models/AuditLog');
jest.mock('../models/User');

const PregnancyTrackingForm = require('../models/PregnancyTrackingForm');
const Pregnancy = require('../models/Pregnancy');
const Patient = require('../models/Patient');
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

  test('a prenatal visit writes its date into the right trimester column', async () => {
    const { recordPrenatalVisit } = require('../routes/pregnancyTracking');
    Patient.findById.mockResolvedValue({ id: 2, first_name: 'Ana', last_name: 'Cruz', address: 'Sorsogon', age: 25, contact_number: '0917' });
    Pregnancy.findByPatientId.mockResolvedValue([{ id: 7, status: 'Ongoing', weeks: 20, edd: '2027-01-15', gp: 'G2P1' }]);
    PregnancyTrackingForm.findByMonthYear.mockResolvedValue(null);
    PregnancyTrackingForm.create.mockResolvedValue(1);

    const result = await recordPrenatalVisit(2, '2026-11-02T10:00:00Z');
    expect(result).toMatchObject({ monthYear: 'November 2026', column: 4, date: '11/02' });

    const [, rows] = PregnancyTrackingForm.create.mock.calls[0];
    expect(rows[0]).toMatchObject({ patient_id: 2, name: 'Ana Cruz', edd: '2027-01-15', obIndex: 'G2P1' });
    expect(rows[0].trimester[4]).toBe('11/02');
  });

  test('a prenatal visit with no pregnancy record creates one and still writes the row', async () => {
    const { recordPrenatalVisit } = require('../routes/pregnancyTracking');
    Patient.findById.mockResolvedValue({ id: 2, first_name: 'Ana', last_name: 'Cruz' });
    Pregnancy.findByPatientId.mockResolvedValue([]);
    Pregnancy.create.mockResolvedValue(9);
    PregnancyTrackingForm.findByMonthYear.mockResolvedValue(null);
    PregnancyTrackingForm.create.mockResolvedValue(1);

    const result = await recordPrenatalVisit(2, '2026-11-02', '2', { aog_lmp: '20 weeks' });
    expect(result).toBeTruthy();
    expect(Pregnancy.create).toHaveBeenCalledWith(2, expect.objectContaining({ status: 'Ongoing', weeks: 20, trimester: '2' }));

    const [monthYear, rows] = PregnancyTrackingForm.create.mock.calls[0];
    expect(monthYear).toBe('November 2026');
    expect(rows[0]).toMatchObject({ patient_id: 2, name: 'Ana Cruz' });
    expect(rows[0].trimester.some(Boolean)).toBe(true);
  });

  test('a postnatal visit stamps the postpartum "+" column on the latest pregnancy', async () => {
    const { recordPostnatalVisit } = require('../routes/pregnancyTracking');
    Patient.findById.mockResolvedValue({ id: 2, first_name: 'Ana', last_name: 'Cruz' });
    Pregnancy.findByPatientId.mockResolvedValue([{ id: 7, status: 'Completed', edd: '2026-10-01' }]);
    PregnancyTrackingForm.findByMonthYear.mockResolvedValue({
      id: 3,
      rows: [{ patient_id: 2, name: 'Ana Cruz', trimester: Array(15).fill('') }]
    });
    PregnancyTrackingForm.update.mockResolvedValue(true);

    const result = await recordPostnatalVisit(2, '2026-11-05');
    expect(result).toMatchObject({ monthYear: 'November 2026', column: 13 });

    const [, rows] = PregnancyTrackingForm.update.mock.calls[0];
    expect(rows[0].trimester[13]).toBe('11/05');
    expect(Pregnancy.create).not.toHaveBeenCalled();
  });
});
