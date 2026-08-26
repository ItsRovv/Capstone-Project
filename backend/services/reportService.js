const Consultation = require('../models/Consultation');
const Pregnancy = require('../models/Pregnancy');
const Report = require('../models/Report');
const summaryService = require('./summaryService');
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
 * Build pregnancy tracking analytics for a given period.
 */
async function buildPregnancyAnalytics(dateISO, isWeekly, rangeStart, rangeEnd) {
  const pregnancies = isWeekly
    ? await Pregnancy.findByDateRange(rangeStart, rangeEnd)
    : await Pregnancy.findByDate(dateISO);

  const activePregnancies = await Pregnancy.findActive();

  // Group by trimester
  const trimesterCounts = { 1: 0, 2: 0, 3: 0 };
  for (const p of activePregnancies) {
    const t = Number(p.trimester);
    if (t >= 1 && t <= 3) trimesterCounts[t]++;
  }

  // Group by status
  const statusCounts = {};
  for (const p of activePregnancies) {
    const s = p.status || 'unknown';
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  }

  // Upcoming EDDs (within next 30 days)
  const now = new Date();
  const thirtyDaysLater = new Date();
  thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);
  const upcomingEDDs = activePregnancies
    .filter((p) => {
      if (!p.edd) return false;
      const edd = new Date(p.edd);
      return edd >= now && edd <= thirtyDaysLater;
    })
    .map((p) => ({
      patient_id: p.patient_id,
      edd: p.edd,
      weeks: p.weeks,
      trimester: p.trimester
    }))
    .sort((a, b) => new Date(a.edd) - new Date(b.edd));

  return {
    newRecords: pregnancies.length,
    activeTotal: activePregnancies.length,
    byTrimester: trimesterCounts,
    byStatus: statusCounts,
    upcomingEDDs
  };
}

/**
 * Build rich analytics from DB data for a given period.
 */
async function buildAnalytics(consultations, dateLabel, dateISO, prevDateISO, prevRange, reportRange) {
  const totalPatients = consultations.length;

  // ── New vs Returning patients ──
  let newPatients = 0;
  let returningPatients = 0;
  if (totalPatients > 0) {
    const patientIds = [...new Set(consultations.map((c) => c.patient_id))];
    const [firstVisits] = await db.query(
      `SELECT patient_id, to_char(MIN(visit_date::date), 'YYYY-MM-DD') AS first_visit
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

  // ── Pregnancy tracking ──
  const isWeekly = !!reportRange;
  const pregnancy = await buildPregnancyAnalytics(
    dateISO, isWeekly, reportRange?.start, reportRange?.end || dateISO
  );

  return {
    date: dateLabel,
    totalPatients,
    newPatients,
    returningPatients,
    topComplaints,
    topDiagnoses,
    peakHour: busiestHour,
    trend,
    followUpAlerts,
    pregnancy
  };
}

/**
 * Generate (via AI) and persist a daily clinic report for the given date.
 * @param {string} date - 'YYYY-MM-DD'
 */
async function generateDailyReport(date) {
  const consultations = await Consultation.findByDate(date);

  const prev = new Date(date);
  prev.setDate(prev.getDate() - 1);
  const prevDateISO = prev.toISOString().split('T')[0];

  const analytics = await buildAnalytics(consultations, date, date, prevDateISO);
  const reportText = await summaryService.generateReport(analytics);

  const id = await Report.save({
    date,
    report_type: 'daily',
    summary_text: reportText,
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

  // Previous week for trend
  const prevEnd = new Date(endDate);
  prevEnd.setDate(prevEnd.getDate() - 7);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - 6);
  const prevEndISO = prevEnd.toISOString().split('T')[0];
  const prevStartISO = prevStart.toISOString().split('T')[0];

  const analytics = await buildAnalytics(
    consultations, `${startISO} to ${endDate}`, endDate, null, { start: prevStartISO, end: prevEndISO }, { start: startISO, end: endDate }
  );
  analytics.weekly = true;
  const reportText = await summaryService.generateReport(analytics);

  const id = await Report.save({
    date: endDate,
    report_type: 'weekly',
    summary_text: reportText,
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

/**
 * Generate and persist a monthly census report for the given month.
 * @param {string} monthYear - 'YYYY-MM' (e.g. '2025-01')
 */
async function generateMonthlyCensusReport(monthYear) {
  const [year, month] = monthYear.split('-').map(Number);
  if (!year || !month) {
    throw new Error('Invalid month format. Use YYYY-MM.');
  }

  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0); // last day of month
  const startISO = start.toISOString().split('T')[0];
  const endISO = end.toISOString().split('T')[0];

  const consultations = await Consultation.findByDateRange(startISO, endISO);
  const pregnancies = await Pregnancy.findByDateRange(startISO, endISO);
  const activePregnancies = await Pregnancy.findActive();

  // Unique patients this month
  const uniquePatientIds = [...new Set(consultations.map((c) => c.patient_id))];

  // New vs returning (first-ever visit falls in this month)
  let newPatients = 0;
  let returningPatients = 0;
  if (uniquePatientIds.length > 0) {
    const [firstVisits] = await db.query(
      `SELECT patient_id, to_char(MIN(visit_date::date), 'YYYY-MM-DD') AS first_visit
       FROM consultations
       WHERE patient_id IN (${uniquePatientIds.map(() => '?').join(',')})
       GROUP BY patient_id`,
      uniquePatientIds
    );
    const firstVisitMap = Object.fromEntries(firstVisits.map((r) => [r.patient_id, r.first_visit]));
    for (const pid of uniquePatientIds) {
      const fv = firstVisitMap[pid];
      if (fv && fv >= startISO && fv <= endISO) newPatients++;
      else returningPatients++;
    }
  }

  // Pregnancy census
  const trimesterCounts = { 1: 0, 2: 0, 3: 0 };
  for (const p of activePregnancies) {
    const t = Number(p.trimester);
    if (t >= 1 && t <= 3) trimesterCounts[t]++;
  }

  const statusCounts = {};
  for (const p of activePregnancies) {
    const s = p.status || 'unknown';
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  }

  // Deliveries this month (pregnancies completed in date range)
  const deliveries = pregnancies.filter((p) => p.status === 'Completed' || p.status === 'Delivered');

  // Top complaints & diagnoses
  const topComplaints = rankItems(consultations.map((c) => c.chief_complaint));
  const topDiagnoses = rankItems(consultations.map((c) => c.diagnosis));

  const monthLabel = start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const analytics = {
    date: monthLabel,
    monthYear,
    range: { start: startISO, end: endISO },
    totalConsultations: consultations.length,
    uniquePatients: uniquePatientIds.length,
    newPatients,
    returningPatients,
    topComplaints,
    topDiagnoses,
    pregnancy: {
      newRecords: pregnancies.length,
      activeTotal: activePregnancies.length,
      deliveries: deliveries.length,
      byTrimester: trimesterCounts,
      byStatus: statusCounts
    },
    monthly: true
  };

  const reportText = await summaryService.generateReport(analytics);

  const id = await Report.save({
    date: endISO,
    report_type: 'monthly',
    summary_text: reportText,
    total_patients: uniquePatientIds.length,
    metrics: analytics
  });

  return {
    id,
    report: reportText,
    metrics: analytics,
    total_patients: uniquePatientIds.length,
    report_type: 'monthly',
    date: endISO,
    monthYear,
    range: { start: startISO, end: endISO }
  };
}

module.exports = { generateDailyReport, generateWeeklyReport, generateMonthlyCensusReport };
