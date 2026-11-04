-- database/schema.sql — Postgres (Supabase) schema
--
-- This file is the canonical reference. On Supabase you can paste it into the
-- SQL Editor, or it is applied automatically and idempotently on API startup
-- by backend/utils/migrate.js. Every statement is safe to re-run.

-- ── updated_at trigger helper ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = '';

-- ── Schema migrations for existing tables (safe to re-run) ──────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS apple_id VARCHAR(255) UNIQUE;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(50) UNIQUE;

-- Patient profiling overhaul: structured Personal Information (Mommy/Daddy/
-- Emergency contact — OB patients only) and Medical Information (allergies,
-- medications, illness history, high-risk behavior) as encrypted JSONB blobs.
-- Legacy `allergies` / `emergency_contact` text columns are kept for backward
-- compatibility and are migrated into these JSONB fields on first edit.
ALTER TABLE patients ADD COLUMN IF NOT EXISTS personal_info TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS medical_info TEXT;

-- Prenatal visit baseline data (Image 3) — extends the existing pregnancy
-- record. All optional/nullable since the first prenatal visit form can be
-- skipped.
ALTER TABLE pregnancies ADD COLUMN IF NOT EXISTS baseline_weight_kg NUMERIC;
ALTER TABLE pregnancies ADD COLUMN IF NOT EXISTS baseline_height_cm NUMERIC;
ALTER TABLE pregnancies ADD COLUMN IF NOT EXISTS baseline_bmi NUMERIC;
ALTER TABLE pregnancies ADD COLUMN IF NOT EXISTS aog VARCHAR(20);
ALTER TABLE pregnancies ADD COLUMN IF NOT EXISTS ob_index VARCHAR(20);
ALTER TABLE pregnancies ADD COLUMN IF NOT EXISTS blood_type VARCHAR(5);
ALTER TABLE pregnancies ADD COLUMN IF NOT EXISTS pregnancy_number INT;
ALTER TABLE pregnancies ADD COLUMN IF NOT EXISTS first_visit_date DATE;

-- ── patients ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patients (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  date_of_birth DATE,
  age INT,
  sex VARCHAR(10) CHECK (sex IN ('Male', 'Female', 'Other')),
  address TEXT,
  contact_number VARCHAR(20),
  emergency_contact VARCHAR(100),
  allergies TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── users ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  username VARCHAR(50) UNIQUE,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  role VARCHAR(20) NOT NULL DEFAULT 'staff'
    CHECK (role IN ('admin', 'doctor', 'nurse', 'midwife', 'staff')),
  -- Social login identifiers (OAuth)
  google_id VARCHAR(255) UNIQUE,
  apple_id VARCHAR(255) UNIQUE,
  -- Account lockout: incremented on every failed login; cleared on success.
  failed_login_attempts INT NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ NULL,
  -- Email verification: new accounts must verify via an emailed OTP before login.
  -- OAuth accounts are auto-verified since the provider verified the email.
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  -- One-time password (OTP) for email verification and password reset.
  -- The code itself is stored hashed; never in plaintext.
  otp_code_hash VARCHAR(255) NULL,
  otp_expires_at TIMESTAMPTZ NULL,
  otp_purpose VARCHAR(20) NULL
    CHECK (otp_purpose IN ('password_reset', 'email_verify')),
  otp_attempts INT NOT NULL DEFAULT 0,
  last_seen_at TIMESTAMPTZ NULL,
  allowed_modules JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- For databases created before activity tracking existed.
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS allowed_modules JSONB;
-- Normalize type: some databases have this column as text[] from an earlier migration.
ALTER TABLE users ALTER COLUMN allowed_modules TYPE JSONB USING to_jsonb(allowed_modules);

-- The admission midwife account only works in Admission and Discharge.
-- Widen the role check for databases created before the 'midwife' role existed.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'doctor', 'nurse', 'midwife', 'staff'));

-- ── consultations ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS consultations (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  patient_id BIGINT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id BIGINT REFERENCES users(id),
  visit_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_notes TEXT,                        -- What doctor types (unstructured)
  structured_notes TEXT,                 -- AI-summarized output
  chief_complaint VARCHAR(255),
  diagnosis VARCHAR(255),
  prescription TEXT,
  subjective TEXT,                       -- S.O.A.P. — patient-reported symptoms/history
  objective TEXT,                        -- S.O.A.P. — exam findings, vitals, measurements
  assessment TEXT,                       -- S.O.A.P. — clinical assessment/diagnosis
  plan TEXT,                             -- S.O.A.P. — treatment/follow-up plan
  delivery_location VARCHAR(100),          -- Where patient plans to deliver (e.g., 'JLMC' or a custom uppercase facility name)
  consultation_type VARCHAR(20) NOT NULL DEFAULT 'normal'
    CHECK (consultation_type IN ('normal', 'prenatal', 'postnatal')),
  prenatal_data TEXT,                      -- Encrypted JSON: per-visit prenatal checkup fields
  postnatal_data TEXT,                     -- Encrypted JSON: per-visit postpartum care fields
  ai_summary_used BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- S.O.A.P. consultation notes (Subjective, Objective, Assessment, Plan) —
-- migration for pre-existing `consultations` tables.
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS subjective TEXT;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS objective TEXT;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS assessment TEXT;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS plan TEXT;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS delivery_location VARCHAR(100);
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS consultation_type VARCHAR(20) NOT NULL DEFAULT 'normal';
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS prenatal_data TEXT;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS postnatal_data TEXT;

-- ── consultation_transactions ────────────────────────────────────────────────
-- Records PhilHealth package charges and the doctor's vitamin/medicine
-- recommendations for a patient. Optionally linked to a specific S.O.A.P.
-- consultation visit, but always tied to a patient. Separate from
-- `consultations` so it can be recorded independently of a S.O.A.P. note.
CREATE TABLE IF NOT EXISTS consultation_transactions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  patient_id BIGINT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  consultation_id BIGINT REFERENCES consultations(id) ON DELETE SET NULL,
  created_by BIGINT REFERENCES users(id),
  transaction_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  packages JSONB NOT NULL DEFAULT '[]',   -- [{ code, label, amount }, ...] selected PhilHealth packages (reference only)
  vitamins JSONB NOT NULL DEFAULT '[]',   -- [{ id, label, price, custom }, ...] vitamins charged at clinic
  recommendations TEXT,                    -- Doctor's suggested vitamins/medicines/vaccines (encrypted)
  total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,        -- total to pay = vitamins only
  philhealth_total NUMERIC(10, 2) NOT NULL DEFAULT 0,    -- PhilHealth total (reference only, not charged)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migrations for existing tables
ALTER TABLE consultation_transactions ADD COLUMN IF NOT EXISTS vitamins JSONB NOT NULL DEFAULT '[]';
ALTER TABLE consultation_transactions ADD COLUMN IF NOT EXISTS philhealth_total NUMERIC(10, 2) NOT NULL DEFAULT 0;

DROP TRIGGER IF EXISTS trg_consultation_transactions_updated_at ON consultation_transactions;
CREATE TRIGGER trg_consultation_transactions_updated_at BEFORE UPDATE ON consultation_transactions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── patient_images ──────────────────────────────────────────────────────
-- Scanned/photographed results (ultrasound, labs) uploaded to a patient's
-- overview. Binary kept in BYTEA so backups include it.
CREATE TABLE IF NOT EXISTS patient_images (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  patient_id BIGINT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  pregnancy_id BIGINT REFERENCES pregnancies(id) ON DELETE SET NULL,
  label VARCHAR(150) NOT NULL,
  mime VARCHAR(60) NOT NULL,
  data BYTEA NOT NULL,
  uploaded_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE patient_images ADD COLUMN IF NOT EXISTS pregnancy_id BIGINT REFERENCES pregnancies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_consultation_transactions_patient ON consultation_transactions (patient_id);
CREATE INDEX IF NOT EXISTS idx_consultation_transactions_consultation ON consultation_transactions (consultation_id);


-- ── clinic_reports ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clinic_reports (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  report_date DATE NOT NULL,
  report_type VARCHAR(10) NOT NULL DEFAULT 'daily'
    CHECK (report_type IN ('daily', 'weekly', 'monthly')),
  ai_generated_text TEXT,               -- AI-generated report text
  total_patients INT,
  metrics JSONB NULL,                     -- Structured analytics (complaints, diagnoses, trends, etc.)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Widen report_type check to allow 'monthly' census reports — migration for
-- pre-existing `clinic_reports` tables (the CREATE TABLE above only applies
-- the wider constraint on first creation).
ALTER TABLE clinic_reports DROP CONSTRAINT IF EXISTS clinic_reports_report_type_check;
ALTER TABLE clinic_reports ADD CONSTRAINT clinic_reports_report_type_check
  CHECK (report_type IN ('daily', 'weekly', 'monthly'));

-- ── updated_at triggers ───────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_patients_updated_at ON patients;
CREATE TRIGGER trg_patients_updated_at BEFORE UPDATE ON patients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_consultations_updated_at ON consultations;
CREATE TRIGGER trg_consultations_updated_at BEFORE UPDATE ON consultations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── pregnancies ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pregnancies (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  patient_id BIGINT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  lmp DATE,
  edd DATE,
  gp VARCHAR(20),
  trimester VARCHAR(20),
  weeks VARCHAR(20),
  status VARCHAR(30),
  notes TEXT,
  pregnancy_history JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE pregnancies ADD COLUMN IF NOT EXISTS pregnancy_history JSONB NOT NULL DEFAULT '[]';

-- ── updated_at trigger for pregnancies ────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_pregnancies_updated_at ON pregnancies;
CREATE TRIGGER trg_pregnancies_updated_at BEFORE UPDATE ON pregnancies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── pregnancy tracking forms ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pregnancy_tracking_forms (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  month_year VARCHAR(50) NOT NULL UNIQUE,
  rows JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_pregnancy_tracking_forms_updated_at ON pregnancy_tracking_forms;
CREATE TRIGGER trg_pregnancy_tracking_forms_updated_at BEFORE UPDATE ON pregnancy_tracking_forms
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_pregnancy_tracking_forms_month_year ON pregnancy_tracking_forms (month_year);

-- ── audit_logs ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(20) NOT NULL
    CHECK (action IN ('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT')),
  table_name VARCHAR(50),
  record_id BIGINT,
  old_data JSONB,
  new_data JSONB,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_table_record ON audit_logs (table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs (created_at DESC);

-- ── Indexes ───────────────────────────────────────────────────────────────────
-- `users.email` is already UNIQUE so it is indexed automatically.
CREATE INDEX IF NOT EXISTS idx_patients_name ON patients (last_name, first_name);
CREATE INDEX IF NOT EXISTS idx_consultations_patient ON consultations (patient_id);
CREATE INDEX IF NOT EXISTS idx_consultations_visit_date ON consultations (visit_date);
CREATE INDEX IF NOT EXISTS idx_reports_date ON clinic_reports (report_date, report_type);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users (google_id) WHERE google_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_apple_id ON users (apple_id) WHERE apple_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pregnancies_patient ON pregnancies (patient_id);
CREATE INDEX IF NOT EXISTS idx_pregnancies_status_created ON pregnancies (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pregnancies_patient_status ON pregnancies (patient_id, status);

-- ── queue_entries (daily patient queue / ticketing) ─────────────────────────
CREATE TABLE IF NOT EXISTS queue_entries (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  patient_id BIGINT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  queue_number INT NOT NULL,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'serving', 'done', 'skipped')),
  consultation_type VARCHAR(20) NOT NULL DEFAULT 'normal'
    CHECK (consultation_type IN ('normal', 'prenatal', 'postnatal')),
  trimester VARCHAR(10) CHECK (trimester IS NULL OR trimester IN ('1', '2', '3')),
  served_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_queue_entries_updated_at ON queue_entries;
CREATE TRIGGER trg_queue_entries_updated_at BEFORE UPDATE ON queue_entries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_queue_entries_date ON queue_entries (entry_date, status, queue_number);

ALTER TABLE queue_entries ADD COLUMN IF NOT EXISTS trimester VARCHAR(10);
CREATE INDEX IF NOT EXISTS idx_queue_entries_patient ON queue_entries (patient_id, entry_date DESC);

ALTER TABLE queue_entries ADD COLUMN IF NOT EXISTS consultation_type VARCHAR(20) NOT NULL DEFAULT 'normal';

-- ── Admission, delivery & discharge ───────────────────────────────────────────
-- Clinic-editable lists (discharge reasons, risk checklist, items used, packages).
-- Seeded below with ON CONFLICT DO NOTHING so admin edits are never overwritten.
CREATE TABLE IF NOT EXISTS clinic_options (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  option_group VARCHAR(40) NOT NULL,
  code VARCHAR(60) NOT NULL,
  label VARCHAR(150) NOT NULL,
  price NUMERIC(10, 2),
  category VARCHAR(40),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (option_group, code)
);

CREATE TABLE IF NOT EXISTS clinic_settings (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  setting_key VARCHAR(60) NOT NULL UNIQUE,
  setting_value TEXT NOT NULL,
  description VARCHAR(255),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admissions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  patient_id BIGINT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  pregnancy_id BIGINT REFERENCES pregnancies(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'admitted'
    CHECK (status IN ('admitted', 'in_labor', 'delivered', 'discharged', 'referred')),
  admitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  admitted_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  chief_complaint TEXT,
  admitting_diagnosis TEXT,
  bp VARCHAR(20),
  pulse INT,
  resp_rate INT,
  temperature NUMERIC(4, 1),
  labor_notes TEXT,
  risk_flags JSONB NOT NULL DEFAULT '[]',
  consent_signed BOOLEAN NOT NULL DEFAULT FALSE,
  consent_by VARCHAR(150),
  philhealth_package VARCHAR(60),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deliveries (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admission_id BIGINT NOT NULL UNIQUE REFERENCES admissions(id) ON DELETE CASCADE,
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivery_type VARCHAR(60),
  attendant TEXT,
  complications TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS newborns (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  delivery_id BIGINT NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  sex VARCHAR(10) CHECK (sex IN ('Male', 'Female', 'Other')),
  weight_grams INT,
  apgar_1 INT CHECK (apgar_1 BETWEEN 0 AND 10),
  apgar_5 INT CHECK (apgar_5 BETWEEN 0 AND 10),
  essential_care JSONB NOT NULL DEFAULT '[]',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admission_items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admission_id BIGINT NOT NULL REFERENCES admissions(id) ON DELETE CASCADE,
  option_id BIGINT REFERENCES clinic_options(id) ON DELETE SET NULL,
  label VARCHAR(150) NOT NULL,
  unit_price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  quantity NUMERIC(8, 2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  given_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  given_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS discharges (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admission_id BIGINT NOT NULL UNIQUE REFERENCES admissions(id) ON DELETE CASCADE,
  discharged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  disposition VARCHAR(60) NOT NULL,
  final_diagnosis TEXT,
  instructions TEXT,
  override_reason TEXT,
  discharged_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS postpartum_followups (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admission_id BIGINT NOT NULL REFERENCES admissions(id) ON DELETE CASCADE,
  due_at TIMESTAMPTZ NOT NULL,
  done_at TIMESTAMPTZ,
  done_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  missed_at TIMESTAMPTZ,
  missed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE postpartum_followups ADD COLUMN IF NOT EXISTS missed_at TIMESTAMPTZ;
ALTER TABLE postpartum_followups ADD COLUMN IF NOT EXISTS missed_by BIGINT REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS referrals (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admission_id BIGINT NOT NULL UNIQUE REFERENCES admissions(id) ON DELETE CASCADE,
  facility VARCHAR(200) NOT NULL,
  reason TEXT,
  referred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  transport VARCHAR(100),
  notes TEXT,
  referred_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Referral reversal (a doctor can reopen a referred stay with a reason).
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS reversed_by BIGINT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS reverse_reason TEXT;

-- Item usage tracking: every item used is item + quantity + unit + time + who. No stock levels.
ALTER TABLE clinic_options ADD COLUMN IF NOT EXISTS unit VARCHAR(20);
ALTER TABLE clinic_options ADD COLUMN IF NOT EXISTS charged BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE clinic_options ADD COLUMN IF NOT EXISTS allergy_tags TEXT;
ALTER TABLE clinic_options ADD COLUMN IF NOT EXISTS bundle_items JSONB;

ALTER TABLE admission_items ADD COLUMN IF NOT EXISTS unit VARCHAR(20);
ALTER TABLE admission_items ADD COLUMN IF NOT EXISTS charged BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE admission_items ADD COLUMN IF NOT EXISTS price_missing BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE admission_items ADD COLUMN IF NOT EXISTS used_for VARCHAR(20) NOT NULL DEFAULT 'mother';
ALTER TABLE admission_items ADD COLUMN IF NOT EXISTS unlisted BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE admission_items ADD COLUMN IF NOT EXISTS ref_key VARCHAR(60);
ALTER TABLE admission_items ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE admission_items ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;
ALTER TABLE admission_items ADD COLUMN IF NOT EXISTS voided_by BIGINT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE admission_items ADD COLUMN IF NOT EXISTS void_reason TEXT;
ALTER TABLE admission_items ADD COLUMN IF NOT EXISTS legacy BOOLEAN NOT NULL DEFAULT FALSE;
-- A newborn-care entry (for example vitamin K for baby 1) creates one usage line, never two.
CREATE UNIQUE INDEX IF NOT EXISTS uq_admission_items_ref
  ON admission_items (admission_id, ref_key) WHERE ref_key IS NOT NULL AND voided_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_admission_items_given ON admission_items (given_at);

-- Medications given (clinical record, separate from the items/summary list).
CREATE TABLE IF NOT EXISTS medications_given (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admission_id BIGINT NOT NULL REFERENCES admissions(id) ON DELETE CASCADE,
  drug VARCHAR(150) NOT NULL,
  dose VARCHAR(80),
  route VARCHAR(40),
  given_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  given_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  item_id BIGINT REFERENCES admission_items(id) ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_medications_given_admission ON medications_given (admission_id, given_at);

-- Bed changes during a stay (from, to, when, who).
CREATE TABLE IF NOT EXISTS bed_moves (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admission_id BIGINT NOT NULL REFERENCES admissions(id) ON DELETE CASCADE,
  from_bed INT,
  to_bed INT,
  moved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  moved_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Midwives' notes: a correction keeps the original text, the reason, who and when.
ALTER TABLE midwife_notes ADD COLUMN IF NOT EXISTS original_description TEXT;
ALTER TABLE midwife_notes ADD COLUMN IF NOT EXISTS corrected_at TIMESTAMPTZ;
ALTER TABLE midwife_notes ADD COLUMN IF NOT EXISTS corrected_by BIGINT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE midwife_notes ADD COLUMN IF NOT EXISTS correction_reason TEXT;

-- Vitals: which phase the reading belongs to, plus postpartum observations.
ALTER TABLE admission_vitals ADD COLUMN IF NOT EXISTS phase VARCHAR(12) NOT NULL DEFAULT 'admission';
ALTER TABLE admission_vitals ADD COLUMN IF NOT EXISTS bleeding VARCHAR(10);
ALTER TABLE admission_vitals ADD COLUMN IF NOT EXISTS uterus VARCHAR(10);
ALTER TABLE admission_vitals ADD COLUMN IF NOT EXISTS perineum VARCHAR(20);

-- Labor: richer water-bag options, station, contraction numbers, and the time it happened.
ALTER TABLE labor_entries DROP CONSTRAINT IF EXISTS labor_entries_membranes_check;
ALTER TABLE labor_entries ADD COLUMN IF NOT EXISTS station VARCHAR(20);
ALTER TABLE labor_entries ADD COLUMN IF NOT EXISTS contraction_freq INT;
ALTER TABLE labor_entries ADD COLUMN IF NOT EXISTS contraction_secs INT;
ALTER TABLE labor_entries ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ;

-- Delivery: problems checklist, mother-side fields, several attendants.
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS problems JSONB NOT NULL DEFAULT '[]';
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS placenta VARCHAR(12);
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS placenta_at TIMESTAMPTZ;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS blood_loss_ml INT;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS perineum VARCHAR(20);
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS oxytocin_given BOOLEAN;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS oxytocin_at TIMESTAMPTZ;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS attendant_ids JSONB NOT NULL DEFAULT '[]';

-- Babies: live birth or stillbirth, and each baby's own birth time.
ALTER TABLE newborns ADD COLUMN IF NOT EXISTS birth_status VARCHAR(12) NOT NULL DEFAULT 'live';
ALTER TABLE newborns ADD COLUMN IF NOT EXISTS born_at TIMESTAMPTZ;

-- Discharge: type, mother and newborn condition, follow-up date, death details.
ALTER TABLE discharges ADD COLUMN IF NOT EXISTS mother_condition VARCHAR(12);
ALTER TABLE discharges ADD COLUMN IF NOT EXISTS newborn_condition VARCHAR(20);
ALTER TABLE discharges ADD COLUMN IF NOT EXISTS follow_up_date DATE;
ALTER TABLE discharges ADD COLUMN IF NOT EXISTS death_of VARCHAR(10);
ALTER TABLE discharges ADD COLUMN IF NOT EXISTS death_cause TEXT;
ALTER TABLE discharges ADD COLUMN IF NOT EXISTS death_at TIMESTAMPTZ;

-- Admit step: coverage list (PhilHealth added, None default), consent signer, staff dropdown ids.
ALTER TABLE admissions DROP CONSTRAINT IF EXISTS admissions_medicare_check;
ALTER TABLE admissions ADD CONSTRAINT admissions_medicare_check
  CHECK (medicare IS NULL OR medicare IN ('none', 'philhealth_member', 'philhealth_dependent', 'sss', 'gsis', 'owwa', 'indigent', 'private', 'others'));
ALTER TABLE admissions ADD COLUMN IF NOT EXISTS philhealth_pin VARCHAR(30);
ALTER TABLE admissions ADD COLUMN IF NOT EXISTS consent_signer_type VARCHAR(20);
ALTER TABLE admissions ADD COLUMN IF NOT EXISTS consent_relationship VARCHAR(100);
ALTER TABLE admissions ADD COLUMN IF NOT EXISTS attending_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL;

-- Staff who may sign clinical entries (midwife, nurse, doctor and admin by role).
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_sign_clinical BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE users SET can_sign_clinical = TRUE WHERE role = 'admin' AND can_sign_clinical = FALSE;

-- "Continue at clinic" decision for a referral-level warning sign (reason, who, when).
ALTER TABLE admissions ADD COLUMN IF NOT EXISTS risk_ack_reason TEXT;
ALTER TABLE admissions ADD COLUMN IF NOT EXISTS risk_ack_by BIGINT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE admissions ADD COLUMN IF NOT EXISTS risk_ack_at TIMESTAMPTZ;

-- Midwives' Notes: one row per entry. Date and time are set by the server and the author is
-- the logged-in user, so an entry cannot be backdated or signed by someone else.
CREATE TABLE IF NOT EXISTS midwife_notes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admission_id BIGINT NOT NULL REFERENCES admissions(id) ON DELETE CASCADE,
  noted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  description TEXT NOT NULL,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_midwife_notes_admission ON midwife_notes (admission_id, noted_at);

-- Labor chart: progress of labor over time (kept apart from the Midwives' Notes).
CREATE TABLE IF NOT EXISTS labor_entries (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admission_id BIGINT NOT NULL REFERENCES admissions(id) ON DELETE CASCADE,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  contractions VARCHAR(150),
  cervix_cm INT CHECK (cervix_cm BETWEEN 0 AND 10),
  fetal_heart_rate INT CHECK (fetal_heart_rate BETWEEN 60 AND 220),
  membranes VARCHAR(20) CHECK (membranes IN ('intact', 'ruptured', 'unknown')),
  notes TEXT,
  recorded_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_labor_entries_admission ON labor_entries (admission_id, recorded_at);

-- Baby card: name and measurements (HC head, CC chest, AC abdomen), in centimetres.
ALTER TABLE newborns ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE newborns ADD COLUMN IF NOT EXISTS length_cm NUMERIC(4, 1);
ALTER TABLE newborns ADD COLUMN IF NOT EXISTS head_circumference_cm NUMERIC(4, 1);
ALTER TABLE newborns ADD COLUMN IF NOT EXISTS chest_circumference_cm NUMERIC(4, 1);
ALTER TABLE newborns ADD COLUMN IF NOT EXISTS abdominal_circumference_cm NUMERIC(4, 1);

-- Rest of the paper Admission and Discharge Record: referral, social-service class,
-- coverage (hospital plan / insurance / Medicare), informant, and ICD code.
ALTER TABLE admissions ADD COLUMN IF NOT EXISTS referred_by VARCHAR(200);
ALTER TABLE admissions ADD COLUMN IF NOT EXISTS social_service_class VARCHAR(1) CHECK (social_service_class IN ('A','B','C','D'));
ALTER TABLE admissions ADD COLUMN IF NOT EXISTS hospitalization_plan VARCHAR(200);
ALTER TABLE admissions ADD COLUMN IF NOT EXISTS health_insurance_name VARCHAR(200);
ALTER TABLE admissions ADD COLUMN IF NOT EXISTS medicare VARCHAR(20) CHECK (medicare IN ('sss','gsis','owwa','indigent','others'));
ALTER TABLE admissions ADD COLUMN IF NOT EXISTS medicare_other VARCHAR(200);
ALTER TABLE admissions ADD COLUMN IF NOT EXISTS informant_name VARCHAR(200);
ALTER TABLE admissions ADD COLUMN IF NOT EXISTS informant_address VARCHAR(500);
ALTER TABLE admissions ADD COLUMN IF NOT EXISTS informant_relationship VARCHAR(100);
ALTER TABLE admissions ADD COLUMN IF NOT EXISTS icd_code VARCHAR(30);

-- The "RESULTS" box at the bottom of the paper form (recovered / died / autopsy ...).
ALTER TABLE discharges ADD COLUMN IF NOT EXISTS results JSONB NOT NULL DEFAULT '[]';

-- Pre-discharge checklist (the "within 24 hours and before discharge" column): one row per stay.
CREATE TABLE IF NOT EXISTS discharge_checklists (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admission_id BIGINT NOT NULL UNIQUE REFERENCES admissions(id) ON DELETE CASCADE,
  items JSONB NOT NULL DEFAULT '{}',
  danger_signs JSONB NOT NULL DEFAULT '[]',
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Vital signs taken during the stay (one row per reading, time set by the server).
CREATE TABLE IF NOT EXISTS admission_vitals (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admission_id BIGINT NOT NULL REFERENCES admissions(id) ON DELETE CASCADE,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  bp_systolic INT,
  bp_diastolic INT,
  pulse INT,
  resp_rate INT,
  temperature NUMERIC(4, 1),
  spo2 INT,
  fetal_heart_rate INT,
  recorded_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admission_vitals_admission ON admission_vitals (admission_id, recorded_at);

ALTER TABLE consultation_transactions
  ADD COLUMN IF NOT EXISTS admission_id BIGINT REFERENCES admissions(id) ON DELETE SET NULL;

-- Ward with a fixed number of beds: each open stay occupies one bed, charged per night.
ALTER TABLE admissions ADD COLUMN IF NOT EXISTS bed_number INT CHECK (bed_number >= 1);
ALTER TABLE admissions ADD COLUMN IF NOT EXISTS bed_price NUMERIC(10, 2);
CREATE UNIQUE INDEX IF NOT EXISTS uq_admissions_active_bed ON admissions (bed_number)
  WHERE bed_number IS NOT NULL AND status IN ('admitted', 'in_labor', 'delivered');

-- Admission and Discharge Record: type of admission (new / old / former OPD patient) and attending physician.
ALTER TABLE admissions ADD COLUMN IF NOT EXISTS admission_type VARCHAR(20);
ALTER TABLE admissions DROP CONSTRAINT IF EXISTS admissions_admission_type_check;
ALTER TABLE admissions ADD CONSTRAINT admissions_admission_type_check
  CHECK (admission_type IS NULL OR admission_type IN ('new', 'old', 'former_opd'));
ALTER TABLE admissions ADD COLUMN IF NOT EXISTS attending_physician VARCHAR(150);

-- A stay can use several PhilHealth packages (for example delivery + newborn).
-- The older single-package column is moved over once and then left empty.
ALTER TABLE admissions ADD COLUMN IF NOT EXISTS philhealth_packages JSONB NOT NULL DEFAULT '[]';
UPDATE admissions
  SET philhealth_packages = jsonb_build_array(philhealth_package), philhealth_package = NULL
  WHERE philhealth_package IS NOT NULL AND philhealth_packages = '[]'::jsonb;

DROP TRIGGER IF EXISTS trg_admissions_updated_at ON admissions;
CREATE TRIGGER trg_admissions_updated_at BEFORE UPDATE ON admissions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_deliveries_updated_at ON deliveries;
CREATE TRIGGER trg_deliveries_updated_at BEFORE UPDATE ON deliveries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_clinic_options_updated_at ON clinic_options;
CREATE TRIGGER trg_clinic_options_updated_at BEFORE UPDATE ON clinic_options
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_admissions_patient ON admissions (patient_id, admitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_admissions_status ON admissions (status, admitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_admission_items_admission ON admission_items (admission_id);
CREATE INDEX IF NOT EXISTS idx_followups_due ON postpartum_followups (due_at) WHERE done_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_consultation_transactions_admission ON consultation_transactions (admission_id);

-- Starter lists. Prices are intentionally NULL: the clinic administrator sets
-- real prices in Settings. ON CONFLICT DO NOTHING keeps admin edits on restart.
-- The discharge-reason, delivery-type, warning-sign and newborn-care lists are fixed
-- lists owned by the Admission and Discharge module (backend/services/admissionService.js);
-- they are intentionally not seeded as editable clinic options.
INSERT INTO clinic_options (option_group, code, label, category, sort_order) VALUES
  ('package', 'mcp', 'PhilHealth Maternity Care Package', 'philhealth', 1),
  ('item', 'birthing_fee', 'Birthing room and delivery fee', 'service', 2),
  ('item', 'iv_fluids', 'IV fluids', 'medicine', 3),
  ('item', 'oxytocin', 'Oxytocin injection', 'medicine', 4),
  ('item', 'antibiotic', 'Antibiotic', 'medicine', 5),
  ('item', 'pain_reliever', 'Pain reliever', 'medicine', 6),
  ('item', 'suture_set', 'Suture / stitching set', 'supply', 7),
  ('item', 'newborn_vitamin_k', 'Newborn vitamin K injection', 'medicine', 8),
  ('item', 'newborn_vaccines', 'Newborn vaccines (BCG, Hepatitis B)', 'medicine', 9),
  ('item', 'newborn_screening', 'Newborn screening', 'service', 10)
ON CONFLICT (option_group, code) DO NOTHING;

-- Delivery and newborn packages moved here from the consultation list, with their amounts.
INSERT INTO clinic_options (option_group, code, label, price, category, sort_order) VALUES
  ('package', 'nsdbf', 'Normal Spontaneous Delivery (Birthing Facility)', 14000, 'philhealth', 2),
  ('package', '99460', 'Newborn Care Package', 2950, 'philhealth', 3)
ON CONFLICT (option_group, code) DO NOTHING;

-- Vitamins charged at the clinic in Transactions, and the consultation
-- PhilHealth packages (antenatal, postpartum, vaccines) shown for reference.
-- Both lists are editable in Clinic Settings > Lists and prices.
INSERT INTO clinic_options (option_group, code, label, price, category, sort_order) VALUES
  ('vitamin', 'ferrous_sulfate', 'Ferrous Sulfate 325mg', 15, 'vitamin', 1),
  ('vitamin', 'folic_acid', 'Folic Acid 400mcg', 10, 'vitamin', 2),
  ('vitamin', 'calcium_carbonate', 'Calcium Carbonate 500mg', 20, 'vitamin', 3),
  ('vitamin', 'vitamin_c', 'Vitamin C 500mg', 12, 'vitamin', 4),
  ('vitamin', 'vitamin_d', 'Vitamin D 1000IU', 18, 'vitamin', 5),
  ('vitamin', 'zinc', 'Zinc Sulfate 220mg', 14, 'vitamin', 6),
  ('vitamin', 'iodine', 'Iodine (Potassium Iodide) 250mcg', 16, 'vitamin', 7),
  ('vitamin', 'multivitamin_prenatal', 'Prenatal Multivitamin', 35, 'vitamin', 8),
  ('vitamin', 'vitamin_b_complex', 'Vitamin B Complex', 22, 'vitamin', 9),
  ('vitamin', 'vitamin_a', 'Vitamin A 5000IU', 13, 'vitamin', 10),
  ('consult_package', 'ANV01', 'Antenatal Care — 1st Trimester', 1100, 'philhealth', 1),
  ('consult_package', 'ANV02', 'Antenatal Care — 2nd Trimester', 1500, 'philhealth', 2),
  ('consult_package', 'ANV03', 'Antenatal Care — 3rd Trimester', 3750, 'philhealth', 3),
  ('consult_package', 'PPC01', 'Postpartum Care (3 visits)', 1350, 'philhealth', 4),
  ('consult_package', 'TDAP1', 'Tetanus-Diphtheria-Pertussis Vaccine — 1st Dose', 150, 'philhealth', 5),
  ('consult_package', 'TDAP2', 'Tetanus-Diphtheria-Pertussis Vaccine — 2nd Dose', 150, 'philhealth', 6)
ON CONFLICT (option_group, code) DO NOTHING;

-- From the clinic's handwritten inventory sheets: vitamins/supplements charged
-- at the clinic, plus medicines and supplies consumed during a stay. Specific
-- antibiotics sit under the 'antibiotic' category. Prices are set by the admin.
INSERT INTO clinic_options (option_group, code, label, price, category, sort_order) VALUES
  ('vitamin', 'natalion', 'Natalion', NULL, 'vitamin', 11),
  ('vitamin', 'natalcare', 'Natalcare (vitamins & minerals)', NULL, 'vitamin', 12),
  ('vitamin', 'auronin_ob', 'AURONIN-OB multivitamins', NULL, 'vitamin', 13),
  ('vitamin', 'magnepenon', 'Magnepenon (magnesium)', NULL, 'vitamin', 14),
  ('vitamin', 'anifer', 'ANIFER (Iron + Folic Acid)', NULL, 'vitamin', 15),
  ('vitamin', 'ameciron', 'AMECIRON (Iron + Folic Acid)', NULL, 'vitamin', 16),
  ('vitamin', 'calciv_flex', 'Calciv Flex chewable', NULL, 'vitamin', 17),
  ('vitamin', 'bonina', 'Bonina maternal milk', NULL, 'vitamin', 18),
  ('vitamin', 'enfamama', 'Enfamama maternal milk', NULL, 'vitamin', 19),
  ('vitamin', 'lactum', 'Lactum maternal milk', NULL, 'vitamin', 20),
  ('item', 'isoxsuprine', 'Isoxsuprine', NULL, 'medicine', 11),
  ('item', 'hyoscine', 'Hyoscine (Buscopan)', NULL, 'medicine', 12),
  ('item', 'xylocaine_gel', 'Xylocaine (lidocaine) gel', NULL, 'medicine', 13),
  ('item', 'metoclopramide', 'Metoclopramide', NULL, 'medicine', 14),
  ('item', 'salbutamol', 'Salbutamol / Ventolin', NULL, 'medicine', 15),
  ('item', 'chlorphenamine', 'Chlorphenamine', NULL, 'medicine', 16),
  ('item', 'cetirizine', 'Cetirizine', NULL, 'medicine', 17),
  ('item', 'allerkid', 'Allerkid (cetirizine drops)', NULL, 'medicine', 18),
  ('item', 'nasal_saline', 'Sodium Nasoclear / Salinase drops', NULL, 'supply', 19),
  ('item', 'cefalexin', 'Cefalexin', NULL, 'antibiotic', 20),
  ('item', 'cotrimoxazole', 'Cotrimoxazole', NULL, 'antibiotic', 21),
  ('item', 'sulfur_soap', 'Sulfur soap', NULL, 'supply', 22),
  ('item', 'baby_bottle', 'Baby bottle (Nature)', NULL, 'supply', 23),
  ('item', 'feeding_bottles', 'Feeding bottles (3-in-1)', NULL, 'supply', 24)
ON CONFLICT (option_group, code) DO NOTHING;

-- Item list for usage tracking (verify names, units and the charged flag with the clinic).
-- Consumable supplies start as "not charged": they are recorded and reported but add 0 to the total.
INSERT INTO clinic_options (option_group, code, label, price, category, sort_order, unit, charged, allergy_tags) VALUES
  ('item', 'amoxicillin', 'Amoxicillin', NULL, 'antibiotic', 30, 'pc', TRUE, 'penicillin,amoxicillin'),
  ('item', 'paracetamol', 'Paracetamol', NULL, 'medicine', 31, 'pc', TRUE, 'paracetamol'),
  ('item', 'mefenamic_acid', 'Mefenamic acid', NULL, 'medicine', 32, 'pc', TRUE, 'nsaid,aspirin'),
  ('item', 'bcg_vaccine', 'BCG vaccine', NULL, 'medicine', 33, 'vial', TRUE, NULL),
  ('item', 'hepb_vaccine', 'Hepatitis B vaccine', NULL, 'medicine', 34, 'vial', TRUE, NULL),
  ('item', 'eye_ointment', 'Newborn eye ointment', NULL, 'medicine', 35, 'pc', TRUE, NULL),
  ('item', 'gloves', 'Disposable gloves', NULL, 'supply', 40, 'pair', FALSE, NULL),
  ('item', 'gauze', 'Gauze', NULL, 'supply', 41, 'pack', FALSE, NULL),
  ('item', 'cotton', 'Cotton', NULL, 'supply', 42, 'pack', FALSE, NULL),
  ('item', 'alcohol', 'Alcohol', NULL, 'supply', 43, 'bottle', FALSE, NULL),
  ('item', 'povidone_iodine', 'Povidone-iodine', NULL, 'supply', 44, 'bottle', FALSE, NULL),
  ('item', 'syringe', 'Syringe', NULL, 'supply', 45, 'pc', FALSE, NULL),
  ('item', 'iv_set', 'IV set and cannula', NULL, 'supply', 46, 'set', FALSE, NULL),
  ('item', 'cord_clamp', 'Umbilical cord clamp', NULL, 'supply', 47, 'pc', FALSE, NULL),
  ('item', 'underpad', 'Underpad', NULL, 'supply', 48, 'pc', FALSE, NULL),
  ('item', 'maternity_pad', 'Maternity pad', NULL, 'supply', 49, 'pack', FALSE, NULL),
  ('item', 'diaper_newborn', 'Baby diaper (newborn size)', NULL, 'supply', 50, 'pc', FALSE, NULL),
  ('item', 'diaper_small', 'Baby diaper (small)', NULL, 'supply', 51, 'pc', FALSE, NULL)
ON CONFLICT (option_group, code) DO NOTHING;

INSERT INTO clinic_options (option_group, code, label, price, category, sort_order, unit, bundle_items) VALUES
  ('bundle', 'normal_delivery_pack', 'Normal delivery pack', NULL, 'bundle', 1, 'set',
   '[{"code":"gloves","quantity":4},{"code":"gauze","quantity":2},{"code":"cotton","quantity":1},{"code":"underpad","quantity":2},{"code":"cord_clamp","quantity":1},{"code":"syringe","quantity":2}]'::jsonb)
ON CONFLICT (option_group, code) DO NOTHING;

-- Units for the items that existed before usage tracking (only where not set yet).
UPDATE clinic_options SET unit = CASE code
    WHEN 'birthing_fee' THEN 'set' WHEN 'iv_fluids' THEN 'bottle' WHEN 'oxytocin' THEN 'ampule'
    WHEN 'antibiotic' THEN 'pc' WHEN 'pain_reliever' THEN 'pc' WHEN 'suture_set' THEN 'set'
    WHEN 'newborn_vitamin_k' THEN 'ampule' WHEN 'newborn_vaccines' THEN 'vial' WHEN 'newborn_screening' THEN 'set'
    ELSE 'pc' END
  WHERE option_group = 'item' AND unit IS NULL;
UPDATE clinic_options SET allergy_tags = 'nsaid,aspirin' WHERE option_group = 'item' AND code = 'pain_reliever' AND allergy_tags IS NULL;

-- One-time: old stays keep their items as legacy usage lines; the combined vaccine item is
-- replaced by separate BCG and Hepatitis B items (the old one stays readable on old stays).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM clinic_settings WHERE setting_key = 'migr_item_usage_v1') THEN
    UPDATE admission_items SET legacy = TRUE;
    UPDATE clinic_options SET active = FALSE WHERE option_group = 'item' AND code = 'newborn_vaccines';
    INSERT INTO clinic_settings (setting_key, setting_value, description)
    VALUES ('migr_item_usage_v1', 'done', 'Internal marker');
  END IF;
END $$;

INSERT INTO clinic_settings (setting_key, setting_value, description) VALUES
  ('min_stay_hours', '24', 'Reminder: minimum hours of stay after delivery before discharge'),
  ('followup_offsets_hours', '72,168', 'Postpartum follow-up visits, hours after discharge (72 = 3 days, 168 = 7 days)'),
  ('require_consent', 'true', 'Remind staff when informed consent is not yet recorded'),
  ('ward_name', 'Ward', 'What the clinic calls the room with the beds'),
  ('ward_beds', '3', 'Number of beds in the ward'),
  ('bed_price_per_night', '', 'Charge per bed per night (leave empty until the price is set)')
ON CONFLICT (setting_key) DO NOTHING;

-- One-time: the bed is now charged automatically per night, so hide the old
-- per-day "Room / bed" starter item (it would double-charge). Runs once only.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM clinic_settings WHERE setting_key = 'migr_bed_charge_v1') THEN
    UPDATE clinic_options SET active = FALSE WHERE option_group = 'item' AND code = 'room' AND price IS NULL;
    INSERT INTO clinic_settings (setting_key, setting_value, description)
    VALUES ('migr_bed_charge_v1', 'done', 'Internal marker');
  END IF;

  -- One-time: the "Normal Delivery Package" starter is replaced by the delivery package above.
  IF NOT EXISTS (SELECT 1 FROM clinic_settings WHERE setting_key = 'migr_packages_v1') THEN
    UPDATE clinic_options SET active = FALSE WHERE option_group = 'package' AND code = 'nsd' AND price IS NULL;
    INSERT INTO clinic_settings (setting_key, setting_value, description)
    VALUES ('migr_packages_v1', 'done', 'Internal marker');
  END IF;
END $$;

-- ── Row Level Security (backend-only access) ─────────────────────────────────
-- The Express backend owns all data access over a direct Postgres connection
-- (its role is the table owner, so RLS does not apply to it). Nothing else —
-- including Supabase PostgREST anon/authenticated roles — may read or write
-- these tables. Every public table gets RLS plus a single deny-all policy;
-- any other policy left behind by older schema versions is removed.
DO $$
DECLARE t text; pol record;
BEGIN
  FOR pol IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public' AND policyname <> 'deny_api_access'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
  FOR t IN
    SELECT c.relname FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS deny_api_access ON public.%I', t);
    EXECUTE format('CREATE POLICY deny_api_access ON public.%I FOR ALL TO PUBLIC USING (false) WITH CHECK (false)', t);
  END LOOP;
END $$;

-- Covering indexes for foreign keys (unindexed FK lints + join performance).
CREATE INDEX IF NOT EXISTS idx_consultations_doctor ON consultations (doctor_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_by ON consultation_transactions (created_by);
CREATE INDEX IF NOT EXISTS idx_queue_served_by ON queue_entries (served_by);
CREATE INDEX IF NOT EXISTS idx_newborns_delivery ON newborns (delivery_id);
CREATE INDEX IF NOT EXISTS idx_admission_items_option ON admission_items (option_id);
CREATE INDEX IF NOT EXISTS idx_admission_items_given_by ON admission_items (given_by);
CREATE INDEX IF NOT EXISTS idx_admission_items_voided_by ON admission_items (voided_by);
CREATE INDEX IF NOT EXISTS idx_discharges_discharged_by ON discharges (discharged_by);
CREATE INDEX IF NOT EXISTS idx_postpartum_followups_admission ON postpartum_followups (admission_id);
CREATE INDEX IF NOT EXISTS idx_postpartum_followups_done_by ON postpartum_followups (done_by);
CREATE INDEX IF NOT EXISTS idx_postpartum_followups_missed_by ON postpartum_followups (missed_by);
CREATE INDEX IF NOT EXISTS idx_referrals_referred_by ON referrals (referred_by);
CREATE INDEX IF NOT EXISTS idx_referrals_reversed_by ON referrals (reversed_by);
CREATE INDEX IF NOT EXISTS idx_admissions_pregnancy ON admissions (pregnancy_id);
CREATE INDEX IF NOT EXISTS idx_admissions_admitted_by ON admissions (admitted_by);
CREATE INDEX IF NOT EXISTS idx_admissions_risk_ack_by ON admissions (risk_ack_by);
CREATE INDEX IF NOT EXISTS idx_admissions_attending ON admissions (attending_user_id);
CREATE INDEX IF NOT EXISTS idx_midwife_notes_user ON midwife_notes (user_id);
CREATE INDEX IF NOT EXISTS idx_midwife_notes_corrected_by ON midwife_notes (corrected_by);
CREATE INDEX IF NOT EXISTS idx_admission_vitals_recorded_by ON admission_vitals (recorded_by);
CREATE INDEX IF NOT EXISTS idx_labor_entries_recorded_by ON labor_entries (recorded_by);
CREATE INDEX IF NOT EXISTS idx_discharge_checklists_updated_by ON discharge_checklists (updated_by);
CREATE INDEX IF NOT EXISTS idx_medications_given_given_by ON medications_given (given_by);
CREATE INDEX IF NOT EXISTS idx_medications_given_item ON medications_given (item_id);
CREATE INDEX IF NOT EXISTS idx_bed_moves_admission ON bed_moves (admission_id);
CREATE INDEX IF NOT EXISTS idx_bed_moves_moved_by ON bed_moves (moved_by);


-- Supabase's rls_auto_enable event-trigger function is SECURITY DEFINER and
-- executable by every role out of the box; restrict it to trusted roles only.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rls_auto_enable'
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

DROP POLICY IF EXISTS "App full access" ON public.consultation_transactions;
CREATE POLICY "App full access" ON public.consultation_transactions FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "App full access" ON public.clinic_reports;
CREATE POLICY "App full access" ON public.clinic_reports FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "App full access" ON public.pregnancies;
CREATE POLICY "App full access" ON public.pregnancies FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "App full access" ON public.pregnancy_tracking_forms;
CREATE POLICY "App full access" ON public.pregnancy_tracking_forms FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "App full access" ON public.queue_entries;
CREATE POLICY "App full access" ON public.queue_entries FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "App full access" ON public.audit_logs;
CREATE POLICY "App full access" ON public.audit_logs FOR ALL USING (true) WITH CHECK (true);

-- ── RLS for admission, delivery & discharge tables ───────────────────────────
ALTER TABLE IF EXISTS public.clinic_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.clinic_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.admissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.newborns ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.admission_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.discharges ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.postpartum_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.midwife_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.admission_vitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.labor_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.discharge_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.patient_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "App full access" ON public.clinic_options;
CREATE POLICY "App full access" ON public.clinic_options FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "App full access" ON public.clinic_settings;
CREATE POLICY "App full access" ON public.clinic_settings FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "App full access" ON public.admissions;
CREATE POLICY "App full access" ON public.admissions FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "App full access" ON public.deliveries;
CREATE POLICY "App full access" ON public.deliveries FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "App full access" ON public.newborns;
CREATE POLICY "App full access" ON public.newborns FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "App full access" ON public.admission_items;
CREATE POLICY "App full access" ON public.admission_items FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "App full access" ON public.discharges;
CREATE POLICY "App full access" ON public.discharges FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "App full access" ON public.postpartum_followups;
CREATE POLICY "App full access" ON public.postpartum_followups FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "App full access" ON public.referrals;
CREATE POLICY "App full access" ON public.referrals FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "App full access" ON public.midwife_notes;
CREATE POLICY "App full access" ON public.midwife_notes FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "App full access" ON public.admission_vitals;
CREATE POLICY "App full access" ON public.admission_vitals FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "App full access" ON public.labor_entries;
CREATE POLICY "App full access" ON public.labor_entries FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "App full access" ON public.discharge_checklists;
CREATE POLICY "App full access" ON public.discharge_checklists FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "App full access" ON public.patient_images;
CREATE POLICY "App full access" ON public.patient_images FOR ALL USING (true) WITH CHECK (true);

-- patient_images is created by a newer schema version; index its FKs only
-- when the table is present so this file stays runnable on older databases.
DO $$
BEGIN
  IF to_regclass('public.patient_images') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_patient_images_patient ON patient_images (patient_id);
    CREATE INDEX IF NOT EXISTS idx_patient_images_uploaded_by ON patient_images (uploaded_by);
    CREATE INDEX IF NOT EXISTS idx_patient_images_pregnancy ON patient_images (pregnancy_id);
  END IF;
END $$;
