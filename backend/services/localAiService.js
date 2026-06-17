/**
 * Lightweight local "AI" that works offline and requires no API keys.
 *
 * Uses rule-based text extraction + templates to produce the same output
 * shape as Claude / Gemini. Perfect for demos, development, and clinics
 * without cloud-AI budgets.
 *
 * Accuracy is lower than a real LLM, but it is instant (< 10 ms),
 * 100 % free, and works without an internet connection.
 */

function extractSection(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      // Some patterns have capture group 2 (e.g. diagnosis with optional suffix)
      const captured = match[2] !== undefined ? match[2] : match[1];
      return captured?.trim();
    }
  }
  return '';
}

/**
 * Split text into sentences and return the first one that looks like
 * a complaint (contains symptom keywords).
 */
function firstSentenceAsComplaint(text) {
  const sentences = text.split(/[.!?]\s+/).filter(Boolean);
  const symptomKeywords = /(pain|ache|fever|headache|nausea|vomit|cough|swell|bleed|cramp|dizzy|fatigue|weak|numb|rash|itch|burn|sore|tender|stiff|spasm|discharge|spotting|contractions)/i;
  for (const s of sentences) {
    if (symptomKeywords.test(s)) return s.trim();
  }
  return sentences[0]?.trim() || '';
}

/**
 * Parse a raw doctor's note into structured fields.
 */
function summarizeNote(rawNote) {
  const text = String(rawNote || '');

  const chiefComplaint =
    extractSection(text, [
      /Chief\s*Complaint[s]?[:\s]+(.+?)(?:\n|\.|$)/i,
      /Complaint[s]?[:\s]+(.+?)(?:\n|\.|$)/i,
      /c\/o[:\s]+(.+?)(?:\n|\.|$)/i,
      /presenting[:\s]+(.+?)(?:\n|\.|$)/i,
      /presented?\s+with[:\s]+(.+?)(?:\n|\.|$)/i
    ]) || firstSentenceAsComplaint(text);

  const findings =
    extractSection(text, [
      /Findings?[:\s]+(.+?)(?:\n\n|\n[A-Z]|Diagnosis|Impression|Rx|Prescription|Follow[-\s]?up|$)/is,
      /Exam(ination)?[:\s]+(.+?)(?:\n\n|\n[A-Z]|Diagnosis|Impression|Rx|Prescription|Follow[-\s]?up|$)/is,
      /Assessment[:\s]+(.+?)(?:\n\n|\n[A-Z]|Diagnosis|Impression|Rx|Prescription|Follow[-\s]?up|$)/is,
      /Physical\s*Exam[:\s]+(.+?)(?:\n\n|\n[A-Z]|Diagnosis|Impression|Rx|Prescription|Follow[-\s]?up|$)/is
    ]);

  const diagnosis =
    extractSection(text, [
      /Diagnosis[:\s]+(.+?)(?:\n|\.|$)/i,
      /Diagnoses[:\s]+(.+?)(?:\n|\.|$)/i,
      /dx[:\s]+(.+?)(?:\n|\.|$)/i,
      /Impression[:\s]+(.+?)(?:\n|\.|$)/i,
      /assessed?\s+as[:\s]+(.+?)(?:\n|\.|$)/i
    ]);

  const prescription =
    extractSection(text, [
      /Prescription[:\s]+(.+?)(?:\n\n|\n[A-Z]|Follow[-\s]?up|Advice|Recommendation|$)/is,
      /Medication[s]?[:\s]+(.+?)(?:\n\n|\n[A-Z]|Follow[-\s]?up|Advice|Recommendation|$)/is,
      /Rx[:\s]+(.+?)(?:\n\n|\n[A-Z]|Follow[-\s]?up|Advice|Recommendation|$)/is,
      /Medicine[s]?[:\s]+(.+?)(?:\n\n|\n[A-Z]|Follow[-\s]?up|Advice|Recommendation|$)/is,
      /Given[:\s]+(.+?)(?:\n\n|\n[A-Z]|Follow[-\s]?up|Advice|Recommendation|$)/is
    ]);

  const followUp =
    extractSection(text, [
      /Follow[-\s]?up[:\s]+(.+?)(?:\n|\.|$)/i,
      /Return[:\s]+(.+?)(?:\n|\.|$)/i,
      /Next\s*visit[:\s]+(.+?)(?:\n|\.|$)/i,
      /Come\s*back[:\s]+(.+?)(?:\n|\.|$)/i,
      /Advised\s+to\s+return[:\s]+(.+?)(?:\n|\.|$)/i
    ]);

  return {
    chiefComplaint: chiefComplaint || '',
    findings: findings || '',
    diagnosis: diagnosis || '',
    prescription: prescription || '',
    followUp: followUp || ''
  };
}

/* ─────────────────── helpers for smart report generation ─────────────────── */

function fmtHour(h) {
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 || 12;
  return `${hr}:00 ${ampm}`;
}

function fmtHourRange(h) {
  const end = (h + 2) % 24;
  return `${fmtHour(h)} – ${fmtHour(end)}`;
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function trendSentence(trend) {
  if (!trend) return '';
  const { change, prevTotal, currentTotal } = trend;
  if (change === 0) {
    return `Patient volume held steady at ${plural(currentTotal, 'consultation')}, matching the previous period.`;
  }
  const direction = change > 0 ? 'increased' : 'decreased';
  const absChange = Math.abs(change);
  let sentence = `Consultation volume ${direction} ${absChange}% compared to the previous period (${plural(prevTotal, 'consultation')} → ${plural(currentTotal, 'consultation')}).`;
  if (change > 30) sentence += ' This indicates strong patient traffic growth.';
  else if (change > 0) sentence += ' This indicates growing patient traffic.';
  else if (change < -30) sentence += ' Consider reviewing outreach or scheduling capacity.';
  else sentence += ' A slight dip worth monitoring.';
  return sentence;
}

function bulletList(items) {
  if (items.length === 0) return 'None recorded.';
  return items.map(([label, count], i) => `  ${i + 1}. ${label} (${plural(count, 'case')})`).join('\n');
}

function apptBreakdownSentence(breakdown) {
  const { scheduled, completed, cancelled } = breakdown;
  const total = scheduled + completed + cancelled;
  if (total === 0) return 'No appointments were scheduled for this period.';
  const parts = [];
  if (completed > 0) parts.push(`${plural(completed, 'completed')}`);
  if (scheduled > 0) parts.push(`${plural(scheduled, 'scheduled')} remaining`);
  if (cancelled > 0) parts.push(`${plural(cancelled, 'cancelled')}`);
  const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
  let s = `${plural(total, 'appointment')} on the books: ${parts.join(', ')}.`;
  s += ` Completion rate: ${rate}%.`;
  if (rate >= 90) s += ' Excellent schedule utilization.';
  else if (rate < 60) s += ' Review no-show reasons and consider confirmation calls.';
  return s;
}

function newReturningSentence(newP, retP) {
  const total = newP + retP;
  if (total === 0) return '';
  const newPct = total > 0 ? Math.round((newP / total) * 100) : 0;
  let s = `Patient mix: ${plural(newP, 'new patient')} (${newPct}%) and ${plural(retP, 'returning patient')}.`;
  if (newPct > 50) s += ' Strong new-patient acquisition.';
  else if (newPct < 20 && total > 3) s += ' Consider community outreach to attract new patients.';
  return s;
}

function followUpSentence(alerts) {
  if (alerts.length === 0) return '';
  const lines = alerts.map((a) => `  • Patient #${a.patient_id}: ${a.instruction}`);
  return `Follow-up alerts:\n${lines.join('\n')}`;
}

function peakHourSentence(peak) {
  if (!peak) return '';
  return `Peak consultation hours were ${fmtHourRange(peak.hour)} (${plural(peak.count, 'visit')}). ${peak.hour < 12 ? 'Morning shifts may need extra staffing.' : 'Afternoon/evening traffic is heaviest.'}`;
}

/* ──────────────────────── main report generator ────────────────────────── */

/**
 * Build a smart, analytical clinic report from computed DB metrics.
 */
function generateReport(analytics) {
  const {
    date,
    weekly,
    totalPatients,
    totalAppointments,
    appointmentBreakdown,
    newPatients,
    returningPatients,
    topComplaints,
    topDiagnoses,
    peakHour: busiest,
    trend,
    followUpAlerts
  } = analytics;

  const period = weekly ? 'week' : 'day';
  const header = weekly ? `Clinic Weekly Report` : `Clinic Daily Report`;

  let report = `${header}\n`;
  report += `Period: ${date}\n`;
  report += `Generated: ${new Date().toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
  })}\n`;
  report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // ── Patient Overview ──
  report += `📊 PATIENT OVERVIEW\n`;
  report += `────────────────────────────────────────\n`;
  if (totalPatients === 0) {
    report += `No patient consultations were recorded during this ${period}.\n`;
  } else {
    report += `Total consultations: ${plural(totalPatients, 'patient')}.\n`;
    const nr = newReturningSentence(newPatients, returningPatients);
    if (nr) report += `${nr}\n`;
  }
  report += `\n`;

  // ── Appointments ──
  report += `📅 APPOINTMENTS\n`;
  report += `────────────────────────────────────────\n`;
  report += `${apptBreakdownSentence(appointmentBreakdown)}\n\n`;

  // ── Trend ──
  if (trend) {
    report += `📈 TREND ANALYSIS\n`;
    report += `────────────────────────────────────────\n`;
    report += `${trendSentence(trend)}\n\n`;
  }

  // ── Clinical Summary ──
  report += `🏥 CLINICAL SUMMARY\n`;
  report += `────────────────────────────────────────\n`;
  if (topComplaints.length > 0) {
    report += `Top complaints:\n${bulletList(topComplaints)}\n\n`;
  } else {
    report += `No chief complaints were documented.\n\n`;
  }

  if (topDiagnoses.length > 0) {
    report += `Top diagnoses:\n${bulletList(topDiagnoses)}\n\n`;
  } else {
    report += `No diagnoses were documented.\n\n`;
  }

  // ── Operational Notes ──
  report += `⚙️ OPERATIONAL NOTE\n`;
  report += `────────────────────────────────────────\n`;
  const peak = peakHourSentence(busiest);
  if (peak) report += `${peak}\n`;
  else report += `No peak-hour data available.\n`;

  if (totalPatients === 0) {
    report += `Clinic operations proceeded smoothly with no recorded consultations.\n`;
  } else {
    report += `Ensure follow-up appointments are tracked and chronic cases are monitored regularly.\n`;
  }
  report += `\n`;

  // ── Follow-up Alerts ──
  const fu = followUpSentence(followUpAlerts);
  if (fu) {
    report += `🔔 FOLLOW-UP ALERTS\n`;
    report += `────────────────────────────────────────\n`;
    report += `${fu}\n\n`;
  }

  report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  report += `End of report — ${header}`;

  return report;
}

module.exports = {
  summarizeNote,
  generateReport
};
