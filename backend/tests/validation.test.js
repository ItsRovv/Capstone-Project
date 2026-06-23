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
});


