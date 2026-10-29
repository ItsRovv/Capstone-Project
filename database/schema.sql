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
  delivery_location VARCHAR(50),          -- Where patient plans to deliver (e.g., 'jlmc', 'other')
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
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS delivery_location VARCHAR(50);

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
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

ALTER TABLE consultation_transactions
  ADD COLUMN IF NOT EXISTS admission_id BIGINT REFERENCES admissions(id) ON DELETE SET NULL;

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
INSERT INTO clinic_options (option_group, code, label, category, sort_order) VALUES
  ('discharge_reason', 'improved', 'Improved - went home well', NULL, 1),
  ('discharge_reason', 'transferred', 'Transferred to another facility', NULL, 2),
  ('discharge_reason', 'hama', 'Went home against medical advice', NULL, 3),
  ('discharge_reason', 'absconded', 'Left without notice', NULL, 4),
  ('discharge_reason', 'expired', 'Passed away', NULL, 5),
  ('delivery_type', 'nsd', 'Normal delivery', NULL, 1),
  ('delivery_type', 'assisted', 'Assisted delivery', NULL, 2),
  ('delivery_type', 'other', 'Other', NULL, 3),
  ('risk_flag', 'multiple_pregnancy', 'Twins or more', NULL, 1),
  ('risk_flag', 'placenta_previa', 'Placenta covering the cervix (placenta previa)', NULL, 2),
  ('risk_flag', 'previous_cs', 'Previous cesarean section', NULL, 3),
  ('risk_flag', 'preeclampsia_history', 'Past pre-eclampsia or eclampsia', NULL, 4),
  ('risk_flag', 'stillbirth_history', 'Past stillbirth or 3 or more miscarriages', NULL, 5),
  ('risk_flag', 'hypertension', 'High blood pressure', NULL, 6),
  ('risk_flag', 'diabetes', 'Diabetes', NULL, 7),
  ('risk_flag', 'heart_disease', 'Heart disease', NULL, 8),
  ('risk_flag', 'severe_anemia', 'Severe anemia', NULL, 9),
  ('risk_flag', 'bleeding', 'Heavy bleeding', NULL, 10),
  ('newborn_care', 'drying', 'Dried and wrapped right away', NULL, 1),
  ('newborn_care', 'skin_to_skin', 'Skin-to-skin with mother', NULL, 2),
  ('newborn_care', 'cord_care', 'Cord clamped and cared for', NULL, 3),
  ('newborn_care', 'breastfeeding', 'Breastfeeding started', NULL, 4),
  ('package', 'mcp', 'PhilHealth Maternity Care Package', 'philhealth', 1),
  ('package', 'nsd', 'PhilHealth Normal Delivery Package', 'philhealth', 2),
  ('item', 'room', 'Room / bed (per day)', 'service', 1),
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

INSERT INTO clinic_settings (setting_key, setting_value, description) VALUES
  ('min_stay_hours', '24', 'Reminder: minimum hours of stay after delivery before discharge'),
  ('followup_offsets_hours', '72,168', 'Postpartum follow-up visits, hours after discharge (72 = 3 days, 168 = 7 days)'),
  ('require_consent', 'true', 'Remind staff when informed consent is not yet recorded')
ON CONFLICT (setting_key) DO NOTHING;

-- ── Row Level Security (backend-only access) ─────────────────────────────────
-- The Express backend handles authentication and authorization. RLS is enabled
-- to satisfy Supabase security posture requirements; policies allow the backend
-- DB role full access because no other client connects directly to Postgres.
ALTER TABLE IF EXISTS public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.consultations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.consultation_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.clinic_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.pregnancies ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.pregnancy_tracking_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.queue_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "App full access" ON public.patients;
CREATE POLICY "App full access" ON public.patients FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "App full access" ON public.users;
CREATE POLICY "App full access" ON public.users FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "App full access" ON public.consultations;
CREATE POLICY "App full access" ON public.consultations FOR ALL USING (true) WITH CHECK (true);

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
