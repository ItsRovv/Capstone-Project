/**
 * reportEnhancer.js
 *
 * Enhances clinic reports with:
 *   – multiple template styles (narrative, bullet, executive)
 *   – clinical risk flagging (high-risk pregnancy, hypertensive disorders, etc.)
 *   – pregnancy trimester breakdown
 *   – actionable, prioritized recommendations
 */

/* ────────────────────── Template variety ──────────────────────────────── */

const TEMPLATES = {
  narrative: 'narrative',
  bullet: 'bullet',
  executive: 'executive',
  clinical: 'clinical'
};

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

function peakHourSentence(peak) {
  if (!peak) return '';
  return `Peak consultation hours were ${fmtHourRange(peak.hour)} (${plural(peak.count, 'visit')}). ${peak.hour < 12 ? 'Morning shifts may need extra staffing.' : 'Afternoon/evening traffic is heaviest.'}`;
}

function followUpSentence(alerts) {
  if (alerts.length === 0) return '';
  const lines = alerts.map((a) => `  • Patient #${a.patient_id}: ${a.instruction}`);
  return `Follow-up alerts:\n${lines.join('\n')}`;
}

/* ─────────────────── Clinical risk flagging ───────────────────────────── */

const RISK_KEYWORDS = {
  high_risk_pregnancy: [
    'preeclampsia', 'eclampsia', 'severe preeclampsia', 'hellp', 'placental abruption',
    'placenta previa', 'preterm labor', 'premature rupture of membranes', 'pROM',
    'gestational hypertension', 'chronic hypertension', 'multiple gestation',
    'twins', 'triplets', 'oligohydramnios', 'polyhydramnios', 'iugr', 'fetal distress',
    'postpartum hemorrhage', 'ppH', 'cord prolapse', 'shoulder dystocia', 'breech',
    'prev cesarean', 'previous cs', 'repeat cs', 'vbac'
  ],
  hypertensive_disorder: [
    'hypertension', 'elevated bp', 'high blood pressure', 'bp 14[0-9]', 'bp 15[0-9]',
    'bp 16[0-9]', 'bp 17[0-9]', 'bp 18[0-9]', 'bp 19[0-9]', 'bp 20[0-9]',
    'severe range', 'proteinuria'
  ],
  diabetes: [
    'gestational diabetes', 'gdm', 'type 1 diabetes', 'type 2 diabetes', 'hyperglycemia',
    'elevated fasting glucose', 'impaired glucose', 'insulin'
  ],
  hemorrhage: [
    'hemorrhage', 'bleeding', 'postpartum hemorrhage', 'abruption', 'previa',
    'antepartum hemorrhage', 'aph'
  ],
  infection: [
    'sepsis', 'chorioamnionitis', 'endometritis', 'pyelonephritis', 'pneumonia',
    'covid', 'dengue', 'malaria', 'uti', 'puerperal infection'
  ],
  fetal_distress: [
    'fetal distress', 'non-reassuring fetal status', 'nrfht', 'late decelerations',
    'variable decelerations', 'bradycardia', 'tachycardia', 'oligohydramnios'
  ]
};

function flagClinicalRisks(consultations) {
  const flags = [];
  const seen = new Set();

  for (const c of consultations) {
    const text = `${c.diagnosis || ''} ${c.chief_complaint || ''} ${c.raw_notes || ''} ${c.structured_notes || ''}`.toLowerCase();
    for (const [category, keywords] of Object.entries(RISK_KEYWORDS)) {
      for (const kw of keywords) {
        const pattern = kw.includes('bp ') ? new RegExp(kw, 'i') : new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        if (pattern.test(text)) {
          const key = `${c.patient_id}-${category}`;
          if (!seen.has(key)) {
            seen.add(key);
            flags.push({
              patientId: c.patient_id,
              category,
              keyword: kw,
              severity: category === 'high_risk_pregnancy' || category === 'hemorrhage' || category === 'infection' ? 'high' : 'moderate',
              source: 'auto-detected from consultation record'
            });
          }
          break;
        }
      }
    }
  }

  // Sort by severity
  const severityOrder = { high: 0, moderate: 1, low: 2 };
  flags.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  return flags;
}

/* ─────────────────── Pregnancy trimester breakdown ────────────────────── */

function trimesterBreakdown(consultations) {
  const trimesters = { first: [], second: [], third: [], unknown: [] };

  for (const c of consultations) {
    const text = `${c.diagnosis || ''} ${c.chief_complaint || ''} ${c.raw_notes || ''} ${c.structured_notes || ''}`;

    // Look for explicit AOG
    const aogMatch = text.match(/(\d{1,2})\s*(?:weeks?|wks?)/i);
    if (aogMatch) {
      const weeks = Number(aogMatch[1]);
      const bucket = weeks <= 12 ? 'first' : weeks <= 24 ? 'second' : 'third';
      trimesters[bucket].push({ patientId: c.patient_id, weeks });
      continue;
    }

    // Look for trimester keywords
    const lower = text.toLowerCase();
    if (/1st trimester|first trimester|early pregnancy/i.test(lower)) {
      trimesters.first.push({ patientId: c.patient_id });
    } else if (/2nd trimester|second trimester|mid pregnancy/i.test(lower)) {
      trimesters.second.push({ patientId: c.patient_id });
    } else if (/3rd trimester|third trimester|late pregnancy|term pregnancy|full term/i.test(lower)) {
      trimesters.third.push({ patientId: c.patient_id });
    } else if (/pregnant|pregnancy|prenatal|antenatal|obstetric/i.test(lower)) {
      trimesters.unknown.push({ patientId: c.patient_id });
    }
  }

  return {
    firstTrimester: { count: trimesters.first.length, patients: trimesters.first },
    secondTrimester: { count: trimesters.second.length, patients: trimesters.second },
    thirdTrimester: { count: trimesters.third.length, patients: trimesters.third },
    unknown: { count: trimesters.unknown.length, patients: trimesters.unknown }
  };
}

/* ─────────────────── Actionable recommendations ───────────────────────── */

function generateRecommendations(analytics, riskFlags, trimesterData) {
  const recs = [];

  // Volume-based
  if (analytics.trend) {
    if (analytics.trend.change > 30) {
      recs.push({ priority: 'medium', area: 'operations', text: 'Patient volume is rising rapidly; ensure adequate staffing and supplies.' });
    } else if (analytics.trend.change < -20) {
      recs.push({ priority: 'medium', area: 'outreach', text: 'Patient volume is declining; review community outreach or clinic hours.' });
    }
  }

  // New patient acquisition
  const totalPts = (analytics.newPatients || 0) + (analytics.returningPatients || 0);
  const newPct = totalPts > 0 ? Math.round((analytics.newPatients / totalPts) * 100) : 0;
  if (newPct < 20 && totalPts > 5) {
    recs.push({ priority: 'low', area: 'outreach', text: 'New patient rate is low; consider local health seminars or referral partnerships.' });
  }

  // Clinical risk flags
  const highRisks = riskFlags.filter((f) => f.severity === 'high');
  const moderateRisks = riskFlags.filter((f) => f.severity === 'moderate');
  if (highRisks.length > 0) {
    recs.push({
      priority: 'high',
      area: 'clinical',
      text: `Urgent: ${highRisks.length} high-risk case(s) flagged. Ensure immediate follow-up and consider referral if not managed in-house.`
    });
  }
  if (moderateRisks.length > 0) {
    recs.push({
      priority: 'medium',
      area: 'clinical',
      text: `${moderateRisks.length} moderate-risk case(s) detected. Schedule enhanced monitoring.`
    });
  }

  // Trimester-based
  const t3 = trimesterData.thirdTrimester?.count || 0;
  if (t3 > 0) {
    recs.push({
      priority: 'medium',
      area: 'clinical',
      text: `${t3} patient(s) in third trimester; verify birth plans and emergency transport readiness.`
    });
  }
  const unknown = trimesterData.unknown?.count || 0;
  if (unknown > 0) {
    recs.push({
      priority: 'low',
      area: 'clinical',
      text: `${unknown} pregnancy visit(s) without clear trimester documentation; record AOG or EDD for better tracking.`
    });
  }

  // Peak hour
  if (analytics.peakHour) {
    if (analytics.peakHour.hour < 10) {
      recs.push({ priority: 'low', area: 'operations', text: 'Early morning peak detected; open reception 15 minutes earlier if possible.' });
    } else if (analytics.peakHour.hour >= 16) {
      recs.push({ priority: 'low', area: 'operations', text: 'Late afternoon peak detected; consider extending evening hours.' });
    }
  }

  // Top complaint patterns
  const topComplaint = (analytics.topComplaints || [])[0];
  if (topComplaint) {
    const [complaint] = topComplaint;
    const lowerComplaint = String(complaint).toLowerCase();
    if (/fever|dengue|typhoid|malaria/.test(lowerComplaint)) {
      recs.push({ priority: 'medium', area: 'clinical', text: `High incidence of "${complaint}" — review infection-control protocols.` });
    } else if (/hypertension|bp|preeclampsia/.test(lowerComplaint)) {
      recs.push({ priority: 'medium', area: 'clinical', text: `Frequent "${complaint}" presentations — ensure BP cuffs and antihypertensives are stocked.` });
    } else if (/anemia|pale|weak/.test(lowerComplaint)) {
      recs.push({ priority: 'low', area: 'clinical', text: `Anemia-related complaints prevalent; check iron supplement inventory.` });
    }
  }

  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  recs.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return recs;
}

/* ─────────────────── Report builders per template ─────────────────────── */

function buildNarrativeReport(analytics, riskFlags, trimesterData, recommendations) {
  const period = analytics.weekly ? 'week' : 'day';
  const header = analytics.weekly ? 'Enhanced Weekly Clinic Report' : 'Enhanced Daily Clinic Report';

  let report = `${header}\n`;
  report += `Period: ${analytics.date}\n`;
  report += `Generated: ${new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}\n`;
  report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Patient overview
  report += `📊 PATIENT OVERVIEW\n`;
  report += `────────────────────────────────────────\n`;
  if (analytics.totalPatients === 0) {
    report += `No patient consultations were recorded during this ${period}.\n`;
  } else {
    report += `Total consultations: ${plural(analytics.totalPatients, 'patient')}.\n`;
    const nr = newReturningSentence(analytics.newPatients || 0, analytics.returningPatients || 0);
    if (nr) report += `${nr}\n`;
  }
  report += `\n`;

  // Trend
  if (analytics.trend) {
    report += `📈 TREND ANALYSIS\n`;
    report += `────────────────────────────────────────\n`;
    report += `${trendSentence(analytics.trend)}\n\n`;
  }

  // Clinical summary
  report += `🏥 CLINICAL SUMMARY\n`;
  report += `────────────────────────────────────────\n`;
  if ((analytics.topComplaints || []).length > 0) {
    report += `Top complaints:\n${bulletList(analytics.topComplaints)}\n\n`;
  } else {
    report += `No chief complaints were documented.\n\n`;
  }

  if ((analytics.topDiagnoses || []).length > 0) {
    report += `Top diagnoses:\n${bulletList(analytics.topDiagnoses)}\n\n`;
  } else {
    report += `No diagnoses were documented.\n\n`;
  }

  // Trimester breakdown
  report += `🤰 PREGNANCY TRIMESTER BREAKDOWN\n`;
  report += `────────────────────────────────────────\n`;
  report += `  • First trimester:  ${plural(trimesterData.firstTrimester.count, 'patient')}\n`;
  report += `  • Second trimester: ${plural(trimesterData.secondTrimester.count, 'patient')}\n`;
  report += `  • Third trimester:  ${plural(trimesterData.thirdTrimester.count, 'patient')}\n`;
  if (trimesterData.unknown.count > 0) {
    report += `  • Trimester unknown:  ${plural(trimesterData.unknown.count, 'patient')} (document AOG/EDD)\n`;
  }
  report += `\n`;

  // Risk flags
  if (riskFlags.length > 0) {
    report += `⚠️ CLINICAL RISK FLAGS\n`;
    report += `────────────────────────────────────────\n`;
    for (const f of riskFlags) {
      const icon = f.severity === 'high' ? '🔴' : '🟡';
      report += `  ${icon} [${f.severity.toUpperCase()}] Patient #${f.patientId} — ${f.category.replace(/_/g, ' ')} (${f.keyword})\n`;
    }
    report += `\n`;
  }

  // Recommendations
  if (recommendations.length > 0) {
    report += `💡 ACTIONABLE RECOMMENDATIONS\n`;
    report += `────────────────────────────────────────\n`;
    for (const r of recommendations) {
      const icon = r.priority === 'high' ? '🔴' : r.priority === 'medium' ? '🟡' : '🟢';
      report += `  ${icon} [${r.area.toUpperCase()}] ${r.text}\n`;
    }
    report += `\n`;
  }

  // Operational notes
  report += `⚙️ OPERATIONAL NOTE\n`;
  report += `────────────────────────────────────────\n`;
  const peak = peakHourSentence(analytics.peakHour);
  if (peak) report += `${peak}\n`;
  else report += `No peak-hour data available.\n`;

  if (analytics.totalPatients === 0) {
    report += `Clinic operations proceeded smoothly with no recorded consultations.\n`;
  } else {
    report += `Ensure follow-ups are tracked and chronic cases are monitored regularly.\n`;
  }
  report += `\n`;

  // Follow-up alerts
  const fu = followUpSentence(analytics.followUpAlerts || []);
  if (fu) {
    report += `🔔 FOLLOW-UP ALERTS\n`;
    report += `────────────────────────────────────────\n`;
    report += `${fu}\n\n`;
  }

  report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  report += `End of report — ${header}`;

  return report;
}

function buildBulletReport(analytics, riskFlags, trimesterData, recommendations) {
  const header = analytics.weekly ? 'Weekly Clinic Report (Bullet)' : 'Daily Clinic Report (Bullet)';
  let report = `${header}\n`;
  report += `Period: ${analytics.date} | Generated: ${new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}\n\n`;

  report += `• Total patients: ${analytics.totalPatients}\n`;
  report += `• New: ${analytics.newPatients || 0} | Returning: ${analytics.returningPatients || 0}\n`;
  if (analytics.trend) report += `• Trend: ${trendSentence(analytics.trend)}\n`;

  report += `\n— Top Complaints —\n`;
  report += bulletList(analytics.topComplaints || []) + '\n';

  report += `\n— Top Diagnoses —\n`;
  report += bulletList(analytics.topDiagnoses || []) + '\n';

  report += `\n— Trimesters —\n`;
  report += `• 1st: ${trimesterData.firstTrimester.count} | 2nd: ${trimesterData.secondTrimester.count} | 3rd: ${trimesterData.thirdTrimester.count}\n`;

  if (riskFlags.length > 0) {
    report += `\n— Risk Flags —\n`;
    for (const f of riskFlags) {
      report += `• [${f.severity}] ${f.category.replace(/_/g, ' ')} (Patient #${f.patientId})\n`;
    }
  }

  if (recommendations.length > 0) {
    report += `\n— Recommendations —\n`;
    for (const r of recommendations) {
      report += `• [${r.priority}] ${r.text}\n`;
    }
  }

  return report;
}

function buildExecutiveReport(analytics, riskFlags, trimesterData, recommendations) {
  const period = analytics.weekly ? 'weekly' : 'daily';
  let report = `EXECUTIVE SUMMARY — ${analytics.date}\n\n`;
  report += `During this ${period}, the clinic recorded ${plural(analytics.totalPatients, 'consultation')}. `;

  const highRisks = riskFlags.filter((f) => f.severity === 'high').length;
  if (highRisks > 0) {
    report += `${highRisks} high-risk case(s) require immediate attention. `;
  }

  if (recommendations.length > 0) {
    const topRec = recommendations[0];
    report += `Top priority: ${topRec.text}\n`;
  } else {
    report += `Operations remain within normal parameters.\n`;
  }

  return report;
}

function buildClinicalReport(analytics, riskFlags, trimesterData, recommendations) {
  const header = analytics.weekly ? 'Clinical Weekly Report' : 'Clinical Daily Report';
  let report = `${header}\n`;
  report += `Date: ${analytics.date}\n\n`;

  report += `CLINICAL METRICS\n`;
  report += `────────────────────────────────────────\n`;
  report += `Consultations: ${analytics.totalPatients}\n`;
  report += `Peak hour: ${analytics.peakHour ? fmtHourRange(analytics.peakHour.hour) : 'N/A'}\n`;

  report += `\nTRIMESTER DISTRIBUTION\n`;
  report += `────────────────────────────────────────\n`;
  report += `T1: ${trimesterData.firstTrimester.count} | T2: ${trimesterData.secondTrimester.count} | T3: ${trimesterData.thirdTrimester.count}\n`;

  report += `\nRISK STRATIFICATION\n`;
  report += `────────────────────────────────────────\n`;
  if (riskFlags.length === 0) {
    report += `No automated risk flags triggered.\n`;
  } else {
    const bySev = { high: 0, moderate: 0, low: 0 };
    for (const f of riskFlags) bySev[f.severity] = (bySev[f.severity] || 0) + 1;
    report += `High: ${bySev.high} | Moderate: ${bySev.moderate} | Low: ${bySev.low}\n`;
    for (const f of riskFlags) {
      report += `  [${f.severity}] ${f.category.replace(/_/g, ' ')} — Patient #${f.patientId}\n`;
    }
  }

  report += `\nRECOMMENDED ACTIONS\n`;
  report += `────────────────────────────────────────\n`;
  if (recommendations.length === 0) {
    report += `No specific actions recommended.\n`;
  } else {
    for (const r of recommendations) {
      report += `[${r.priority.toUpperCase()}] ${r.area.toUpperCase()}: ${r.text}\n`;
    }
  }

  return report;
}

/* ─────────────────── Main enhancer entry point ────────────────────────── */

function generateEnhancedReport(analytics, consultations = [], template = TEMPLATES.narrative) {
  const riskFlags = flagClinicalRisks(consultations);
  const trimesterData = trimesterBreakdown(consultations);
  const recommendations = generateRecommendations(analytics, riskFlags, trimesterData);

  switch (template) {
    case TEMPLATES.bullet:
      return buildBulletReport(analytics, riskFlags, trimesterData, recommendations);
    case TEMPLATES.executive:
      return buildExecutiveReport(analytics, riskFlags, trimesterData, recommendations);
    case TEMPLATES.clinical:
      return buildClinicalReport(analytics, riskFlags, trimesterData, recommendations);
    case TEMPLATES.narrative:
    default:
      return buildNarrativeReport(analytics, riskFlags, trimesterData, recommendations);
  }
}

module.exports = {
  generateEnhancedReport,
  flagClinicalRisks,
  trimesterBreakdown,
  generateRecommendations,
  TEMPLATES
};
