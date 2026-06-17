-- database/schema.sql

CREATE DATABASE IF NOT EXISTS lying_in_clinic;
USE lying_in_clinic;

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin', 'doctor', 'staff') DEFAULT 'staff',
  -- Account lockout: incremented on every failed login; cleared on success.
  failed_login_attempts INT NOT NULL DEFAULT 0,
  locked_until DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE patients (
  id INT AUTO_INCREMENT PRIMARY KEY,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  date_of_birth DATE,
  age INT,
  sex ENUM('Male', 'Female', 'Other'),
  address TEXT,
  contact_number VARCHAR(20),
  emergency_contact VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE consultations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  patient_id INT NOT NULL,
  doctor_id INT,
  visit_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  raw_notes TEXT,                        -- What doctor types (unstructured)
  structured_notes TEXT,                 -- AI-summarized output
  chief_complaint VARCHAR(255),
  diagnosis VARCHAR(255),
  prescription TEXT,
  ai_summary_used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id),
  FOREIGN KEY (doctor_id) REFERENCES users(id)
);

CREATE TABLE appointments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  patient_id INT NOT NULL,
  appointment_date DATETIME NOT NULL,
  reason VARCHAR(255),
  status ENUM('scheduled', 'completed', 'cancelled') DEFAULT 'scheduled',
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id)
);

CREATE TABLE clinic_reports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  report_date DATE NOT NULL,
  report_type ENUM('daily', 'weekly') DEFAULT 'daily',
  ai_generated_text TEXT,               -- AI-generated report text
  total_patients INT,
  metrics JSON NULL,                      -- Structured analytics (complaints, diagnoses, trends, etc.)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes on frequently queried columns (speeds up search, lookups, and reports).
-- `users.email` is already UNIQUE so it is indexed automatically.
CREATE INDEX idx_patients_name ON patients (last_name, first_name);
CREATE INDEX idx_consultations_patient ON consultations (patient_id);
CREATE INDEX idx_consultations_visit_date ON consultations (visit_date);
CREATE INDEX idx_appointments_patient ON appointments (patient_id);
CREATE INDEX idx_appointments_date ON appointments (appointment_date);
CREATE INDEX idx_reports_date ON clinic_reports (report_date, report_type);