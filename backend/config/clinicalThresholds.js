// Clinical limits used for alerts and validation in the Admission and Discharge module.
// Defaults are a starting point: "default, to be confirmed by clinic midwife/doctor".
// Change them here (one place) rather than in the rules that use them.

const THRESHOLDS = {
  fetalHeartRate: { min: 110, max: 160 },
  bloodPressure: {
    highSystolic: 140, highDiastolic: 90,
    severeSystolic: 160, severeDiastolic: 110
  },
  pulse: { watchLow: 50, watchHigh: 110, actHigh: 130 },
  breathing: { watchLow: 12, watchHigh: 24, actHigh: 30 },
  temperature: { fever: 38.0 },
  spo2: { watchBelow: 95, actBelow: 92 },
  newborn: { lowBirthWeightGrams: 2500, lowApgar5: 7 },
  minStayHours: 24,
  postpartumObservation: { everyMinutes: 15, forHours: 2 },
  prolongedActiveLaborHours: 4
};

// Values outside these are rejected as typing mistakes (not clinical alerts).
const VALID_RANGES = {
  cervix_cm: [0, 10],
  fetal_heart_rate: [60, 220],
  bp_systolic: [50, 260],
  bp_diastolic: [30, 160],
  temperature: [30, 43],
  spo2: [50, 100],
  apgar: [0, 10],
  birth_weight_grams: [300, 6500]
};

// Vitals needed before a reading can be saved.
const REQUIRED_VITALS = [
  { key: 'bp_systolic', label: 'BP top (systolic)' },
  { key: 'bp_diastolic', label: 'BP bottom (diastolic)' },
  { key: 'pulse', label: 'pulse' },
  { key: 'resp_rate', label: 'breathing' },
  { key: 'temperature', label: 'temperature' }
];

module.exports = { THRESHOLDS, VALID_RANGES, REQUIRED_VITALS };
