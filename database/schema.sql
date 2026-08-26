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
    CHECK (role IN ('admin', 'doctor', 'nurse', 'staff')),
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

CREATE INDEX IF NOT EXISTS idx_consultation_transactions_patient ON consultation_transactions (patient_id);
CREATE INDEX IF NOT EXISTS idx_consultation_transactions_consultation ON consultation_transactions (consultation_id);

ALTER TABLE consultation_transactions DISABLE ROW LEVEL SECURITY;

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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

-- ── Disable Row Level Security ────────────────────────────────────────────────
-- Auth and access control are handled by the Express backend middleware.
-- RLS is not needed since the frontend never connects directly to the DB.
ALTER TABLE patients DISABLE ROW LEVEL SECURITY;
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE consultations DISABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_reports DISABLE ROW LEVEL SECURITY;
ALTER TABLE pregnancies DISABLE ROW LEVEL SECURITY;
ALTER TABLE pregnancy_tracking_forms DISABLE ROW LEVEL SECURITY;

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
  served_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_queue_entries_updated_at ON queue_entries;
CREATE TRIGGER trg_queue_entries_updated_at BEFORE UPDATE ON queue_entries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_queue_entries_date ON queue_entries (entry_date, status, queue_number);
CREATE INDEX IF NOT EXISTS idx_queue_entries_patient ON queue_entries (patient_id, entry_date DESC);

ALTER TABLE queue_entries DISABLE ROW LEVEL SECURITY;