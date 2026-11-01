# Admission and Discharge fix plan: progress

Branch: `fix/admission-discharge`. Verified at the end of this pass: `cd backend && npm test` (194 tests) and
`cd frontend && npm run build`. **Not verified:** the new SQL in `database/schema.sql` has never been run against a real
PostgreSQL (tests mock the data layer), and the failover sync has not been run against a real local database.
First step after pulling: start the backend (`npm run start:dev`) and check the log says "schema up to date".

## Status

Done = implemented and covered by a test or a clean build. Partial = works, with the gap named.

### Phase 1: Safety and referral

| Item | Status | Notes |
|---|---|---|
| 1.1 Risk flags | Done, one gap | Red banner with Create referral / Continue at clinic (reason, who, when); sticky risk header on every step; normal delivery blocked until a reason is recorded. Gap: the 24-hour message is still in the top warnings, not only on Discharge. |
| 1.2 Referral entry points | Partial | Refer button on every step, prefilled with the trigger and risk flags; delivered stays can be referred; doctor/admin reversal with reason. Gap: transfer summary is free text; current vitals are not prefilled. |
| 1.3 Automatic alerts | Partial | Vitals red readings, labor heartbeat (dismiss needs a reason, kept as a note), cervix not changing for 4 hours, meconium and bloody water, newborn weight and APGAR, delivery problems. Gap: contraction-pattern alert, auto-tick high BP on Admit, referral button on Discharge danger signs, live colouring while typing vitals. |
| 1.4 Vitals completeness | Done | Required: BP (both), pulse, breathing, temperature. SpO2 stays optional. |
| 1.5 Discharge gating | Done, one gap | Baby details, checklist, unresolved risk flag, death details, impossible combinations, earliest discharge time. Gap: logged-reason edits after discharge for non-admins. |
| 1.6 Allergy safety | Done | Item and medication allergy check by name and drug class, reason required; medications-given record. |

### Phase 2: Data quality

| Item | Status | Notes |
|---|---|---|
| 2.1 Staff dropdowns | Partial | Attending physician and delivery attendants (several) are dropdowns; clinical signing needs midwife/nurse/doctor or an admin granted the flag. Gap: discharge "signed by" is the logged-in user, not a dropdown. |
| 2.2 Admit cleanup | Partial | More details section, coverage list (PhilHealth, None default, PIN), ICD list (marked to be verified), consent signer and guardian rule under 18, warning signs grouped. Gap: prefill from the latest consultation is limited to what the prefill endpoint already returned; no photo upload of the consent. |
| 2.3 Notes | Done | Shift in words, corrections keep the original, reason, who and when. |
| 2.4 Vitals and labor | Done, one gap | Phase tag, postpartum fields and reminder, baby heartbeat read-only in Vitals, new water-bag options, station, contraction numbers, time it happened. Gap: partograph chart. |
| 2.5 Delivery | Done | NSD or Referred, problems checklist, mother fields, birth time checks, consistent date display. |
| 2.6 Baby | Done | Live birth or stillbirth, own birth time, sex required for a live birth, newborn care creates one usage line. |
| 2.7 Items | Done | Incomplete total, confirmation to send, zero-total reason, missing prices notice in Settings. Package ticking needs PhilHealth coverage and a PIN. |
| 2.8 Discharge | Done | Type, mother and newborn condition, follow-up date, instructions template, printable summary. |
| 2.9 Item usage | Done | Quantity, unit, charged flag, used for mother or a baby, void and correct with a reason, bundles, usage report with CSV, totals in daily/weekly/monthly reports. Legacy rows marked. Gap: settings screen to edit bundle contents. |
| 2.10 Beds and admissions | Done | Existing unique bed index and one-open-stay rule, plus a bed move log. Gap: configurable billed-nights rule. |
| 2.11 Monitoring and reports | Done | Expected deliveries, missed follow-ups, admission statistics for day, week, month, quarter or custom dates. |

### Phase 3

| Item | Status | Notes |
|---|---|---|
| Step check marks | Done | Defined by required data; amber "!" for warnings. |
| Unsaved changes | Done | Warns when leaving the Admit or Delivery/Baby step or the page. |
| Audit trail | Done | History of changes per admission for admin and doctors. |
| Roles on the backend | Done | Signer rule enforced in `middleware/role.js`; staff stay read-only. |
| Tests | Done | Thresholds, vitals, risk gating, referral reversal, discharge, items, allergy, newborn items, monitoring, sync, signer rule. |
| README | Done | Updated to match what exists. |

## Failover

`backend/utils/sync.js` now reads columns from both databases at run time and covers every table (admissions, deliveries,
newborns, items, notes, labor, vitals, checklists, discharges, referrals, follow-ups, medications, bed moves, clinic
options and settings, queue, transactions). A new table must be added to `TABLES` after the tables it references.
New ids made on the fallback start at 1,000,000 so they cannot collide; after a reverse sync the primary's counter is moved past
the highest id. Covered by mock tests only.

## Migrations (idempotent, in `database/schema.sql`)

- referrals: reversed_at, reversed_by, reverse_reason
- admissions: risk_ack_*, philhealth_pin, consent_signer_type, consent_relationship, attending_user_id; coverage list widened
- clinic_options: unit, charged, allergy_tags, bundle_items
- admission_items: unit, charged, price_missing, used_for, unlisted, ref_key, note, voided_*, legacy (unique index per admission and ref_key)
- new tables: medications_given, bed_moves
- midwife_notes: correction columns; admission_vitals: phase, bleeding, uterus, perineum
- labor_entries: station, contraction_freq, contraction_secs, occurred_at; deliveries: problems, attendant_ids, placenta, blood loss, perineum, oxytocin
- newborns: birth_status, born_at; discharges: conditions, follow_up_date, death fields; users: can_sign_clinical

## For the clinic to confirm

Thresholds (`backend/config/clinicalThresholds.js`), the ICD list, the seeded drug and supply names, units and which items are
charged (consumable supplies start as not charged), prices, PhilHealth amounts (check current circulars), the 30-day
monitoring windows. Demo midwife and doctor accounts were not added.
