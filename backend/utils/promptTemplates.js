const noteSummarizationPrompt = (rawNote) => {
  return `You are a medical documentation assistant for a lying-in clinic in the Philippines.
  Structure the following raw doctor's consultation note into a clean, organized medical record.

  Output format (JSON only, no extra text):
  {
    "chiefComplaint": "...",
    "findings": "...",
    "diagnosis": "...",
    "prescription": "...",
    "followUp": "..."
  }

  Raw note: "${rawNote}"`;
};

const reportGenerationPrompt = (summaryData) => {
  const period = summaryData.weekly ? 'weekly' : 'daily';
  const periodLabel = summaryData.weekly ? 'Week' : 'Date';
  return `You are a clinic analytics assistant. Generate a structured ${period} clinic report for the clinic owner based on this data. Respond ONLY with valid JSON — no markdown code fences, no extra commentary.

Data:
  ${periodLabel}: ${summaryData.date}
  Total patients seen: ${summaryData.totalPatients}
  Chief complaints: ${summaryData.complaints.join(', ')}
  Diagnoses: ${summaryData.diagnoses.join(', ')}

JSON schema:
{
  "executiveSummary": "1–2 sentence high-level summary of clinic activity.",
  "clinicalInsights": "2–3 sentences on the most common complaints, diagnoses, and any notable clinical patterns.",
  "operationalInsights": "2–3 sentences on operational observations (peak hours, staffing, workflow, patient flow). If no data, write 'No operational insights available.'",
  "recommendations": [
    "Actionable recommendation #1 (e.g. schedule more staff during peak hours).",
    "Actionable recommendation #2 (e.g. review a frequently occurring diagnosis)."
  ]
}

Rules:
- executiveSummary: 1–2 sentences, plain language.
- clinicalInsights: focus on medical patterns and complaint/diagnosis distribution.
- operationalInsights: focus on clinic operations and workflow.
- recommendations: exactly 2 short, actionable items. Each 1 sentence max.
- If total patients is 0, write minimal, honest sentences. Do not invent data.
- Output must be valid JSON only. No markdown, no extra text.`;
};

module.exports = {
  noteSummarizationPrompt,
  reportGenerationPrompt
};