const svc = require('../services/admissionService');
const {
  validateAdmission, validateAdmissionUpdate, validateDelivery, validateAdmissionItem,
  validateDischarge, validateReferral, validateClinicOption, validateSetting
} = require('../middleware/validation');

describe('admission status flow', () => {
  test.each([
    ['admitted', 'in_labor', true],
    ['admitted', 'delivered', true],
    ['admitted', 'discharged', true],
    ['in_labor', 'delivered', true],
    ['in_labor', 'discharged', false],
    ['delivered', 'discharged', true],
    ['delivered', 'referred', false],
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
      packageOption: { code: 'mcp', label: 'PhilHealth Maternity Care Package' },
      packageAmount: 8000
    });
    expect(payload.total_amount).toBe(1035);
    expect(payload.philhealth_total).toBe(8000);
    expect(payload.vitamins).toEqual([
      { id: 'item_7', label: 'Room x2', price: 1000, custom: false },
      { id: 'custom_2', label: 'Gauze', price: 35, custom: true }
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
    expect(payload.vitamins[0]).toEqual({ id: 'bed_charge', label: 'Bed 2 × 2 nights', price: 1000, custom: true });
    expect(payload.total_amount).toBe(1240);
    const one = svc.buildTransactionPayload({ items: [], bed: { number: 1, nights: 1, amount: 500 } });
    expect(one.vitamins[0].label).toBe('Bed 1 × 1 night');
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
