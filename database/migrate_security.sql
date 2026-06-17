-- database/migrate_security.sql
-- Run this once against an EXISTING lying_in_clinic database to apply the
-- security hardening schema changes introduced in the 2026-06 security audit.
-- Safe to run multiple times (uses IF NOT EXISTS / IF column exists guards).

USE lying_in_clinic;

-- ── users ────────────────────────────────────────────────────────────────────

-- Account-lockout tracking
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS failed_login_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until DATETIME NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- ── patients ─────────────────────────────────────────────────────────────────

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- ── consultations ─────────────────────────────────────────────────────────────

ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- ── appointments ─────────────────────────────────────────────────────────────

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

SELECT 'Security migration complete.' AS status;
