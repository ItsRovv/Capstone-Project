/**
 * Seed mock clinic data — patients, consultations, and pregnancies.
 *
 * Creates realistic maternity clinic data spread across the last 90 days
 * so the analytics dashboard and AI reports have meaningful data to display.
 *
 * Run with: node utils/seedMockData.js
 *
 * Safe to re-run: checks if mock data already exists and skips if so.
 * To force a re-seed, pass --force: node utils/seedMockData.js --force
 */
require('dotenv').config();
const db = require('../config/db');

const FORCE = process.argv.includes('--force');

// ── Filipino name pools ──────────────────────────────────────────────────────
const FIRST_NAMES_F = [
  'Maria', 'Ana', 'Rosa', 'Luz', 'Cristina', 'Jessica', 'Maricel', 'Joanna',
  'Rachelle', 'Bea', 'Karen', 'Nancy', 'Grace', 'Cherry', 'Lovely', 'Sheryl',
  'Donna', 'Emily', 'Fatima', 'Geraldine', 'Hannah', 'Imelda', 'Janine', 'Kristine'
];
const FIRST_NAMES_M = [
  'Jose', 'Mark', 'Rommel', 'Christian', 'Emmanuel', 'Ferdinand', 'Gilbert', 'Harold'
];
const LAST_NAMES = [
  'Dela Cruz', 'Santos', 'Reyes', 'Garcia', 'Mendoza', 'Torres', 'Bautista',
  'Castro', 'Soriano', 'Navarro', 'Domingo', 'Villanueva', 'Fernandez', 'Lopez',
  'Perez', 'Ramos', 'Aquino', 'Magno', 'Grefalda', 'Jañolan', 'Mantes', 'Bolanos'
];

const BARANGAYS = [
  'Tughan, Juban', 'Biri, Juban', 'Poblacion, Juban', 'Calomagon, Juban',
  'Gestor, Juban', 'Sorsogon City', 'Bacon, Sorsogon', 'Casiguran, Sorsogon'
];

// ── Consultation templates (maternity clinic) ───────────────────────────────
const CONSULTATION_TEMPLATES = [
  {
    chief_complaint: 'Prenatal checkup',
    diagnosis: 'Normal pregnancy, low risk',
    notes: 'Prenatal checkup. Fetal heart rate normal at 140 bpm. Weight gain within normal range. Advised to continue prenatal vitamins.',
    prescription: 'Prenatal vitamins 1 tab daily'
  },
  {
    chief_complaint: 'Prenatal checkup with leg edema',
    diagnosis: 'Pregnancy with mild edema',
    notes: 'Prenatal visit. Mild bilateral leg edema. BP 110/70. No proteinuria. Advised leg elevation and adequate hydration.',
    prescription: 'Prenatal vitamins, increase fluid intake'
  },
  {
    chief_complaint: 'Postnatal checkup',
    diagnosis: 'Postpartum recovery, normal',
    notes: 'Postnatal visit. Healing well. Lochia serosa. Breastfeeding established. No signs of infection.',
    prescription: 'Continue iron supplements, follow-up in 2 weeks'
  },
  {
    chief_complaint: 'Postnatal checkup with breastfeeding concerns',
    diagnosis: 'Difficulty breastfeeding',
    notes: 'Postnatal visit. Patient reports difficulty with latching. Assessed breastfeeding technique. Provided lactation counseling.',
    prescription: 'Continue prenatal vitamins, lactation support'
  },
  {
    chief_complaint: 'Labor and delivery admission',
    diagnosis: 'Normal spontaneous delivery',
    notes: 'Admitted for active labor. Full term. Normal spontaneous vaginal delivery. Baby boy, 3.1 kg, APGAR 9/10. No complications.',
    prescription: 'Postpartum care, newborn screening'
  },
  {
    chief_complaint: 'Labor and delivery admission',
    diagnosis: 'Normal spontaneous delivery',
    notes: 'Admitted in active labor. Full term. NSD. Baby girl, 2.9 kg, APGAR 8/9. Placenta delivered intact.',
    prescription: 'Postpartum care, immunization schedule'
  },
  {
    chief_complaint: 'Family planning consultation',
    diagnosis: 'Counseling for family planning',
    notes: 'Family planning consult. Patient opted for injectable contraceptive. Counseled on options and side effects. First dose given.',
    prescription: 'DMPA injection, return in 3 months'
  },
  {
    chief_complaint: 'Family planning follow-up',
    diagnosis: 'Continuing family planning',
    notes: 'Family planning follow-up. No side effects reported. Patient satisfied with current method. Next dose scheduled.',
    prescription: 'Continue current method'
  },
  {
    chief_complaint: 'Emergency consult — vaginal bleeding',
    diagnosis: 'Threatened abortion, admitted for observation',
    notes: 'Emergency consult. Vaginal bleeding at 12 weeks. Admitted for observation. Ultrasound pending. IV fluids started.',
    prescription: 'Bed rest, IV fluids, await ultrasound'
  },
  {
    chief_complaint: 'Prenatal checkup — gestational diabetes screening',
    diagnosis: 'Gestational diabetes mellitus, diet-controlled',
    notes: 'Prenatal visit. OGTT result elevated. Counseled on diabetic diet. Fetal growth normal. Will recheck blood sugar in 2 weeks.',
    prescription: 'Diabetic diet, blood sugar monitoring log'
  },
  {
    chief_complaint: 'Prenatal checkup — urinary tract infection',
    diagnosis: 'UTI in pregnancy',
    notes: 'Prenatal visit. Patient reports dysuria. Urinalysis consistent with UTI. Started on pregnancy-safe antibiotics.',
    prescription: 'Amoxicillin 500mg TID x 7 days'
  },
  {
    chief_complaint: 'Prenatal checkup — first trimester',
    diagnosis: 'First trimester pregnancy, normal',
    notes: 'First prenatal visit. Confirmed pregnancy via urine test. LMP noted. Advised folic acid supplementation. Next visit in 4 weeks.',
    prescription: 'Folic acid 5mg daily, prenatal vitamins'
  },
  {
    chief_complaint: 'Prenatal checkup — third trimester',
    diagnosis: 'Third trimester pregnancy, normal',
    notes: 'Routine prenatal visit. Fetal heart rate 145 bpm. Fundal height appropriate for gestational age. No danger signs.',
    prescription: 'Continue prenatal vitamins, prepare for delivery'
  },
  {
    chief_complaint: 'Prenatal checkup with nausea and vomiting',
    diagnosis: 'Hyperemesis gravidarum, mild',
    notes: 'Prenatal visit with significant nausea and vomiting. Unable to keep solids down. Advised small frequent meals. Prescribed antiemetic.',
    prescription: 'Ondansetron 4mg PRN, IV fluids if unable to tolerate PO'
  },
  {
    chief_complaint: 'Postnatal checkup — 6 weeks follow-up',
    diagnosis: 'Postpartum check, cleared',
    notes: '6-week postpartum check. Incision healed (if applicable). Lochia alba. Family planning discussed. Patient cleared for normal activity.',
    prescription: 'Continue prenatal vitamins x 3 months'
  }
];

// ── Helpers ──────────────────────────────────────────────────────────────────
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDateInLastDays(days) {
  const now = new Date();
  const past = new Date(now);
  past.setDate(past.getDate() - randomInt(0, days));
  past.setHours(randomInt(8, 17), randomInt(0, 59), 0, 0);
  return past;
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function dateStr(d) {
  return d.toISOString().split('T')[0];
}

function timestampStr(d) {
  return d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '+00:00');
}

// ── Main seed function ──────────────────────────────────────────────────────
async function run() {
  await db.ready();
  console.log('✓ Connected to database. Starting mock data seed...');

  // Check if mock data already exists (look for a marker patient)
  const [existing] = await db.query(
    "SELECT COUNT(*) AS total FROM patients WHERE first_name = 'MOCKDATA_MARKER'"
  );
  if (existing[0].total > 0 && !FORCE) {
    console.log('✓ Mock data already exists. Use --force to re-seed.');
    process.exit(0);
  }

  if (FORCE) {
    console.log('  --force flag detected. Cleaning old mock data...');
    await db.execute("DELETE FROM consultations WHERE patient_id IN (SELECT id FROM patients WHERE first_name = 'MOCKDATA_MARKER')");
    await db.execute("DELETE FROM pregnancies WHERE patient_id IN (SELECT id FROM patients WHERE first_name = 'MOCKDATA_MARKER')");
    await db.execute("DELETE FROM patients WHERE first_name = 'MOCKDATA_MARKER'");
    console.log('  Old mock data cleaned.');
  }

  // ── Create 25 mock patients ──
  const patientIds = [];
  const NUM_PATIENTS = 25;

  for (let i = 0; i < NUM_PATIENTS; i++) {
    const isFemale = Math.random() > 0.05; // 95% female for maternity clinic
    const firstName = isFemale ? pick(FIRST_NAMES_F) : pick(FIRST_NAMES_M);
    const lastName = pick(LAST_NAMES);
    const age = randomInt(18, 42);
    const dob = new Date();
    dob.setFullYear(dob.getFullYear() - age);
    const address = pick(BARANGAYS);
    const contact = `09${randomInt(15, 39)}${randomInt(1000000, 9999999)}`;
    const emergencyContact = `${pick(FIRST_NAMES_F)} ${lastName}`;

    const [result] = await db.execute(
      `INSERT INTO patients (first_name, last_name, date_of_birth, age, sex, address, contact_number, emergency_contact)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'MOCKDATA_MARKER', // marker first name so we can clean up later
        lastName,
        dateStr(dob),
        age,
        isFemale ? 'Female' : 'Male',
        address,
        contact,
        emergencyContact
      ]
    );
    patientIds.push(result.insertId);
  }
  console.log(`✓ Created ${NUM_PATIENTS} mock patients`);

  // ── Create pregnancies for ~60% of patients ──
  const pregnancyRecords = [];
  for (const pid of patientIds) {
    if (Math.random() > 0.4) {
      const lmpDate = daysAgo(randomInt(7, 250));
      const eddDate = new Date(lmpDate);
      eddDate.setDate(eddDate.getDate() + 280);
      const weeksPregnant = Math.floor((new Date() - lmpDate) / (1000 * 60 * 60 * 24 * 7));
      let trimester = 'First';
      if (weeksPregnant > 27) trimester = 'Third';
      else if (weeksPregnant > 13) trimester = 'Second';

      const isOngoing = weeksPregnant < 40 && Math.random() > 0.3;
      const status = isOngoing ? 'Ongoing' : 'Completed';

      const [result] = await db.execute(
        `INSERT INTO pregnancies (patient_id, lmp, edd, gp, trimester, weeks, status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          pid,
          dateStr(lmpDate),
          dateStr(eddDate),
          `G${randomInt(1, 5)} P${randomInt(0, 4)}`,
          trimester,
          `${weeksPregnant} weeks`,
          status,
          status === 'Completed' ? 'Normal delivery. No complications.' : 'Routine prenatal monitoring.'
        ]
      );
      pregnancyRecords.push({ id: result.insertId, patientId: pid, status, lmpDate });
    }
  }
  console.log(`✓ Created ${pregnancyRecords.length} pregnancy records`);

  // ── Create consultations spread across last 90 days ──
  const NUM_CONSULTATIONS = 120;
  let consultCount = 0;

  for (let i = 0; i < NUM_CONSULTATIONS; i++) {
    const patientId = pick(patientIds);
    const template = pick(CONSULTATION_TEMPLATES);
    const visitDate = randomDateInLastDays(90);

    await db.execute(
      `INSERT INTO consultations (patient_id, visit_date, raw_notes, structured_notes, chief_complaint, diagnosis, prescription, ai_summary_used)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        patientId,
        timestampStr(visitDate),
        template.notes,
        JSON.stringify({
          chiefComplaint: template.chief_complaint,
          findings: template.notes,
          diagnosis: template.diagnosis,
          prescription: template.prescription,
          followUp: 'Follow-up in 2 weeks'
        }),
        template.chief_complaint,
        template.diagnosis,
        template.prescription,
        Math.random() > 0.5
      ]
    );
    consultCount++;
  }
  console.log(`✓ Created ${consultCount} consultations over the last 90 days`);

  // ── Create some consultations today for "today's consultations" stat ──
  const todayConsults = randomInt(3, 8);
  for (let i = 0; i < todayConsults; i++) {
    const patientId = pick(patientIds);
    const template = pick(CONSULTATION_TEMPLATES);
    const today = new Date();
    today.setHours(randomInt(8, 16), randomInt(0, 59), 0, 0);

    await db.execute(
      `INSERT INTO consultations (patient_id, visit_date, raw_notes, structured_notes, chief_complaint, diagnosis, prescription, ai_summary_used)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        patientId,
        timestampStr(today),
        template.notes,
        JSON.stringify({
          chiefComplaint: template.chief_complaint,
          findings: template.notes,
          diagnosis: template.diagnosis,
          prescription: template.prescription,
          followUp: 'Follow-up in 2 weeks'
        }),
        template.chief_complaint,
        template.diagnosis,
        template.prescription,
        true
      ]
    );
  }
  console.log(`✓ Created ${todayConsults} consultations for today`);

  // ── Summary ──
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Mock data seed complete!');
  console.log(`  Patients:      ${NUM_PATIENTS}`);
  console.log(`  Pregnancies:   ${pregnancyRecords.length}`);
  console.log(`  Consultations: ${consultCount + todayConsults} (${todayConsults} today)`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Visit /analytics to see the dashboard.');
  console.log('  Visit /reports to generate AI reports.');
  console.log('  To remove mock data: node utils/seedMockData.js --force');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  process.exit(0);
}

run().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
