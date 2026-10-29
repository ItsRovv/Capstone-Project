const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret';

jest.mock('../models/Admission');
jest.mock('../models/ClinicOption');
jest.mock('../models/Consultation');
jest.mock('../models/Queue');
jest.mock('../models/Patient');
jest.mock('../models/Pregnancy');
jest.mock('../models/ConsultationTransaction');
jest.mock('../models/AuditLog');
jest.mock('../services/admissionSync', () => ({
  ...jest.requireActual('../services/admissionSync'),
  onDelivered: jest.fn().mockResolvedValue()
}));

const Admission = require('../models/Admission');
const ClinicOption = require('../models/ClinicOption');
const Patient = require('../models/Patient');
const Consultation = require('../models/Consultation');
const Queue = require('../models/Queue');
const Pregnancy = require('../models/Pregnancy');
const ConsultationTransaction = require('../models/ConsultationTransaction');
const AuditLog = require('../models/AuditLog');
const app = require('../server');

const token = (role) => `Bearer ${jwt.sign({ id: 5, role, name: role }, 'test-secret')}`;
const as = (role, method, url) => request(app)[method](`/api/v1${url}`).set('Authorization', token(role));

const stay = (over = {}) => ({ id: 10, patient_id: 1, status: 'admitted', first_name: 'Maria', last_name: 'Santos', ...over });

beforeEach(() => {
  jest.resetAllMocks();
  AuditLog.create.mockResolvedValue(1);
  ClinicOption.getSettingsMap.mockResolvedValue({ min_stay_hours: '24', followup_offsets_hours: '72,168', require_consent: 'true' });
});

describe('who can do what', () => {
  test('front-desk staff can view but not admit', async () => {
    Admission.listActive.mockResolvedValue([]);
    expect((await as('staff', 'get', '/admissions/current')).status).toBe(200);
    const res = await as('staff', 'post', '/admissions').send({ patient_id: 1 });
    expect(res.status).toBe(403);
    expect(Admission.create).not.toHaveBeenCalled();
  });

  test.each(['nurse', 'doctor', 'admin'])('%s can admit', async (role) => {
    Patient.findById.mockResolvedValue({ id: 1, first_name: 'Maria', last_name: 'Santos' });
    Admission.findActiveByPatient.mockResolvedValue(null);
    Pregnancy.findByPatientId.mockResolvedValue([{ id: 3, status: 'Ongoing' }]);
    Admission.create.mockResolvedValue(10);
    const res = await as(role, 'post', '/admissions').send({ patient_id: 1, bp: '110/70' });
    expect(res.status).toBe(201);
    expect(Admission.create).toHaveBeenCalledWith(expect.objectContaining({ patient_id: 1, pregnancy_id: 3 }), 5);
    expect(AuditLog.create).toHaveBeenCalled();
  });

  test('only the administrator changes lists and settings, everyone on staff can read', async () => {
    ClinicOption.list.mockResolvedValue([]);
    ClinicOption.getSettings.mockResolvedValue([]);
    expect((await as('staff', 'get', '/clinic/options?group=item')).status).toBe(200);
    expect((await as('staff', 'get', '/clinic/settings')).status).toBe(200);
    for (const role of ['nurse', 'doctor', 'staff']) {
      expect((await as(role, 'post', '/clinic/options').send({ option_group: 'item', label: 'x' })).status).toBe(403);
      expect((await as(role, 'put', '/clinic/settings').send({ min_stay_hours: 12 })).status).toBe(403);
    }
    ClinicOption.create.mockResolvedValue(9);
    expect((await as('admin', 'post', '/clinic/options').send({ option_group: 'item', label: 'Gloves', price: 12 })).status).toBe(201);
  });

  test('hidden list choices are only returned when asked for, so old records keep their wording', async () => {
    ClinicOption.list.mockResolvedValue([]);
    await as('nurse', 'get', '/clinic/options?group=item');
    expect(ClinicOption.list).toHaveBeenLastCalledWith({ group: 'item', includeInactive: false });
    await as('nurse', 'get', '/clinic/options?group=item&all=1');
    expect(ClinicOption.list).toHaveBeenLastCalledWith({ group: 'item', includeInactive: true });
  });
});

describe('admitting', () => {
  test('refuses a second open stay for the same patient and points to the current one', async () => {
    Patient.findById.mockResolvedValue({ id: 1, first_name: 'Maria', last_name: 'Santos' });
    Admission.findActiveByPatient.mockResolvedValue({ id: 77 });
    const res = await as('nurse', 'post', '/admissions').send({ patient_id: 1 });
    expect(res.status).toBe(409);
    expect(res.body.admissionId).toBe(77);
    expect(Admission.create).not.toHaveBeenCalled();
  });

  test('rejects bad vitals with a readable message', async () => {
    const res = await as('nurse', 'post', '/admissions').send({ patient_id: 1, pulse: 900 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/pulse/);
  });
});

describe('discharge', () => {
  const reason = { code: 'improved', active: true };

  test('cannot discharge a patient who is in labor', async () => {
    Admission.findById.mockResolvedValue(stay({ status: 'in_labor' }));
    const res = await as('nurse', 'post', '/admissions/10/discharge').send({ disposition: 'improved' });
    expect(res.status).toBe(409);
  });

  test('asks for a reason when discharging before the minimum stay, then accepts it', async () => {
    Admission.findById.mockResolvedValue(stay({ status: 'delivered' }));
    ClinicOption.findByGroupCode.mockResolvedValue(reason);
    Admission.getDelivery.mockResolvedValue({ delivered_at: new Date(Date.now() - 2 * 3600000) });
    Admission.discharge.mockResolvedValue(4);

    const early = await as('nurse', 'post', '/admissions/10/discharge').send({ disposition: 'improved' });
    expect(early.status).toBe(409);
    expect(early.body.code).toBe('MIN_STAY');
    expect(Admission.discharge).not.toHaveBeenCalled();

    const ok = await as('nurse', 'post', '/admissions/10/discharge').send({ disposition: 'improved', override_reason: 'Patient insisted, stable' });
    expect(ok.status).toBe(201);
    expect(ok.body.followups).toBe(2);
    expect(Admission.discharge.mock.calls[0][3]).toHaveLength(2);
  });

  test('no follow-ups for transfers, and none when there was no delivery', async () => {
    Admission.findById.mockResolvedValue(stay({ status: 'delivered' }));
    ClinicOption.findByGroupCode.mockResolvedValue({ code: 'transferred', active: true });
    Admission.getDelivery.mockResolvedValue({ delivered_at: new Date(Date.now() - 48 * 3600000) });
    Admission.discharge.mockResolvedValue(4);
    expect((await as('nurse', 'post', '/admissions/10/discharge').send({ disposition: 'transferred' })).body.followups).toBe(0);

    Admission.findById.mockResolvedValue(stay({ status: 'admitted' }));
    Admission.getDelivery.mockResolvedValue(null);
    ClinicOption.findByGroupCode.mockResolvedValue(reason);
    expect((await as('nurse', 'post', '/admissions/10/discharge').send({ disposition: 'improved' })).body.followups).toBe(0);
  });

  test('rejects a reason that is not in the clinic list', async () => {
    Admission.findById.mockResolvedValue(stay({ status: 'delivered' }));
    ClinicOption.findByGroupCode.mockResolvedValue(null);
    expect((await as('nurse', 'post', '/admissions/10/discharge').send({ disposition: 'made_up' })).status).toBe(400);
  });
});

describe('closed stays are locked', () => {
  test('nurse cannot edit a discharged stay, administrator can', async () => {
    Admission.findById.mockResolvedValue(stay({ status: 'discharged' }));
    Admission.update.mockResolvedValue(true);
    const denied = await as('nurse', 'put', '/admissions/10').send({ notes: 'late edit' });
    expect(denied.status).toBe(403);
    expect(denied.body.message).toMatch(/administrator/);
    expect((await as('admin', 'put', '/admissions/10').send({ notes: 'late edit' })).status).toBe(200);
  });

  test('items can still be added after discharge, but not to a referred stay by a nurse', async () => {
    ClinicOption.findById.mockResolvedValue({ id: 3, option_group: 'item', active: true, label: 'Room', price: '500.00' });
    Admission.addItem.mockResolvedValue(8);
    Admission.findById.mockResolvedValue(stay({ status: 'discharged' }));
    expect((await as('nurse', 'post', '/admissions/10/items').send({ option_id: 3, quantity: 2 })).status).toBe(201);
    expect(Admission.addItem).toHaveBeenCalledWith('10', expect.objectContaining({ label: 'Room', unit_price: 500, quantity: 2 }), 5);

    Admission.findById.mockResolvedValue(stay({ status: 'referred' }));
    expect((await as('nurse', 'post', '/admissions/10/items').send({ option_id: 3 })).status).toBe(403);
  });
});

describe('items used -> transactions', () => {
  test('creates one transaction linked to the admission, then updates it instead of duplicating', async () => {
    Admission.findById.mockResolvedValue(stay({ status: 'discharged', philhealth_package: 'mcp' }));
    Admission.listItems.mockResolvedValue([{ id: 1, option_id: 3, label: 'Room', unit_price: '500.00', quantity: '2.00' }]);
    ClinicOption.findByGroupCode.mockResolvedValue({ code: 'mcp', label: 'PhilHealth Maternity Care Package', price: '8000.00' });
    ConsultationTransaction.findByAdmissionId.mockResolvedValue([]);
    ConsultationTransaction.create.mockResolvedValue(55);

    const first = await as('nurse', 'post', '/admissions/10/transaction');
    expect(first.status).toBe(201);
    expect(first.body.total_amount).toBe(1000);
    expect(ConsultationTransaction.create).toHaveBeenCalledWith(expect.objectContaining({
      patient_id: 1, admission_id: 10, total_amount: 1000, philhealth_total: 8000
    }));

    ConsultationTransaction.findByAdmissionId.mockResolvedValue([{ id: 55, transaction_date: new Date(), recommendations: 'x' }]);
    ConsultationTransaction.update.mockResolvedValue(true);
    const again = await as('nurse', 'post', '/admissions/10/transaction');
    expect(again.status).toBe(200);
    expect(ConsultationTransaction.create).toHaveBeenCalledTimes(1);
    expect(ConsultationTransaction.update).toHaveBeenCalledWith(55, expect.objectContaining({ total_amount: 1000 }));
  });

  test('refuses an empty bill', async () => {
    Admission.findById.mockResolvedValue(stay({ philhealth_package: null }));
    Admission.listItems.mockResolvedValue([]);
    expect((await as('nurse', 'post', '/admissions/10/transaction')).status).toBe(400);
  });
});

describe('front-desk privacy', () => {
  const full = stay({ chief_complaint: 'Contractions', admitting_diagnosis: 'Term in labor', bp: '110/70', labor_notes: 'x', risk_flags: ['diabetes'], notes: 'n' });

  test('staff see status and billing but no clinical content', async () => {
    Admission.findById.mockResolvedValue(full);
    Admission.getDelivery.mockResolvedValue({ id: 1, delivered_at: new Date(), complications: 'secret', newborns: [{ notes: 'secret' }] });
    Admission.listItems.mockResolvedValue([{ id: 1, label: 'Room', unit_price: '500', quantity: '1' }]);
    Admission.getDischarge.mockResolvedValue(null);
    Admission.listFollowupsForAdmission.mockResolvedValue([{ id: 1, notes: 'secret', due_at: new Date() }]);
    Admission.getReferral.mockResolvedValue(null);

    const staff = await as('staff', 'get', '/admissions/10');
    expect(staff.status).toBe(200);
    const text = JSON.stringify(staff.body);
    for (const secret of ['Contractions', 'Term in labor', '110/70', 'secret', 'diabetes']) expect(text).not.toContain(secret);
    expect(staff.body.admission).toMatchObject({ id: 10, status: 'admitted', first_name: 'Maria' });
    expect(staff.body.itemsTotal).toBe(500);
    expect(staff.body.delivery.babies).toBe(1);

    const nurse = await as('nurse', 'get', '/admissions/10');
    expect(JSON.stringify(nurse.body)).toContain('Term in labor');
  });

  test('lists hide clinical fields from staff; prefill is clinical-only', async () => {
    Admission.listActive.mockResolvedValue([full]);
    const list = await as('staff', 'get', '/admissions/current');
    expect(list.body[0].chief_complaint).toBeUndefined();
    expect(list.body[0].first_name).toBe('Maria');
    expect((await as('staff', 'get', '/admissions/prefill/1')).status).toBe(403);
  });
});

describe('consultation: plan to deliver at JLMC', () => {
  const post = (body, role = 'doctor') => as(role, 'post', '/consultations').send({ patient_id: 1, ...body });

  beforeEach(() => {
    Patient.findById.mockResolvedValue({ id: 1 });
    Consultation.create.mockResolvedValue(30);
    Queue.findByPatientToday.mockResolvedValue(null);
  });

  test('adds an ongoing pregnancy once, so she shows up in pregnancy tracking', async () => {
    Pregnancy.findByPatientId.mockResolvedValue([]);
    Pregnancy.create.mockResolvedValue(9);
    const res = await post({ delivery_location: 'jlmc' });
    expect(res.status).toBe(201);
    expect(res.body.pregnancy_created).toBe(true);
    expect(Pregnancy.create).toHaveBeenCalledWith(1, expect.objectContaining({ status: 'Ongoing' }));
  });

  test('does not create a second pregnancy when one is already ongoing', async () => {
    Pregnancy.findByPatientId.mockResolvedValue([{ id: 2, status: 'Ongoing' }]);
    const res = await post({ delivery_location: 'jlmc' });
    expect(res.body.pregnancy_created).toBe(false);
    expect(Pregnancy.create).not.toHaveBeenCalled();
  });

  test('does nothing when the box is not ticked', async () => {
    const res = await post({});
    expect(res.body.pregnancy_created).toBe(false);
    expect(Pregnancy.findByPatientId).not.toHaveBeenCalled();
  });

  test('a failure here never loses the saved consultation', async () => {
    Pregnancy.findByPatientId.mockRejectedValue(new Error('db hiccup'));
    const res = await post({ delivery_location: 'jlmc' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(30);
  });
});
