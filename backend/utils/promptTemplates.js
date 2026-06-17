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
  return `You are a clinic analytics assistant. Generate a plain-language ${period} clinic report for the clinic owner based on this data:

  ${periodLabel}: ${summaryData.date}
  Total patients seen: ${summaryData.totalPatients}
  Chief complaints: ${summaryData.complaints.join(', ')}
  Diagnoses: ${summaryData.diagnoses.join(', ')}

  Write a short (3–6 sentence) natural language summary. Include: total count, most common complaints, any notable patterns or trends${
    summaryData.weekly ? ' across the week' : ''
  }, and a brief operational note.`;
};

module.exports = {
  noteSummarizationPrompt,
  reportGenerationPrompt
};