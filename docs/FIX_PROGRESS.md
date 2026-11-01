# Admission and Discharge fix plan: progress

Branch: `fix/admission-discharge`. Resume from the first "Not started" or "Partial" row.
Verified after each phase: `cd backend && npm test` and `cd frontend && npm run build`.

## Findings from the first inspection

- The module already had: the 8-step wizard, a `midwife` role, a referral endpoint and `referred` status,
  a unique index so one bed holds one open stay, a one-open-stay-per-patient check, the pre-discharge
  checklist with danger-sign blocking, a minimum-stay reminder with an override reason, and audit logging.
- **Failover gap (important).** `backend/utils/sync.js` only snapshots and reverse-syncs 7 tables
  (users, patients, consultations, pregnancies, pregnancy_tracking_forms, clinic_reports, audit_logs).
  None of the admission tables (admissions, deliveries, newborns, admission_items, midwife_notes,
  labor_entries, admission_vitals, discharge_checklists, discharges, postpartum_followups, referrals),
  nor clinic_options, clinic_settings, queue_entries or consultation_transactions, are copied to the
  local fallback or pushed back. `schema.sql` is applied to the fallback, so the tables exist there,
  but data written during an outage would not reach Supabase. This predates this pass and still needs work.
- Config now lives in `backend/config/clinicalThresholds.js` (defaults marked "to be confirmed by the clinic").

## Phase 1: Safety and referral

| Item | Status | Notes |
|---|---|---|
| 1.1 Risk flags cannot be ignored | Partial | Done: red alert banner on Admit with Create referral / Continue at clinic (reason required, who and when stamped by the server, `POST /admissions/:id/risk-ack`); sticky risk header on every step (name, bed, allergies, risk chips, hours since admission); normal delivery blocked while a referral-level flag has no reason (`RISK_CONFLICT`). Not done: moving the 24-hour message off the top warnings onto Discharge only. |
| 1.2 Referral entry points | Partial | Done: Refer button in the sticky header on every step, prefilled with the trigger and risk flags; delivered stays can now be referred; doctor/admin can reverse with a reason (logged, steps reopen); re-referral reuses the row. Not done: structured transfer summary (condition, accompanied by) is free text in notes; current vitals are not prefilled. |
| 1.3 Automatic alerts | Partial | Done: red vitals readings prompt referral; labor baby-heartbeat alert with referral or dismiss-with-reason (kept as a midwife note); newborn low weight / low 5-minute APGAR prompt. Not done: cervix-not-progressing, meconium/bloody fluid, contraction pattern alerts; live colouring while typing vitals; auto-tick high blood pressure on Admit; referral prompt button on Discharge danger signs (blocking already existed). |
| 1.4 Vitals "All signs normal" bug | Done | An incomplete reading is "Incomplete reading" and lists what is missing. Saving needs BP (both), pulse, breathing, temperature (server and screen). SpO2 and baby heartbeat stay optional; "required in active labor" is not enforced. |
| 1.5 Discharge gating | Partial | Done: blocked when baby details are not saved (override reason lets it through), blocked by an unresolved referral-level flag; unresolved flags shown in red on Discharge. Existing: checklist, danger signs, minimum stay with reason, confirmation dialog. Not done: logged-reason edits after discharge for non-admins. |
| 1.6 Allergy safety | Not started | Allergies show in the header only. No item-vs-allergy check and no medications-given record yet. |

## Phase 2: Data quality

All not started except these existing pieces: 2.10 bed double-occupancy index, second-admission check and ward bed overview already exist.
Still open: 2.1 staff dropdowns, 2.2 Admit cleanup (coverage list, ICD list, consent signer, prefill from consultation),
2.3 notes label and correction history, 2.4 vitals/labor changes, 2.5 delivery changes, 2.6 baby changes,
2.7 and 2.9 item usage (quantity stepper, units, charged flag, void, reports), 2.8 discharge fields,
2.10 bed change log and night rule setting, 2.11 expected deliveries, missed follow-ups and report coverage.

## Phase 3: Cross-cutting

Not started: step check-mark definitions, unsaved-changes warning, per-admission history view,
accessibility pass, README update. Tests added so far cover thresholds, vitals completeness, risk gating,
referral reversal and discharge gating (backend/tests/admissionService.test.js and admissionRoutes.test.js).

## Migrations in this pass (idempotent, in `database/schema.sql`)

- `referrals`: `reversed_at`, `reversed_by`, `reverse_reason`
- `admissions`: `risk_ack_reason`, `risk_ack_by`, `risk_ack_at`
