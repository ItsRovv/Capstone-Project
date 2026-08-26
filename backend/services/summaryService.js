/**
 * Rule-based note summarization and report generation service.
 *
 * Uses text extraction + templates to produce structured output.
 * Instant (< 10 ms), 100 % free, and works without an internet connection.
 */

const { LRUCache } = require('../utils/lruCache');
const { parseMedicalNote } = require('../utils/medicalParser');
const { generateEnhancedReport } = require('../utils/reportEnhancer');

const summaryCache = new LRUCache(200);

function extractSection(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const captured = match[2] !== undefined ? match[2] : match[1];
      return captured?.trim();
    }
  }
  return '';
}

function firstSentenceAsComplaint(text) {
  const sentences = text.split(/[.!?]\s+/).filter(Boolean);
  const symptomKeywords = /(pain|ache|fever|headache|nausea|vomit|cough|swell|bleed|cramp|dizzy|fatigue|weak|numb|rash|itch|burn|sore|tender|stiff|spasm|discharge|spotting|contractions)/i;
  for (const s of sentences) {
    if (symptomKeywords.test(s)) return s.trim();
  }
  return sentences[0]?.trim() || '';
}

function summarizeNote(rawNote, context = {}) {
  const text = String(rawNote || '');

  // Build pregnancy context prefix if provided
  let pregnancyPrefix = '';
  if (context.pregnancyNumber || context.aog || context.lmp || context.edd || context.obIndex || context.bloodType) {
    const parts = [];
    if (context.pregnancyNumber) parts.push(`Pregnancy #${context.pregnancyNumber}`);
    if (context.obIndex) parts.push(`OB Index: ${context.obIndex}`);
    if (context.aog) parts.push(`AOG: ${context.aog}`);
    if (context.lmp) parts.push(`LMP: ${context.lmp}`);
    if (context.edd) parts.push(`EDD: ${context.edd}`);
    if (context.bloodType) parts.push(`Blood Type: ${context.bloodType}`);
    pregnancyPrefix = `[Patient Context] ${parts.join(', ')}\n\n`;
  }

  const fullText = pregnancyPrefix + text;

  const chiefComplaint =
    extractSection(fullText, [
      /Chief\s*Complaint[s]?[:\s]+(.+?)(?:\n|\.|$)/i,
      /Complaint[s]?[:\s]+(.+?)(?:\n|\.|$)/i,
      /c\/o[:\s]+(.+?)(?:\n|\.|$)/i,
      /presenting[:\s]+(.+?)(?:\n|\.|$)/i,
      /presented?\s+with[:\s]+(.+?)(?:\n|\.|$)/i
    ]) || firstSentenceAsComplaint(text);

  // ── Split findings into SOAP components ──────────────────────────────
  // Subjective: patient-reported symptoms, history
  const subjective =
    extractSection(fullText, [
      /Subjective[:\s]+(.+?)(?:\n\n|\n[A-Z]|Objective|Objective|Exam|Findings|Diagnosis|Impression|Rx|Prescription|Follow[-\s]?up|Plan|Assessment|$)/is,
      /History[:\s]+(.+?)(?:\n\n|\n[A-Z]|Objective|Exam|Findings|Diagnosis|Impression|Rx|Prescription|Follow[-\s]?up|Plan|Assessment|$)/is,
      /HPI[:\s]+(.+?)(?:\n\n|\n[A-Z]|Objective|Exam|Findings|Diagnosis|Impression|Rx|Prescription|Follow[-\s]?up|Plan|Assessment|$)/is,
      /Symptoms[:\s]+(.+?)(?:\n\n|\n[A-Z]|Objective|Exam|Findings|Diagnosis|Impression|Rx|Prescription|Follow[-\s]?up|Plan|Assessment|$)/is
    ]);

  // Objective: exam findings, vitals, observable signs
  const objective =
    extractSection(fullText, [
      /Objective[:\s]+(.+?)(?:\n\n|\n[A-Z]|Assessment|Diagnosis|Impression|Rx|Prescription|Follow[-\s]?up|Plan|$)/is,
      /Exam(ination)?[:\s]+(.+?)(?:\n\n|\n[A-Z]|Assessment|Diagnosis|Impression|Rx|Prescription|Follow[-\s]?up|Plan|$)/is,
      /Physical\s*Exam[:\s]+(.+?)(?:\n\n|\n[A-Z]|Assessment|Diagnosis|Impression|Rx|Prescription|Follow[-\s]?up|Plan|$)/is,
      /PE[:\s]+(.+?)(?:\n\n|\n[A-Z]|Assessment|Diagnosis|Impression|Rx|Prescription|Follow[-\s]?up|Plan|$)/is,
      /Findings?[:\s]+(.+?)(?:\n\n|\n[A-Z]|Assessment|Diagnosis|Impression|Rx|Prescription|Follow[-\s]?up|Plan|$)/is
    ]);

  // Assessment: clinical impression, differential
  const assessment =
    extractSection(fullText, [
      /Assessment[:\s]+(.+?)(?:\n\n|\n[A-Z]|Diagnosis|Impression|Rx|Prescription|Follow[-\s]?up|Plan|$)/is,
      /Impression[:\s]+(.+?)(?:\n\n|\n[A-Z]|Diagnosis|Rx|Prescription|Follow[-\s]?up|Plan|$)/is
    ]);

  // Plan: treatment plan, interventions
  const plan =
    extractSection(fullText, [
      /Plan[:\s]+(.+?)(?:\n\n|\n[A-Z]|Diagnosis|Rx|Prescription|Follow[-\s]?up|Advice|Recommendation|$)/is,
      /Treatment[:\s]+(.+?)(?:\n\n|\n[A-Z]|Diagnosis|Rx|Prescription|Follow[-\s]?up|Advice|Recommendation|$)/is,
      /Advice[:\s]+(.+?)(?:\n\n|\n[A-Z]|Diagnosis|Rx|Prescription|Follow[-\s]?up|Recommendation|$)/is,
      /Recommendation[s]?[:\s]+(.+?)(?:\n\n|\n[A-Z]|Diagnosis|Rx|Prescription|Follow[-\s]?up|$)/is
    ]);

  // Fallback: if no explicit SOAP sections found, use the old findings extraction
  // and try to split it into subjective (symptoms) and objective (vitals/exam)
  const findings =
    extractSection(fullText, [
      /Findings?[:\s]+(.+?)(?:\n\n|\n[A-Z]|Diagnosis|Impression|Rx|Prescription|Follow[-\s]?up|$)/is,
      /Exam(ination)?[:\s]+(.+?)(?:\n\n|\n[A-Z]|Diagnosis|Impression|Rx|Prescription|Follow[-\s]?up|$)/is
    ]);

  // If SOAP sections weren't found individually, distribute findings
  const finalSubjective = subjective || extractSymptomsFromText(findings || text);
  const finalObjective = objective || extractObjectiveFromText(findings || text);
  const finalAssessment = assessment || '';
  const finalPlan = plan || '';

  const diagnosis =
    extractSection(fullText, [
      /Diagnosis[:\s]+(.+?)(?:\n|\.|$)/i,
      /Diagnoses[:\s]+(.+?)(?:\n|\.|$)/i,
      /dx[:\s]+(.+?)(?:\n|\.|$)/i,
      /Impression[:\s]+(.+?)(?:\n|\.|$)/i,
      /assessed?\s+as[:\s]+(.+?)(?:\n|\.|$)/i
    ]);

  const prescription =
    extractSection(fullText, [
      /Prescription[:\s]+(.+?)(?:\n\n|\n[A-Z]|Follow[-\s]?up|Advice|Recommendation|$)/is,
      /Medication[s]?[:\s]+(.+?)(?:\n\n|\n[A-Z]|Follow[-\s]?up|Advice|Recommendation|$)/is,
      /Rx[:\s]+(.+?)(?:\n\n|\n[A-Z]|Follow[-\s]?up|Advice|Recommendation|$)/is,
      /Medicine[s]?[:\s]+(.+?)(?:\n\n|\n[A-Z]|Follow[-\s]?up|Advice|Recommendation|$)/is,
      /Given[:\s]+(.+?)(?:\n\n|\n[A-Z]|Follow[-\s]?up|Advice|Recommendation|$)/is
    ]);

  const followUp =
    extractSection(fullText, [
      /Follow[-\s]?up[:\s]+(.+?)(?:\n|\.|$)/i,
      /Return[:\s]+(.+?)(?:\n|\.|$)/i,
      /Next\s*visit[:\s]+(.+?)(?:\n|\.|$)/i,
      /Come\s*back[:\s]+(.+?)(?:\n|\.|$)/i,
      /Advised\s+to\s+return[:\s]+(.+?)(?:\n|\.|$)/i
    ]);

  return {
    chiefComplaint: chiefComplaint || '',
    subjective: finalSubjective || '',
    objective: finalObjective || '',
    assessment: finalAssessment || '',
    plan: finalPlan || '',
    findings: findings || '',
    diagnosis: diagnosis || '',
    prescription: prescription || '',
    followUp: followUp || ''
  };
}

// Helper: extract symptom-like sentences as subjective
function extractSymptomsFromText(text) {
  if (!text) return '';
  const sentences = text.split(/[.;\n]+/).map((s) => s.trim()).filter(Boolean);
  const symptomWords = /(pain|ache|fever|headache|nausea|vomit|cough|swell|bleed|cramp|dizzy|fatigue|weak|numb|rash|itch|burn|sore|tender|stiff|spasm|discharge|spotting|contraction|worried|concern|complain|feel|report|deny|denies|no\s+\w+)/i;
  const subjective = sentences.filter((s) => symptomWords.test(s));
  return subjective.join('. ') || sentences.slice(0, 2).join('. ');
}

// Helper: extract vitals/exam findings as objective
function extractObjectiveFromText(text) {
  if (!text) return '';
  const sentences = text.split(/[.;\n]+/).map((s) => s.trim()).filter(Boolean);
  const objectiveWords = /(bp|blood\s*pressure|hr|heart\s*rate|rr|temp|spo2|weight|height|bmi|aog|lmp|edd|fundal|fht|fhr|cervix|dilated|effaced|station|presenting|part|membrane|strip|exam|palpation|auscultation|inspection|measured|checked|found|observed|noted|seen|positive|negative|normal|abnormal|clear|good|fair|poor)/i;
  const objective = sentences.filter((s) => objectiveWords.test(s));
  return objective.join('. ');
}

/* ─────────────────── helpers for report generation ─────────────────── */

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

function generateReport(analytics) {
  const {
    date,
    weekly,
    totalPatients,
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

  if (trend) {
    report += `📈 TREND ANALYSIS\n`;
    report += `────────────────────────────────────────\n`;
    report += `${trendSentence(trend)}\n\n`;
  }

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

  report += `⚙️ OPERATIONAL NOTE\n`;
  report += `────────────────────────────────────────\n`;
  const peak = peakHourSentence(busiest);
  if (peak) report += `${peak}\n`;
  else report += `No peak-hour data available.\n`;

  if (totalPatients === 0) {
    report += `Clinic operations proceeded smoothly with no recorded consultations.\n`;
  } else {
    report += `Ensure follow-ups are tracked and chronic cases are monitored regularly.\n`;
  }
  report += `\n`;

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

/* ─────────────────── Enhanced companion layer ─────────────────────────── */

function summarizeNoteEnhanced(rawNote) {
  const cacheKey = `note:${String(rawNote || '').slice(0, 240)}`;
  const cached = summaryCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const parsed = parseMedicalNote(rawNote);

  const result = {
    chiefComplaint: parsed.chiefComplaint || '',
    findings: parsed.findings || '',
    diagnosis: parsed.diagnosis || '',
    prescription: parsed.prescription || '',
    followUp: parsed.followUp || '',
    vitalSigns: parsed.vitalSigns,
    pregnancyData: parsed.pregnancyData,
    medications: parsed.medications,
    filipinoSymptoms: parsed.filipinoSymptoms,
    confidence: parsed.confidence
  };

  summaryCache.set(cacheKey, result);
  return result;
}

function generateReportEnhanced(analytics, consultations = []) {
  const cacheKey = `report:${analytics.date}:${analytics.weekly ? 'w' : 'd'}:${analytics.totalPatients}`;
  const cached = summaryCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const report = generateEnhancedReport(analytics, consultations, 'narrative');
  summaryCache.set(cacheKey, report);
  return report;
}

module.exports = {
  summarizeNote,
  generateReport,
  summarizeNoteEnhanced,
  generateReportEnhanced
};
