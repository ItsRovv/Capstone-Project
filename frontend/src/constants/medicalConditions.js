// Fixed list of conditions shown in the "Past & Present Illness / Health
// Problems" table on the patient's Medical Information section.
// Each row tracks Personal (Y/N), Family History (Y/N), and Remarks.
export const MEDICAL_CONDITIONS = [
  'Hypertension (High Blood)',
  'Diabetes',
  'Heart Disease',
  'Asthma',
  'Thyroid Disorder',
  'Seizure Disorder',
  'Tuberculosis (TB)',
  'Kidney Disease',
  'Blood Disorder',
  'Hepatitis B / C',
  'HIV / Other STIs',
  'Other infectious diseases, specify'
];

export function blankIllnessHistory() {
  return MEDICAL_CONDITIONS.map((condition) => ({
    condition,
    personal: false,
    family: false,
    remarks: ''
  }));
}

export function blankHighRiskBehavior() {
  return {
    smoking: { personal: false, family: false, remarks: '' },
    alcohol_intake: { personal: false, family: false, remarks: '' }
  };
}

export function blankMedicalInfo() {
  return {
    drug_food_allergies: [],
    medications_supplements: [],
    illness_history: blankIllnessHistory(),
    high_risk_behavior: blankHighRiskBehavior(),
    other_conditions: []
  };
}

export function blankPersonInfo() {
  return {
    first_name: '',
    last_name: '',
    date_of_birth: '',
    age: '',
    sex: 'Female',
    blood_type: '',
    civil_status: '',
    occupation: '',
    birthplace: '',
    nationality: '',
    religion: '',
    contact_number: '',
    fb_messenger: '',
    address: '',
    employer: '',
    employer_address: '',
    employer_tel: '',
    philhealth_pin: ''
  };
}

export function blankEmergencyContact() {
  return {
    name: '',
    relationship: '',
    birthday: '',
    age: '',
    phone: '',
    fb_messenger: '',
    address: ''
  };
}

export function blankPersonalInfo() {
  return {
    mommy: blankPersonInfo(),
    daddy: blankPersonInfo(),
    emergency_contact: blankEmergencyContact()
  };
}
