const {
  validatePatient,
  validateConsultation
} = require('../middleware/validation');

describe('validatePatient', () => {
  test('accepts a valid patient', () => {
    const { error } = validatePatient({
      first_name: 'Maria',
      last_name: 'Santos',
      age: 28,
      sex: 'Female',
      contact_number: '09171234567'
    });
    expect(error).toBeUndefined();
  });

  test('rejects a patient with no first name', () => {
    const { error } = validatePatient({ last_name: 'Santos' });
    expect(error).toBeDefined();
  });

  test('rejects an invalid sex value', () => {
    const { error } = validatePatient({
      first_name: 'A',
      last_name: 'B',
      sex: 'Unknown'
    });
    expect(error).toBeDefined();
  });
});

describe('validateConsultation', () => {
  test('requires patient_id', () => {
    const { error } = validateConsultation({ raw_notes: 'fever' });
    expect(error).toBeDefined();
  });

  test('accepts a valid consultation', () => {
    const { error } = validateConsultation({ patient_id: 1, raw_notes: 'fever 3d' });
    expect(error).toBeUndefined();
  });

  test('accepts a prenatal consultation with prenatal_data', () => {
    const { error, value } = validateConsultation({
      patient_id: 1,
      consultation_type: 'prenatal',
      prenatal_data: { bp: '110/70', fundic_height_cm: 20, counseling: ['Danger Signs in Early Pregnancy'] }
    });
    expect(error).toBeUndefined();
    expect(value.consultation_type).toBe('prenatal');
    expect(value.prenatal_data.bp).toBe('110/70');
  });

  test('defaults consultation_type to normal', () => {
    const { error, value } = validateConsultation({ patient_id: 1 });
    expect(error).toBeUndefined();
    expect(value.consultation_type).toBe('normal');
  });

  test('rejects an unknown consultation_type', () => {
    const { error } = validateConsultation({ patient_id: 1, consultation_type: 'telehealth' });
    expect(error).toBeDefined();
  });

  test('accepts a postnatal consultation with postnatal_data', () => {
    const { error, value } = validateConsultation({
      patient_id: 1,
      consultation_type: 'postnatal',
      postnatal_data: { visit_no: 2, bp: '110/70', services: { iron: { given: true, qty: '30' }, counseling: true }, referred: false }
    });
    expect(error).toBeUndefined();
    expect(value.consultation_type).toBe('postnatal');
    expect(value.postnatal_data.services.iron.qty).toBe('30');
  });
});


