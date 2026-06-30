const Anthropic = require('@anthropic-ai/sdk');
const { noteSummarizationPrompt, reportGenerationPrompt } = require('../utils/promptTemplates');
const localAi = require('./localAiService');
const freeAi = require('./freeAiService');
require('dotenv').config();

// ---------------------------------------------------------------------------
// Key validation — runs once at startup.
// IMPORTANT: never log the actual key value; only its presence/shape is checked.
// ---------------------------------------------------------------------------
(function validateAnthropicKey() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || key.trim() === '') {
    console.warn('[aiService] WARNING: ANTHROPIC_API_KEY is not set. Will fall back to local AI.');
  } else if (key.startsWith('your-') || key.includes('your-key') || key.includes('placeholder')) {
    console.warn('[aiService] WARNING: ANTHROPIC_API_KEY looks like a placeholder. Will fall back to local AI.');
  } else {
    const masked = '*'.repeat(Math.max(0, key.length - 4)) + key.slice(-4);
    console.log(`[aiService] Anthropic key loaded (${masked})`);
  }
})();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// Default to Claude 3.5 Sonnet — fast, high-quality, great for structured output.
// Override via ANTHROPIC_MODEL env var if needed (e.g. claude-3-haiku-20240307 for cheaper calls).
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';

// When true, skip Anthropic entirely and use the offline local engine.
const USE_LOCAL_AI = process.env.USE_LOCAL_AI === 'true';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Call Claude with automatic retry on 429 rate-limit responses.
 */
async function callWithRetry(prompt, maxRetries = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }]
      });
      return result.content[0].text;
    } catch (err) {
      lastErr = err;
      if (err.status === 429) {
        // Anthropic's Retry-After header or default to 15 s
        let delayMs = 15000;
        try {
          const retryAfter = err.headers?.['retry-after'];
          if (retryAfter) {
            const secs = parseFloat(retryAfter);
            if (!isNaN(secs)) delayMs = Math.ceil(secs) * 1000 + 1000;
          }
        } catch { /* ignore parse errors */ }
        if (attempt < maxRetries) {
          console.warn(`[aiService] Rate limited (429). Retrying in ${delayMs / 1000}s… (attempt ${attempt}/${maxRetries})`);
          await sleep(delayMs);
          continue;
        }
      }
      throw err;
    }
  }
  throw lastErr;
}

async function summarizeNote(rawNote) {
  if (USE_LOCAL_AI) {
    console.log('[aiService] Using local AI for note summarization.');
    return localAi.summarizeNote(rawNote);
  }

  try {
    const text = await callWithRetry(noteSummarizationPrompt(rawNote));
    // Remove any markdown code block fences if present
    const cleanedText = text.replace(/```json\s*|\s*```/g, '').trim();
    const structured = JSON.parse(cleanedText);
    return structured;
  } catch (error) {
    console.warn('[aiService] Anthropic failed, trying free AI:', error.message || error);
    try {
      return await freeAi.summarizeNote(rawNote);
    } catch (freeError) {
      console.warn('[aiService] Free AI failed, falling back to enhanced local AI:', freeError.message || freeError);
      return localAi.summarizeNoteEnhanced(rawNote);
    }
  }
}

async function generateReport(summaryData) {
  if (USE_LOCAL_AI) {
    console.log('[aiService] Using local AI for report generation.');
    return localAi.generateReport(summaryData);
  }

  // Normalize the rich analytics object back to the prompt-template shape
  const promptData = {
    date: summaryData.date,
    totalPatients: summaryData.totalPatients,
    diagnoses: summaryData.topDiagnoses?.map(([d]) => d) || [],
    complaints: summaryData.topComplaints?.map(([c]) => c) || [],
    weekly: summaryData.weekly
  };

  try {
    const rawText = await callWithRetry(reportGenerationPrompt(promptData));
    // Strip any accidental markdown fences
    const cleanedText = rawText.replace(/```json\s*|\s*```/g, '').trim();
    // Try to parse as structured JSON
    const parsed = JSON.parse(cleanedText);
    return parsed;
  } catch (error) {
    console.warn('[aiService] Anthropic structured JSON failed, trying free AI:', error.message || error);
    try {
      return await freeAi.generateReport(summaryData);
    } catch (freeError) {
      console.warn('[aiService] Free AI failed, falling back to enhanced local AI:', freeError.message || freeError);
      return localAi.generateReportEnhanced(summaryData);
    }
  }
}

module.exports = {
  summarizeNote,
  generateReport
};
