/**
 * Ollama-based local LLM service.
 *
 * Calls a locally-running Ollama instance (default: http://localhost:11434)
 * to generate AI summaries and reports without sending data to any external
 * API. This is the preferred AI provider for privacy-sensitive healthcare
 * data in the clinic.
 *
 * Requirements:
 *   - Ollama installed and running (https://ollama.com)
 *   - A model pulled, e.g.: ollama pull llama3.2:3b
 *
 * Configuration via environment variables:
 *   OLLAMA_BASE_URL  — default: http://localhost:11434
 *   OLLAMA_MODEL     — default: llama3.2:3b
 */

require('dotenv').config();

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2:3b';
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS) || 60000;

/**
 * Check if Ollama is reachable and the configured model is available.
 * Returns { available: boolean, model: string, error?: string }
 */
async function checkHealth() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      signal: controller.signal
    });
    if (!res.ok) {
      return { available: false, model: OLLAMA_MODEL, error: `HTTP ${res.status}` };
    }
    const data = await res.json();
    const models = (data.models || []).map((m) => m.name);
    const hasModel = models.some((m) => m === OLLAMA_MODEL || m.startsWith(OLLAMA_MODEL + ':'));
    if (!hasModel) {
      return {
        available: false,
        model: OLLAMA_MODEL,
        error: `Model '${OLLAMA_MODEL}' not found. Available: ${models.join(', ') || 'none'}`
      };
    }
    return { available: true, model: OLLAMA_MODEL };
  } catch (err) {
    return {
      available: false,
      model: OLLAMA_MODEL,
      error: err.name === 'AbortError' ? 'Connection timed out' : err.message
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Call the Ollama generate API with a prompt and return the raw text response.
 */
async function generate(prompt, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || OLLAMA_TIMEOUT_MS);

  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: options.model || OLLAMA_MODEL,
        prompt,
        stream: false,
        options: {
          temperature: options.temperature ?? 0.3,
          top_p: 0.9,
          num_predict: options.maxTokens ?? 1024
        }
      }),
      signal: controller.signal
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Ollama API error ${res.status}: ${errBody}`);
    }

    const data = await res.json();
    return data.response || '';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Summarize a raw doctor's note into structured fields using the local LLM.
 * Returns the same shape as aiService.summarizeNote.
 */
async function summarizeNote(rawNote) {
  const { noteSummarizationPrompt } = require('../utils/promptTemplates');
  const prompt = noteSummarizationPrompt(rawNote);

  const text = await generate(prompt, { maxTokens: 1024 });
  const cleaned = text.replace(/```json\s*|\s*```/g, '').trim();
  const structured = JSON.parse(cleaned);
  return structured;
}

/**
 * Generate a clinic report from analytics data using the local LLM.
 * Returns the same shape as aiService.generateReport.
 */
async function generateReport(summaryData) {
  const { reportGenerationPrompt } = require('../utils/promptTemplates');
  const promptData = {
    date: summaryData.date,
    totalPatients: summaryData.totalPatients,
    diagnoses: summaryData.topDiagnoses?.map(([d]) => d) || [],
    complaints: summaryData.topComplaints?.map(([c]) => c) || [],
    weekly: summaryData.weekly
  };
  const prompt = reportGenerationPrompt(promptData);

  const text = await generate(prompt, { maxTokens: 1024 });
  const cleaned = text.replace(/```json\s*|\s*```/g, '').trim();

  try {
    const parsed = JSON.parse(cleaned);
    return parsed;
  } catch {
    // If the LLM didn't return valid JSON, return the raw text as the report
    return { executiveSummary: cleaned, clinicalInsights: '', operationalInsights: '', recommendations: [] };
  }
}

/**
 * Generate a brief AI insight from analytics data for the dashboard.
 * Returns a short narrative string.
 */
async function generateInsight(analyticsData) {
  const prompt = `You are a clinic analytics assistant for a maternity clinic in the Philippines.
Based on the following analytics data, write a brief 2-3 sentence insight that highlights
the most important pattern and one actionable recommendation. Do not use markdown.

Analytics data:
- Total consultations: ${analyticsData.totalConsultations || 0}
- Total patients: ${analyticsData.totalPatients || 0}
- New patients: ${analyticsData.newPatients || 0}
- Returning patients: ${analyticsData.returningPatients || 0}
- Top complaints: ${(analyticsData.topComplaints || []).map(([c, n]) => `${c} (${n})`).join(', ') || 'None'}
- Top diagnoses: ${(analyticsData.topDiagnoses || []).map(([d, n]) => `${d} (${n})`).join(', ') || 'None'}
- Active pregnancies: ${analyticsData.activePregnancies || 0}
- Deliveries this month: ${analyticsData.deliveriesThisMonth || 0}
- Trend: ${analyticsData.trend ? `${analyticsData.trend.change > 0 ? 'up' : 'down'} ${Math.abs(analyticsData.trend.change)}%` : 'no comparison'}

Write only the insight, no preamble:`;

  const text = await generate(prompt, { maxTokens: 256, temperature: 0.4 });
  return text.trim();
}

module.exports = {
  checkHealth,
  generate,
  summarizeNote,
  generateReport,
  generateInsight,
  OLLAMA_BASE_URL,
  OLLAMA_MODEL
};
