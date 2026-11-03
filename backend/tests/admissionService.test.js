const svc = require('../services/admissionService');
const {
  validateAdmission, validateAdmissionUpdate, validateDelivery, validateAdmissionItem,
  validateDischarge, validateReferral, validateClinicOption, validateSetting, validateVitals
} = require('../middleware/validation');

describe('admission status flow', () => {
  test.each([
    ['admitted', 'in_labor', true],
    ['admitted', 'delivered', true],
    ['admitted', 'discharged', true],
    ['in_labor', 'delivered', true],
    ['in_labor', 'discharged', false],
    ['delivered', 'discharged', true],
    ['delivered', 'referred', true],
    ['discharged', 'admitted', false],
    ['referred', 'discharged', false]
  ])('%s -> %s allowed=%s', (from, to, allowed) => {
    expect(svc.canTransition(from, to)).toBe(allowed);
  });

  test('only open stays are active', () => {
    expect(['admitted', 'in_labor', 'delivered'].every(svc.isActiveStatus)).toBe(true);
    expect(svc.isActiveStatus('discharged')).toBe(false);
    expect(svc.isActiveStatus('referred')).toBe(false);
  });
});

describe('items used totals', () => {
  test('multiplies price by quantity and rounds to centavos', () => {
    expect(svc.itemsTotal([{ unit_price: '500', quantity: '2' }, { unit_price: 35.5, quantity: 1 }])).toBe(1035.5);
    expect(svc.itemsTotal([{ unit_price: 0.1, quantity: 3 }])).toBe(0.3);
    expect(svc.itemsTotal([])).toBe(0);
  });

  test('builds a transaction: clinic items to pay, PhilHealth as reference only', () => {
    const payload = svc.buildTransactionPayload({
      items: [{ id: 1, option_id: 7, label: 'Room', unit_price: 500, quantity: 2 }, { id: 2, option_id: null, label: 'Gauze', unit_price: 35, quantity: 1 }],
      packages: [{ code: 'mcp', label: 'PhilHealth Maternity Care Package', amount: 8000 }]
    });
    expect(payload.total_amount).toBe(1035);
    expect(payload.philhealth_total).toBe(8000);
    expect(payload.vitamins).toEqual([
      { id: 'item_7', label: 'Room', price: 500, quantity: 2, charged: true, no_price: false, custom: false },
      { id: 'custom_2', label: 'Gauze', price: 35, quantity: 1, charged: true, no_price: false, custom: true }
    ]);
    expect(payload.packages).toEqual([{ code: 'MCP', label: 'PhilHealth Maternity Care Package', amount: 8000 }]);
  });

  test('no package means no PhilHealth amount', () => {
    const payload = svc.buildTransactionPayload({ items: [{ id: 1, label: 'x', unit_price: 5, quantity: 1 }] });
    expect(payload.packages).toEqual([]);
    expect(payload.philhealth_total).toBe(0);
  });
});

describe('minimum stay and follow-ups', () => {
  const delivered = new Date('2026-10-24T08:00:00Z');

  test('reminds when discharged before the minimum stay', () => {
    const r = svc.checkMinStay(delivered, 24, new Date('2026-10-24T20:30:00Z'));
    expect(r).toEqual({ ok: false, hoursStayed: 12, requiredHours: 24 });
  });

  test('ok after the minimum stay, or when the rule is 0', () => {
    expect(svc.checkMinStay(delivered, 24, new Date('2026-10-25T08:00:00Z')).ok).toBe(true);
    expect(svc.checkMinStay(delivered, 0, delivered).ok).toBe(true);
  });

  test('parses the follow-up setting and ignores junk', () => {
    expect(svc.parseOffsets('72,168')).toEqual([72, 168]);
    expect(svc.parseOffsets(' 72 , abc, 0, 24 ')).toEqual([72, 24]);
    expect(svc.parseOffsets('')).toEqual([]);
  });

  test('due dates are counted from the discharge time', () => {
    const [d3, d7] = svc.followupDueDates('2026-10-24T08:00:00Z', [72, 168]);
    expect(d3.toISOString()).toBe('2026-10-27T08:00:00.000Z');
    expect(d7.toISOString()).toBe('2026-10-31T08:00:00.000Z');
  });
});

describe('validation', () => {
  test('admission needs a patient and sensible vitals', () => {
    expect(validateAdmission({}).error).toBeDefined();
    expect(validateAdmission({ patient_id: 1 }).error).toBeUndefined();
    expect(validateAdmission({ patient_id: 1, pulse: 500 }).error).toBeDefined();
    expect(validateAdmission({ patient_id: 1, temperature: 10 }).error).toBeDefined();
    expect(validateAdmission({ patient_id: 1, surprise: 'x' }).error).toBeDefined();
  });

  test('admission update cannot move the stay to another patient', () => {
    expect(validateAdmissionUpdate({ patient_id: 2 }).error).toBeDefined();
    expect(validateAdmissionUpdate({ bp: '120/80' }).error).toBeUndefined();
  });

  test('strips script tags from free text', () => {
    const { value } = validateAdmission({ patient_id: 1, chief_complaint: 'pain<script>alert(1)</script>' });
    expect(value.chief_complaint).toBe('pain');
  });

  test('delivery limits babies and APGAR range', () => {
    expect(validateDelivery({ newborns: [{ sex: 'Female', weight_grams: 3000, apgar_1: 8, apgar_5: 9 }] }).error).toBeUndefined();
    expect(validateDelivery({ newborns: [{ apgar_1: 11 }] }).error).toBeDefined();
    expect(validateDelivery({ newborns: Array(7).fill({}) }).error).toBeDefined();
  });

  test('items need an option or a label, and a positive quantity', () => {
    expect(validateAdmissionItem({}).error).toBeDefined();
    expect(validateAdmissionItem({ option_id: 3 }).error).toBeUndefined();
    expect(validateAdmissionItem({ label: 'Gauze', unit_price: 10, quantity: 0 }).error).toBeDefined();
  });

  test('discharge needs a reason; referral needs a facility', () => {
    expect(validateDischarge({}).error).toBeDefined();
    expect(validateDischarge({ disposition: 'improved' }).error).toBeUndefined();
    expect(validateReferral({ reason: 'x' }).error).toBeDefined();
    expect(validateReferral({ facility: 'Provincial Hospital' }).error).toBeUndefined();
  });

  test('settings: known keys only, with valid values', () => {
    expect(validateSetting('min_stay_hours', 24).error).toBeUndefined();
    expect(validateSetting('min_stay_hours', -1).error).toBeDefined();
    expect(validateSetting('followup_offsets_hours', '72,168').error).toBeUndefined();
    expect(validateSetting('followup_offsets_hours', 'three days').error).toBeDefined();
    expect(validateSetting('nope', 1).error).toBeDefined();
  });

  test('list options: valid group, no odd codes', () => {
    expect(validateClinicOption({ option_group: 'item', label: 'Gloves', price: 12 }).error).toBeUndefined();
    expect(validateClinicOption({ option_group: 'bogus', label: 'x' }).error).toBeDefined();
    expect(validateClinicOption({ option_group: 'item', label: 'x', code: 'has space' }).error).toBeDefined();
    expect(validateClinicOption({ option_group: 'item', label: 'x', price: -5 }).error).toBeDefined();
  });
});

describe('ward beds and nightly charge', () => {
  test('counts calendar nights in Philippine time, never less than one', () => {
    expect(svc.countNights('2026-10-24T15:00:00Z', '2026-10-24T22:00:00Z')).toBe(1);
    expect(svc.countNights('2026-10-24T14:00:00Z', '2026-10-26T01:00:00Z')).toBe(2);
    expect(svc.countNights('2026-10-24T01:00:00Z', '2026-10-24T02:00:00Z')).toBe(1);
    expect(svc.countNights('2026-10-24T01:00:00Z', '2026-10-27T01:00:00Z')).toBe(3);
  });

  test('bed charge is price x nights, and zero when no price is set', () => {
    const base = { bedNumber: 2, start: '2026-10-24T14:00:00Z', end: '2026-10-26T01:00:00Z' };
    expect(svc.bedCharge({ ...base, pricePerNight: '500' })).toMatchObject({ number: 2, nights: 2, amount: 1000, priceSet: true });
    expect(svc.bedCharge({ ...base, pricePerNight: null })).toMatchObject({ amount: 0, priceSet: false });
    expect(svc.bedCharge({ ...base, pricePerNight: '' }).priceSet).toBe(false);
    expect(svc.bedCharge({ ...base, bedNumber: null, pricePerNight: 500 }).amount).toBe(0);
  });

  test('picks the lowest free bed, or null when full', () => {
    expect(svc.firstFreeBed(3, [])).toBe(1);
    expect(svc.firstFreeBed(3, [1, 3])).toBe(2);
    expect(svc.firstFreeBed(3, [1, 2, 3])).toBeNull();
    expect(svc.firstFreeBed(3, ['1', '2'])).toBe(3);
  });

  test('the bed becomes the first line of the bill and is part of the total', () => {
    const payload = svc.buildTransactionPayload({
      items: [{ id: 2, option_id: 5, label: 'IV fluids', unit_price: 120, quantity: 2 }],
      bed: { number: 2, nights: 2, amount: 1000 }
    });
    expect(payload.vitamins[0]).toEqual({ id: 'bed_charge', label: 'Bed 2', price: 500, quantity: 2, charged: true, no_price: false, custom: true });
    expect(payload.total_amount).toBe(1240);
    const one = svc.buildTransactionPayload({ items: [], bed: { number: 1, nights: 1, amount: 500 } });
    expect(one.vitamins[0].label).toBe('Bed 1');
    expect(one.vitamins[0].quantity).toBe(1);
    expect(one.vitamins[0].price).toBe(500);
    const unpriced = svc.buildTransactionPayload({ items: [], bed: { number: 3, nights: 1, priceSet: false, amount: 0 } });
    expect(unpriced.vitamins[0].no_price).toBe(true);
    expect(unpriced.vitamins[0].price).toBe(0);
  });

  test('ward settings are validated', () => {
    expect(validateSetting('ward_beds', 3).error).toBeUndefined();
    expect(validateSetting('ward_beds', 0).error).toBeDefined();
    expect(validateSetting('ward_name', 'Ward').error).toBeUndefined();
    expect(validateSetting('ward_name', '').error).toBeDefined();
    expect(validateSetting('bed_price_per_night', '').error).toBeUndefined();
    expect(validateSetting('bed_price_per_night', 500).error).toBeUndefined();
    expect(validateSetting('bed_price_per_night', -1).error).toBeDefined();
    expect(validateAdmission({ patient_id: 1, bed_number: 2 }).error).toBeUndefined();
    expect(validateAdmission({ patient_id: 1, bed_number: 0 }).error).toBeDefined();
  });
});

describe('Admission and Discharge Record (auto-filled)', () => {
  const now = new Date('2026-11-10T00:00:00Z');

  test('age is worked out from the birth date, so it stays up to date', () => {
    expect(svc.ageFromBirthDate('2000-11-11', 20, now)).toBe(25);
    expect(svc.ageFromBirthDate('2000-11-10', 20, now)).toBe(26);
    expect(svc.ageFromBirthDate(null, 31, now)).toBe(31);
    expect(svc.ageFromBirthDate(null, undefined, now)).toBeNull();
  });

  test('builds the read-only record from the profile, with father and mother names', () => {
    const record = svc.buildPatientRecord({
      id: 1, first_name: 'Maria', last_name: 'Cruz', date_of_birth: '1998-05-01', age: 20, sex: 'Female',
      address: 'Tughan, Juban', contact_number: '0917',
      personal_info: {
        mommy: { civil_status: 'Married', nationality: 'Filipino', religion: 'Catholic', birthplace: 'Sorsogon City' },
        daddy: { first_name: 'Juan', last_name: 'Cruz' }
      }
    }, now);
    expect(record).toMatchObject({
      patient_id: 1, age: 28, nationality: 'Filipino', religion: 'Catholic', civil_status: 'Married',
      birthplace: 'Sorsogon City', mother_name: 'Maria Cruz', father_name: 'Juan Cruz'
    });
    expect(svc.buildPatientRecord(null)).toBeNull();
  });

  test('suggests old when she has a previous stay or check-up, new otherwise', () => {
    expect(svc.suggestAdmissionType({ priorAdmissions: 0, consultations: 0 })).toBe('new');
    expect(svc.suggestAdmissionType({ priorAdmissions: 1 })).toBe('old');
    expect(svc.suggestAdmissionType({ consultations: 2 })).toBe('old');
  });

  test('type of admission only accepts the three known values', () => {
    expect(validateAdmission({ patient_id: 1, admission_type: 'former_opd' }).error).toBeUndefined();
    expect(validateAdmission({ patient_id: 1, admission_type: 'walk-in' }).error).toBeDefined();
  });
});

describe("Midwives' Notes helpers", () => {
  test('initials come from the first and last name', () => {
    expect(svc.initialsOf('Maria Santos')).toBe('MS');
    expect(svc.initialsOf('Ana Luisa Reyes')).toBe('AR');
    expect(svc.initialsOf('Cher')).toBe('CH');
    expect(svc.initialsOf('')).toBe('');
  });

  test('shift follows the paper sheet in Philippine time', () => {
    expect(svc.shiftOf('2026-10-31T00:30:00Z')).toBe('morning');   // 08:30 PHT
    expect(svc.shiftOf('2026-10-31T03:59:00Z')).toBe('morning');   // 11:59 PHT
    expect(svc.shiftOf('2026-10-31T04:00:00Z')).toBe('afternoon'); // 12:00 PHT
    expect(svc.shiftOf('2026-10-31T08:30:00Z')).toBe('afternoon'); // 16:30 PHT
    expect(svc.shiftOf('2026-10-31T09:59:00Z')).toBe('afternoon'); // 17:59 PHT
    expect(svc.shiftOf('2026-10-31T10:00:00Z')).toBe('evening');    // 18:00 PHT
    expect(svc.shiftOf('2026-10-31T14:10:00Z')).toBe('evening');   // 22:10 PHT
    expect(svc.shiftOf('2026-10-31T21:59:00Z')).toBe('evening');    // 05:59 PHT
    expect(svc.shiftOf('2026-10-31T22:00:00Z')).toBe('morning');    // 06:00 PHT
  });
});

describe('vital signs early warning', () => {
  test('a normal reading scores zero', () => {
    const r = svc.scoreVitals({ bp_systolic: 115, bp_diastolic: 72, pulse: 84, resp_rate: 18, temperature: 36.8, spo2: 98, fetal_heart_rate: 140 });
    expect(r).toMatchObject({ total: 0, level: 'normal', fetalAlert: false });
  });

  test('one slightly off sign means watch, one badly off sign means urgent', () => {
    expect(svc.scoreVitals({ temperature: 37.4 }).level).toBe('watch');
    const high = svc.scoreVitals({ bp_systolic: 165, bp_diastolic: 105 });
    expect(high.level).toBe('urgent');
    expect(high.signs).toMatchObject({ bp_systolic: 2, bp_diastolic: 2 });
  });

  test("the baby's heartbeat outside 110-160 is urgent even when mother's signs are fine", () => {
    expect(svc.scoreVitals({ pulse: 80, fetal_heart_rate: 100 })).toMatchObject({ fetalAlert: true, level: 'urgent' });
    expect(svc.scoreVitals({ fetal_heart_rate: 161 }).fetalAlert).toBe(true);
  });

  test('blank values are ignored and an empty reading is not accepted', () => {
    expect(svc.scoreVitals({ pulse: '', resp_rate: null }).total).toBe(0);
    expect(validateVitals({}).error).toBeDefined();
    const full = { bp_systolic: 118, bp_diastolic: 76, pulse: 80, resp_rate: 18, temperature: 36.8 };
    expect(validateVitals(full).error).toBeUndefined();
    expect(validateVitals({ ...full, pulse: 900 }).error).toBeDefined();
  });

  test('a reading without all required signs is incomplete, never "normal"', () => {
    expect(svc.scoreVitals({ pulse: 80 })).toMatchObject({ level: 'incomplete' });
    expect(svc.missingVitals({ pulse: 80 })).toEqual(['BP top (systolic)', 'BP bottom (diastolic)', 'breathing', 'temperature']);
    expect(validateVitals({ pulse: 80 }).error.message).toMatch(/Incomplete reading/);
    expect(svc.scoreVitals({ bp_systolic: 118, bp_diastolic: 76, pulse: 80, resp_rate: 18, temperature: 36.8 }).level).toBe('normal');
  });

  test('red readings give referral reasons from the configured limits', () => {
    expect(svc.vitalsReferralReasons({ bp_systolic: 165, fetal_heart_rate: 90, spo2: 90, temperature: 38.2 }))
      .toEqual(expect.arrayContaining(['Severe high blood pressure', "Baby's heartbeat outside the normal range", 'Low oxygen level', 'Fever']));
    expect(svc.vitalsReferralReasons({ bp_systolic: 120, bp_diastolic: 80, pulse: 80 })).toEqual([]);
  });
});

describe('item usage rules', () => {
  test('voided and not-charged lines add nothing to the bill but stay visible', () => {
    const items = [
      { id: 1, label: 'Oxytocin', unit_price: 100, quantity: 2, charged: true },
      { id: 2, label: 'Diaper', unit_price: 5, quantity: 6, charged: false },
      { id: 3, label: 'Mistake', unit_price: 50, quantity: 1, charged: true, voided_at: new Date() }
    ];
    expect(svc.itemsTotal(items)).toBe(200);
    const vitamins = svc.buildTransactionPayload({ items }).vitamins;
    // Not-charged lines are listed for usage transparency at ₱0; voided lines are dropped.
    expect(vitamins.map((v) => v.label)).toEqual(['Oxytocin', 'Diaper']);
    expect(vitamins.find((v) => v.label === 'Diaper')).toMatchObject({ charged: false, price: 0, quantity: 6 });
    expect(svc.buildTransactionPayload({ items }).total_amount).toBe(200);
  });

  test('incomplete total while a charged item or the bed has no price', () => {
    expect(svc.incompleteTotal([{ label: 'A', charged: true, price_missing: true }]).incomplete).toBe(true);
    expect(svc.incompleteTotal([{ label: 'A', charged: false, price_missing: true }]).incomplete).toBe(false);
    expect(svc.incompleteTotal([{ label: 'A', charged: true, price_missing: true, voided_at: new Date() }]).incomplete).toBe(false);
    expect(svc.incompleteTotal([], { number: 1, priceSet: false }).bedUnpriced).toBe(true);
    expect(svc.incompleteTotal([], { number: 1, priceSet: true }).incomplete).toBe(false);
  });

  test('quantity checks', () => {
    expect(svc.checkQuantity(3).ok).toBe(true);
    for (const bad of [0, -1, 1.5, 'x', null]) expect(svc.checkQuantity(bad).code).toBe('BAD_QUANTITY');
    expect(svc.checkQuantity(25).code).toBe('LARGE_QUANTITY');
    expect(svc.checkQuantity(25, { confirmLarge: true }).ok).toBe(true);
  });

  test('allergy matching by name and drug class', () => {
    expect(svc.allergyConflict('Aspirin', { label: 'Mefenamic acid', allergy_tags: 'nsaid,aspirin' })).toBe('aspirin');
    expect(svc.allergyConflict('NSAIDs', { label: 'Pain reliever', allergy_tags: 'nsaid' })).toBe('nsaids');
    expect(svc.allergyConflict('penicillin, latex', { label: 'Amoxicillin', allergy_tags: 'penicillin,amoxicillin' })).toBe('penicillin');
    expect(svc.allergyConflict('shellfish', { label: 'Mefenamic acid', allergy_tags: 'nsaid' })).toBeNull();
    expect(svc.allergyConflict('', { label: 'Anything' })).toBeNull();
  });

  test('newborn care creates one keyed usage line per baby and item', () => {
    const refs = svc.newbornItemRefs([{ essential_care: ['vitamin_k', 'drying', 'bcg'] }, { essential_care: ['vitamin_k'] }]);
    expect(refs.map((r) => r.ref_key)).toEqual(['baby1:vitamin_k', 'baby1:bcg', 'baby2:vitamin_k']);
    expect(refs[2]).toMatchObject({ item_code: 'newborn_vitamin_k', used_for: 'baby_2' });
  });
});

describe('risk flags and discharge gating', () => {
  test('referral-level flags block a normal delivery until a reason is recorded', () => {
    expect(svc.deliveryRiskConflict({ riskFlags: ['placenta_previa'], ackReason: null, deliveryType: 'nsd' }).labels[0]).toMatch(/placenta/i);
    expect(svc.deliveryRiskConflict({ riskFlags: ['previous_cs'], ackReason: '', deliveryType: undefined })).not.toBeNull();
    expect(svc.deliveryRiskConflict({ riskFlags: ['placenta_previa'], ackReason: 'Doctor reviewed', deliveryType: 'nsd' })).toBeNull();
    expect(svc.deliveryRiskConflict({ riskFlags: ['diabetes'], ackReason: null, deliveryType: 'nsd' })).toBeNull();
  });

  test('routine discharge is blocked without baby details or with an unresolved flag', () => {
    const noBaby = svc.dischargeBlockers({ delivery: { newborns: [] }, riskFlags: [], disposition: 'improved', hasOverride: false });
    expect(noBaby.map((b) => b.code)).toEqual(['NO_BABY']);
    expect(svc.dischargeBlockers({ delivery: { newborns: [] }, riskFlags: [], disposition: 'improved', hasOverride: true })).toEqual([]);
    const risky = svc.dischargeBlockers({ delivery: { newborns: [{}] }, riskFlags: ['breech'], riskAckReason: '', disposition: 'improved' });
    expect(risky[0].code).toBe('RISK_UNRESOLVED');
    expect(svc.dischargeBlockers({ delivery: { newborns: [] }, riskFlags: ['breech'], disposition: 'transferred' })).toEqual([]);
  });

  test('newborn alerts for low weight and low 5-minute APGAR', () => {
    expect(svc.newbornReferralReasons({ weight_grams: 2300, apgar_5: 6 })).toEqual(['Low birth weight', 'Low 5-minute APGAR']);
    expect(svc.newbornReferralReasons({ weight_grams: 3100, apgar_5: 9 })).toEqual([]);
  });
});
