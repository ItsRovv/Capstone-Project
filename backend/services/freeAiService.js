const { GoogleGenerativeAI } = require('@google/generative-ai');
const { noteSummarizationPrompt, reportGenerationPrompt } = require('../utils/promptTemplates');
require('dotenv').config();

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const PROVIDER = (process.env.FREE_AI_PROVIDER || 'gemini').toLowerCase();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------
function validateConfig() {
  if (PROVIDER === 'gemini') {
    if (!GEMINI_API_KEY || GEMINI_API_KEY.trim() === '') {
      throw new Error('FREE_AI_PROVIDER is set to gemini but GEMINI_API_KEY is missing.');
    }
  } else if (PROVIDER === 'groq') {
    if (!GROQ_API_KEY || GROQ_API_KEY.trim() === '') {
      throw new Error('FREE_AI_PROVIDER is set to groq but GROQ_API_KEY is missing.');
    }
  } else {
    throw new Error(`Unknown FREE_AI_PROVIDER: ${PROVIDER}. Use 'gemini' or 'groq'.`);
  }
}

// ---------------------------------------------------------------------------
// Gemini provider
// ---------------------------------------------------------------------------
let geminiClient = null;
function getGeminiModel(useJson = false) {
  if (!geminiClient) {
    geminiClient = new GoogleGenerativeAI(GEMINI_API_KEY);
  }
  const config = { maxOutputTokens: 2048 };
  if (useJson) {
    config.responseMimeType = 'application/json';
  }
  return geminiClient.getGenerativeModel({ model: GEMINI_MODEL, generationConfig: config });
}

async function callGemini(prompt, useJson = false) {
  const model = getGeminiModel(useJson);
  const result = await model.generateContent(prompt);
  const text = result.response.text();
  return text;
}

// ---------------------------------------------------------------------------
// Groq provider (OpenAI-compatible fetch)
// ---------------------------------------------------------------------------
async function callGroq(prompt, useJson = false) {
  const messages = [];
  if (useJson) {
    messages.push({
      role: 'system',
      content: 'You are a helpful assistant. Respond with valid JSON only, no markdown fences, no extra text.'
    });
  }
  messages.push({ role: 'user', content: prompt });

  const response = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      max_tokens: 2048,
      temperature: 0.3
    })
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    const err = new Error(`Groq API error ${response.status}: ${errBody}`);
    err.status = response.status;
    throw err;
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// ---------------------------------------------------------------------------
// Provider dispatcher
// ---------------------------------------------------------------------------
async function callFreeAi(prompt, useJson = false) {
  validateConfig();
  if (PROVIDER === 'gemini') {
    console.log(`[freeAiService] Using Gemini (${GEMINI_MODEL})`);
    return callGemini(prompt, useJson);
  }
  console.log(`[freeAiService] Using Groq (${GROQ_MODEL})`);
  return callGroq(prompt, useJson);
}

// ---------------------------------------------------------------------------
// Note summarization — returns structured JSON
// ---------------------------------------------------------------------------
async function summarizeNote(rawNote) {
  const prompt = noteSummarizationPrompt(rawNote);
  const text = await callFreeAi(prompt, true);

  // Clean up markdown fences if any (Groq may wrap in ```json)
  const cleanedText = text.replace(/```json\s*|\s*```/g, '').trim();
  const structured = JSON.parse(cleanedText);
  return structured;
}

// ---------------------------------------------------------------------------
// Report generation — returns plain text
// ---------------------------------------------------------------------------
async function generateReport(summaryData) {
  const promptData = {
    date: summaryData.date,
    totalPatients: summaryData.totalPatients,
    diagnoses: summaryData.topDiagnoses?.map(([d]) => d) || [],
    complaints: summaryData.topComplaints?.map(([c]) => c) || [],
    weekly: summaryData.weekly
  };
  const prompt = reportGenerationPrompt(promptData);
  const reportText = await callFreeAi(prompt, false);
  return reportText;
}

module.exports = {
  summarizeNote,
  generateReport
};
