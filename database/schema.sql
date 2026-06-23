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
$$ LANGUAGE plpgsql;

-- ── Schema migrations for existing tables (safe to re-run) ──────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS apple_id VARCHAR(255) UNIQUE;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── users ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
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
  ai_summary_used BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── clinic_reports ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clinic_reports (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  report_date DATE NOT NULL,
  report_type VARCHAR(10) NOT NULL DEFAULT 'daily'
    CHECK (report_type IN ('daily', 'weekly')),
  ai_generated_text TEXT,               -- AI-generated report text
  total_patients INT,
  metrics JSONB NULL,                     -- Structured analytics (complaints, diagnoses, trends, etc.)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

-- ── Indexes ───────────────────────────────────────────────────────────────────
-- `users.email` is already UNIQUE so it is indexed automatically.
CREATE INDEX IF NOT EXISTS idx_patients_name ON patients (last_name, first_name);
CREATE INDEX IF NOT EXISTS idx_consultations_patient ON consultations (patient_id);
CREATE INDEX IF NOT EXISTS idx_consultations_visit_date ON consultations (visit_date);
CREATE INDEX IF NOT EXISTS idx_reports_date ON clinic_reports (report_date, report_type);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users (google_id) WHERE google_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_apple_id ON users (apple_id) WHERE apple_id IS NOT NULL;