const Consultation = require('../models/Consultation');
const Appointment = require('../models/Appointment');
const Report = require('../models/Report');
const aiService = require('./aiService');
const db = require('../config/db');

/**
 * Count occurrences and return sorted [value, count] pairs.
 */
function rankItems(items, topN = 5) {
  const counts = {};
  for (const item of items) {
    const key = String(item).trim();
    if (key) counts[key] = (counts[key] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN);
}

/**
 * Find the busiest hour from a list of consultations.
 */
function peakHour(consultations) {
  const hourCounts = {};
  for (const c of consultations) {
    const hour = new Date(c.visit_date).getHours();
    hourCounts[hour] = (hourCounts[hour] || 0) + 1;
  }
  const sorted = Object.entries(hourCounts).sort((a, b) => b[1] - a[1]);
  return sorted.length > 0 ? { hour: Number(sorted[0][0]), count: sorted[0][1] } : null;
}

/**
 * Extract follow-up alerts from consultation notes.
 */
function extractFollowUps(consultations) {
  const alerts = [];
  const followUpPatterns = [
    /follow[-\s]?up[:\s]+(.+?)(?:\n|\.|$)/i,
    /return(?:\s+in)?[:\s]+(.+?)(?:\n|\.|$)/i,
    /next\s*visit[:\s]+(.+?)(?:\n|\.|$)/i,
    /come\s*back[:\s]+(.+?)(?:\n|\.|$)/i,
    /advised\s+to\s+return[:\s]+(.+?)(?:\n|\.|$)/i,
    /recheck[:\s]+(.+?)(?:\n|\.|$)/i,
    /see\s+you[:\s]+(.+?)(?:\n|\.|$)/i
  ];
  for (const c of consultations) {
    const text = `${c.raw_notes || ''} ${c.structured_notes || ''} ${c.prescription || ''}`;
    for (const pattern of followUpPatterns) {
      const match = text.match(pattern);
      if (match) {
        alerts.push({
          patient_id: c.patient_id,
          instruction: match[1].trim().slice(0, 120) // cap length
        });
        break; // only first match per consultation
      }
    }
  }
  return alerts;
}

/**
 * Build rich analytics from DB data for a given period.
 */
async function buildAnalytics(consultations, appointments, dateLabel, dateISO, prevDateISO, prevRange) {
  const totalPatients = consultations.length;

  // ── Appointments ──
  const totalAppointments = appointments.length;
  const apptBreakdown = {
    scheduled: appointments.filter((a) => a.status === 'scheduled').length,
    completed: appointments.filter((a) => a.status === 'completed').length,
    cancelled: appointments.filter((a) => a.status === 'cancelled').length
  };

  // ── New vs Returning patients ──
  let newPatients = 0;
  let returningPatients = 0;
  if (totalPatients > 0) {
    const patientIds = [...new Set(consultations.map((c) => c.patient_id))];
    const [firstVisits] = await db.query(
      `SELECT patient_id, MIN(DATE(visit_date)) AS first_visit
       FROM consultations
       WHERE patient_id IN (${patientIds.map(() => '?').join(',')})
       GROUP BY patient_id`,
      patientIds
    );
    const firstVisitMap = Object.fromEntries(firstVisits.map((r) => [r.patient_id, r.first_visit]));
    for (const pid of patientIds) {
      if (firstVisitMap[pid] === dateISO) newPatients++;
      else returningPatients++;
    }
  }

  // ── Top complaints & diagnoses ──
  const topComplaints = rankItems(consultations.map((c) => c.chief_complaint));
  const topDiagnoses = rankItems(consultations.map((c) => c.diagnosis));

  // ── Peak hour ──
  const busiestHour = peakHour(consultations);

  // ── Trend vs previous period ──
  let trend = null;
  if (prevRange) {
    const prevConsultations = await Consultation.findByDateRange(prevRange.start, prevRange.end);
    const prevTotal = prevConsultations.length;
    const change = prevTotal === 0
      ? (totalPatients > 0 ? 100 : 0)
      : Math.round(((totalPatients - prevTotal) / prevTotal) * 100);
    trend = { change, prevTotal, currentTotal: totalPatients };
  } else if (prevDateISO) {
    const prevConsultations = await Consultation.findByDate(prevDateISO);
    const prevTotal = prevConsultations.length;
    const change = prevTotal === 0
      ? (totalPatients > 0 ? 100 : 0)
      : Math.round(((totalPatients - prevTotal) / prevTotal) * 100);
    trend = { change, prevTotal, currentTotal: totalPatients };
  }

  // ── Follow-up alerts ──
  const followUpAlerts = extractFollowUps(consultations);

  return {
    date: dateLabel,
    totalPatients,
    totalAppointments,
    appointmentBreakdown: apptBreakdown,
    newPatients,
    returningPatients,
    topComplaints,
    topDiagnoses,
    peakHour: busiestHour,
    trend,
    followUpAlerts
  };
}

/**
 * Generate (via AI) and persist a daily clinic report for the given date.
 * @param {string} date - 'YYYY-MM-DD'
 */
async function generateDailyReport(date) {
  const consultations = await Consultation.findByDate(date);
  const appointments = await Appointment.findByDate(date);

  const prev = new Date(date);
  prev.setDate(prev.getDate() - 1);
  const prevDateISO = prev.toISOString().split('T')[0];

  const analytics = await buildAnalytics(consultations, appointments, date, date, prevDateISO);
  const reportText = await aiService.generateReport(analytics);

  const id = await Report.save({
    date,
    report_type: 'daily',
    ai_generated_text: reportText,
    total_patients: consultations.length,
    metrics: analytics
  });

  return { id, report: reportText, metrics: analytics, total_patients: consultations.length, report_type: 'daily', date };
}

/**
 * Generate (via AI) and persist a weekly clinic report for the 7-day window
 * ending on `endDate` (inclusive).
 * @param {string} endDate - 'YYYY-MM-DD'
 */
async function generateWeeklyReport(endDate) {
  const end = new Date(endDate);
  const start = new Date(end);
  start.setDate(start.getDate() - 6); // 7-day inclusive window
  const startISO = start.toISOString().split('T')[0];

  const consultations = await Consultation.findByDateRange(startISO, endDate);
  const appointments = await Appointment.findByDateRange(startISO, endDate);

  // Previous week for trend
  const prevEnd = new Date(endDate);
  prevEnd.setDate(prevEnd.getDate() - 7);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - 6);
  const prevEndISO = prevEnd.toISOString().split('T')[0];
  const prevStartISO = prevStart.toISOString().split('T')[0];

  const analytics = await buildAnalytics(
    consultations, appointments, `${startISO} to ${endDate}`, endDate, null, { start: prevStartISO, end: prevEndISO }
  );
  analytics.weekly = true;
  const reportText = await aiService.generateReport(analytics);

  const id = await Report.save({
    date: endDate,
    report_type: 'weekly',
    ai_generated_text: reportText,
    total_patients: consultations.length,
    metrics: analytics
  });

  return {
    id,
    report: reportText,
    metrics: analytics,
    total_patients: consultations.length,
    report_type: 'weekly',
    date: endDate,
    range: { start: startISO, end: endDate }
  };
}

module.exports = { generateDailyReport, generateWeeklyReport };
