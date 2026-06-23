/**
 * medicalParser.js
 *
 * Enhanced rule-based medical text parser for Philippine lying-in clinics.
 * Provides fuzzy header matching, abbreviation expansion, vital-sign extraction,
 * pregnancy-data parsing, medication structuring, Filipino symptom detection,
 * and per-field confidence scoring.
 */

/* ────────────────────── Abbreviation dictionary ─────────────────────── */

const ABBREVIATIONS = {
  // Vitals
  bp: 'blood pressure',
  hr: 'heart rate',
  rr: 'respiratory rate',
  temp: 'temperature',
  t: 'temperature',
  spo2: 'oxygen saturation',
  o2sat: 'oxygen saturation',
  wt: 'weight',
  ht: 'height',
  bmi: 'body mass index',
  // Obstetric
  lmp: 'last menstrual period',
  aog: 'age of gestation',
  edd: 'estimated date of delivery',
  gp: 'gravida/para',
  g: 'gravida',
  p: 'para',
  fh: 'fundal height',
  fht: 'fetal heart tone',
  fhr: 'fetal heart rate',
  rom: 'rupture of membranes',
  bOW: 'bag of waters',
  // General
  c: 'with',
  s: 'without',
  dx: 'diagnosis',
  rx: 'prescription',
  tx: 'treatment',
  hx: 'history',
  px: 'physical examination',
  sx: 'symptoms',
  cc: 'chief complaint',
  hpi: 'history of present illness',
  pmh: 'past medical history',
  fhx: 'family history',
  shx: 'social history',
  pe: 'physical examination',
  cns: 'central nervous system',
  cvs: 'cardiovascular system',
  rs: 'respiratory system',
  git: 'gastrointestinal tract',
  gus: 'genitourinary system',
  ob: 'obstetrics',
  gyne: 'gynecology',
  iud: 'intrauterine device',
  ocp: 'oral contraceptive pill',
  dmpa: 'depot medroxyprogesterone acetate',
  uti: 'urinary tract infection',
  uri: 'upper respiratory infection',
  preec: 'preeclampsia',
  gestdm: 'gestational diabetes mellitus',
  gdm: 'gestational diabetes mellitus',
  anemia: 'anemia',
  pid: 'pelvic inflammatory disease',
  app: 'appendicitis',
  // Filipino medical shorthand
  'na-hi': 'nahimatay (fainted)',
  hilo: 'dizziness',
  puyat: 'sleep deprivation',
  kinain: 'food intake',
  inom: 'fluid intake',
  banyo: 'urination/defecation',
  regla: 'menstruation',
  dinugo: 'bleeding',
  kabag: 'gas pain/colicky pain',
  manas: 'edema/swelling',
  sipon: 'runny nose/cold',
  ubo: 'cough',
  lagnat: 'fever',
  'sakit ng ulo': 'headache',
  'sakit ng tiyan': 'abdominal pain',
  'sakit ng likod': 'back pain',
  panghihina: 'weakness',
  pagdurugo: 'bleeding',
  pangangati: 'itching',
  pananakit: 'pain',
  pangangamba: 'anxiety/worry',
  'hirap huminga': 'difficulty breathing'
};

/* ─────────────────── Fuzzy header matching ────────────────────────── */

const HEADER_SYNONYMS = [
  {
    canonical: 'chiefComplaint',
    labels: ['chief complaint', 'complaint', 'c/c', 'cc', 'presenting problem', 'reason for visit', 'dahil ng pagdating'],
    weight: 1.0
  },
  {
    canonical: 'findings',
    labels: ['findings', 'examination', 'exam', 'physical exam', 'assessment', 'pe', 'physical findings', 'mga nakita'],
    weight: 1.0
  },
  {
    canonical: 'diagnosis',
    labels: ['diagnosis', 'diagnoses', 'impression', 'assessment', 'dx', 'working diagnosis', 'pinaniniwalaang sakit'],
    weight: 1.0
  },
  {
    canonical: 'prescription',
    labels: ['prescription', 'medications', 'medication', 'rx', 'medicines', 'medicine', 'given', 'drugs', 'gamot', 'ireseta'],
    weight: 1.0
  },
  {
    canonical: 'followUp',
    labels: ['follow up', 'follow-up', 'return', 'next visit', 'come back', 'advised to return', 'followup', 'recheck', 'balik', 'susunod na pagbisita'],
    weight: 1.0
  },
  {
    canonical: 'vitalSigns',
    labels: ['vital signs', 'vitals', 'vs', 'tpr', 'tpr bp', 'blood pressure', 'bp hr rr', 'mga vital'],
    weight: 1.0
  },
  {
    canonical: 'obstetricHistory',
    labels: ['obstetric history', 'ob history', 'ob hx', 'pregnancy history', 'pre-natal history', 'prenatal history', ' OB ', 'obstetric', 'pagbubuntis'],
    weight: 0.9
  },
  {
    canonical: 'laboratory',
    labels: ['laboratory', 'lab results', 'labs', 'diagnostic', 'imaging', 'ultrasound', 'cbc', 'urinalysis', 'x-ray', 'xr', 'mga laboratoryo'],
    weight: 0.9
  }
];

function simpleLevenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[m][n];
}

function normalizedSimilarity(a, b) {
  const dist = simpleLevenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 1 : 1 - dist / maxLen;
}

function fuzzyMatchHeader(line) {
  const clean = line.toLowerCase().replace(/[:\-]/g, ' ').replace(/\s+/g, ' ').trim();
  let best = { canonical: null, score: 0 };
  for (const group of HEADER_SYNONYMS) {
    for (const label of group.labels) {
      const sim = normalizedSimilarity(clean, label);
      const score = sim * group.weight;
      if (score > best.score) {
        best = { canonical: group.canonical, score, label };
      }
    }
  }
  return best.score >= 0.55 ? best : null;
}

/* ─────────────────── Abbreviation expansion ─────────────────────────── */

function expandAbbreviations(text) {
  let expanded = text;
  // Sort by length desc to avoid partial replacements (e.g., 'g' inside 'gp')
  const sortedAbbrs = Object.entries(ABBREVIATIONS).sort((a, b) => b[0].length - a[0].length);
  for (const [abbr, full] of sortedAbbrs) {
    // Match whole-word abbreviations, case-insensitive
    const pattern = new RegExp(`\\b${abbr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    expanded = expanded.replace(pattern, full);
  }
  return expanded;
}

/* ─────────────────── Vital signs extraction ───────────────────────── */

function extractVitalSigns(text) {
  const vitals = {};
  const lines = text.split(/\n/);

  // Patterns: value + optional unit, tolerant of spacing
  // (?<!\w) prevents matching abbreviations that are suffixes of other words.
  const bpPattern = /(?<!\w)(?:bp|blood pressure)(?!\w)[\s:]*(\d{2,3})\s*\/\s*(\d{2,3})/i;
  const hrPattern = /(?<!\w)(?:hr|heart rate|pulse)(?!\w)[\s:]*(\d{2,3})\s*(?:bpm)?/i;
  const rrPattern = /(?<!\w)(?:rr|respiratory rate|respirations)(?!\w)[\s:]*(\d{1,2})\s*(?:\/min|cpm|bpm)?/i;
  const tempPattern = /(?<!\w)(?:temp(?:erature)?|t(?!\w))[\s:]*(\d{2,3}(?:\.\d+)?)\s*['"]?(?:°?\s*[CcFf])?/i;
  const spo2Pattern = /(?<!\w)(?:spo2|o2\s*sat|oxygen saturation)(?!\w)[\s:]*(\d{2,3})\s*%?/i;
  const wtPattern = /(?<!\w)(?:wt|weight)(?!\w)[\s:]*(\d{2,3}(?:\.\d+)?)\s*(?:kg|kgs|kilos?)?/i;
  const htPattern = /(?<!\w)(?:ht|height)(?!\w)[\s:]*(\d{2,3}(?:\.\d+)?)\s*(?:cm|cms)?/i;
  const bmiPattern = /(?<!\w)(?:bmi)(?!\w)[\s:]*(\d{2,3}(?:\.\d+)?)/i;

  for (const line of lines) {
    let m;
    m = line.match(bpPattern);
    if (m) vitals.bloodPressure = { systolic: Number(m[1]), diastolic: Number(m[2]), raw: m[0] };

    m = line.match(hrPattern);
    if (m) vitals.heartRate = { value: Number(m[1]), unit: 'bpm', raw: m[0] };

    m = line.match(rrPattern);
    if (m) vitals.respiratoryRate = { value: Number(m[1]), unit: '/min', raw: m[0] };

    m = line.match(tempPattern);
    if (m) vitals.temperature = { value: Number(m[1]), unit: 'C', raw: m[0] };

    m = line.match(spo2Pattern);
    if (m) vitals.oxygenSaturation = { value: Number(m[1]), unit: '%', raw: m[0] };

    m = line.match(wtPattern);
    if (m) vitals.weight = { value: Number(m[1]), unit: 'kg', raw: m[0] };

    m = line.match(htPattern);
    if (m) vitals.height = { value: Number(m[1]), unit: 'cm', raw: m[0] };

    m = line.match(bmiPattern);
    if (m) vitals.bmi = { value: Number(m[1]), raw: m[0] };
  }

  return vitals;
}

/* ─────────────────── Pregnancy data parsing ───────────────────────────── */

function extractPregnancyData(text) {
  const pregnancy = {};
  const lines = text.split(/\n/);

  const lmpPattern = /(?:lmp|last menstrual period)[\s:]*([A-Za-z]{3,}\s+\d{1,2}[,.]?\s+\d{4}|\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i;
  const aogPattern = /(?:aog|age of gestation|gestational age)[\s:]*(\d{1,2})\s*(?:weeks?|wks?)?\s*(?:and|[,/])?\s*(?:(\d{1,2})\s*(?:days?|d)?)?/i;
  const eddPattern = /(?:edd|estimated date of delivery|due date)[\s:]*([A-Za-z]{3,}\s+\d{1,2}[,.]?\s+\d{4}|\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i;
  const gpPattern = /(?:gp|gravida[\/\s]*para)[\s:]*[g]?\s*(\d+)\s*[/\s]*\s*[p]?\s*(\d+)/i;
  const fhPattern = /(?:fh|fundal height)[\s:]*(\d{2,3})\s*(?:cm|cms)?/i;
  const fhtPattern = /(?:fht|fetal heart tone)[\s:]*(\d{2,3})\s*(?:bpm)?/i;
  const fhrPattern = /(?:fhr|fetal heart rate)[\s:]*(\d{2,3})\s*(?:bpm)?/i;
  const romPattern = /(?:rom|rupture of membranes)[\s:]*(\w.*)/i;
  const bOWPattern = /(?:bag of waters|bow)[\s:]*(intact|ruptured|clear|meconium-stained|bloody)/i;

  for (const line of lines) {
    let m;
    m = line.match(lmpPattern);
    if (m) pregnancy.lmp = m[1].trim();

    m = line.match(aogPattern);
    if (m) {
      pregnancy.aog = {
        weeks: Number(m[1]),
        days: m[2] ? Number(m[2]) : 0,
        raw: m[0]
      };
    }

    m = line.match(eddPattern);
    if (m) pregnancy.edd = m[1].trim();

    m = line.match(gpPattern);
    if (m) {
      pregnancy.gp = {
        gravida: Number(m[1]),
        para: Number(m[2]),
        raw: m[0]
      };
    }

    m = line.match(fhPattern);
    if (m) pregnancy.fundalHeight = { value: Number(m[1]), unit: 'cm', raw: m[0] };

    m = line.match(fhtPattern);
    if (m) pregnancy.fetalHeartTone = { value: Number(m[1]), unit: 'bpm', raw: m[0] };

    m = line.match(fhrPattern);
    if (m) pregnancy.fetalHeartRate = { value: Number(m[1]), unit: 'bpm', raw: m[0] };

    m = line.match(romPattern);
    if (m) pregnancy.rom = m[1].trim();

    m = line.match(bOWPattern);
    if (m) pregnancy.bagOfWaters = m[1].trim();
  }

  // Derive EDD from LMP if possible and not already present
  if (pregnancy.lmp && !pregnancy.edd) {
    try {
      const date = parseFlexibleDate(pregnancy.lmp);
      if (date) {
        const eddDate = new Date(date);
        eddDate.setDate(eddDate.getDate() + 280); // Naegele's rule
        pregnancy.edd = eddDate.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        });
      }
    } catch { /* ignore parse errors */ }
  }

  // Derive AOG if LMP available and not already present
  if (pregnancy.lmp && !pregnancy.aog) {
    try {
      const lmpDate = parseFlexibleDate(pregnancy.lmp);
      if (lmpDate) {
        const diffMs = Date.now() - lmpDate.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        pregnancy.aog = {
          weeks: Math.floor(diffDays / 7),
          days: diffDays % 7,
          derived: true
        };
      }
    } catch { /* ignore parse errors */ }
  }

  return pregnancy;
}

function parseFlexibleDate(dateStr) {
  // Try ISO-like, US, and PH common formats
  const cleaned = dateStr.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  let d = new Date(cleaned);
  if (!isNaN(d.getTime())) return d;

  // MM/DD/YYYY or DD/MM/YYYY — assume MM/DD/YYYY for PH clinics using US docs
  const parts = cleaned.split(/[\/\-.]/);
  if (parts.length === 3) {
    const m = Number(parts[0]);
    const day = Number(parts[1]);
    let y = Number(parts[2]);
    if (y < 100) y += 2000;
    d = new Date(y, m - 1, day);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

/* ─────────────────── Medication structuring ─────────────────────────── */

function structureMedications(text) {
  const meds = [];
  // Split on newlines, commas, or numbered lists
  const lines = text.split(/\n|,(?=[^0-9])|\d+[.)]\s+/);
  const medPattern = /([A-Za-z\s\-]+(?:\([^)]*\))?)\s*(\d+(?:\.\d+)?\s*(?:mg|g|mcg|ml|units?|%|tab|cap|amp|vial|bottle|sachet|pack|box)[s]?)?\s*(?:x\s*(\d+))?\s*(q\s*\d+\s*(?:h|hr|hours?)|(?:once|twice|thrice|qid|bid|tid|od|hs|prn|stat|daily|weekly|monthly)\s*(?:a|p)?\.?(?:d|day)?\.?)?/i;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length < 3) continue;

    const m = trimmed.match(medPattern);
    if (m) {
      const entry = {
        name: m[1].trim(),
        dosage: m[2] ? m[2].trim() : null,
        quantity: m[3] ? Number(m[3]) : null,
        frequency: m[4] ? m[4].trim().toLowerCase() : null,
        raw: trimmed
      };
      meds.push(entry);
    } else if (/\b(give|prescribe|take|drink|inom|gamitin|apply|lagay|itapal|ispray|inhale)\b/i.test(trimmed)) {
      // Fallback: heuristically accept lines that look like instructions
      const instructionMatch = trimmed.match(/(?:give|prescribe|take|drink|inom|gamitin|apply|lagay|itapal|ispray|inhale)[^,;.]*[\d]+[^,;.]*/i);
      if (instructionMatch) {
        meds.push({
          name: trimmed,
          dosage: null,
          quantity: null,
          frequency: null,
          raw: trimmed
        });
      }
    }
  }
  return meds;
}

/* ─────────────────── Filipino symptom detection ─────────────────────── */

const FILIPINO_SYMPTOMS = [
  { tag: 'fever', filipino: ['lagnat', 'mainit', 'init', 'nag-init'], confidence: 0.95 },
  { tag: 'headache', filipino: ['sakit ng ulo', 'masakit ang ulo', 'pananakit ng ulo', 'headache'], confidence: 0.95 },
  { tag: 'abdominal_pain', filipino: ['sakit ng tiyan', 'masakit ang tiyan', 'pananakit ng tiyan', 'kabag', 'cramps sa tiyan', 'tiyan'], confidence: 0.95 },
  { tag: 'back_pain', filipino: ['sakit ng likod', 'masakit ang likod', 'pananakit ng likod'], confidence: 0.95 },
  { tag: 'dizziness', filipino: ['hilo', 'nahihilo', 'nahihimbing', 'umiikot'], confidence: 0.9 },
  { tag: 'nausea', filipino: ['nausea', 'nasusuka', 'susuka', 'lulunok', 'sumasakit ang sikmura'], confidence: 0.9 },
  { tag: 'vomiting', filipino: ['nagsusuka', 'sumuka', 'pagsusuka', 'nagsuka'], confidence: 0.95 },
  { tag: 'cough', filipino: ['ubo', 'umuubo', 'pag-ubo', 'tuyong ubo', 'ubong may plema'], confidence: 0.95 },
  { tag: 'cold', filipino: ['sipon', 'sinisipon', 'baradong ilong', 'runny nose'], confidence: 0.9 },
  { tag: 'weakness', filipino: ['panghihina', 'hina', 'mahina', 'pagkahapo', 'pagod'], confidence: 0.9 },
  { tag: 'bleeding', filipino: ['pagdurugo', 'dugo', 'dinugo', 'nagdugo', 'spotting'], confidence: 0.95 },
  { tag: 'swelling', filipino: ['manas', 'namamaga', 'pamamaga', 'magang paa', 'magang kamay'], confidence: 0.9 },
  { tag: 'itching', filipino: ['pangangati', 'kati', 'makati', 'namumula at makati'], confidence: 0.9 },
  { tag: 'difficulty_breathing', filipino: ['hirap huminga', 'kahirapan sa paghinga', 'nasasakal', 'masikip ang dibdib'], confidence: 0.95 },
  { tag: 'fainting', filipino: ['na-hi', 'nahimatay', 'nahilo at bumagsak', 'nawalan ng malay'], confidence: 0.95 },
  { tag: 'sleep_deprivation', filipino: ['puyat', 'kulang sa tulog', 'hindi makatulog', 'insomnia'], confidence: 0.85 },
  { tag: 'heartburn', filipino: ['sumasakit ang sikmura', 'acid', 'heartburn', 'masakit ang sikmura'], confidence: 0.85 },
  { tag: 'constipation', filipino: ['hirap sa pagdumi', 'constipated', 'hindi makadumi', 'matigas ang dumi'], confidence: 0.9 },
  { tag: 'diarrhea', filipino: ['pagtatae', 'tumatae', 'madalas dumumi', 'loose stools'], confidence: 0.9 },
  { tag: 'urinary_pain', filipino: ['masakit ang ihi', 'sakit sa pagihi', 'burning sa ihi', 'frequent urination'], confidence: 0.9 },
  { tag: 'leg_cramps', filipino: ['pantal', 'cramps sa binti', 'pagkakatig sa binti'], confidence: 0.85 },
  { tag: 'vaginal_discharge', filipino: ['nakakaduming pagdurugo', 'vaginal discharge', 'malagkit na discharge', 'amoy na discharge'], confidence: 0.85 },
  { tag: 'contractions', filipino: ['pangingitim', 'contractions', 'pananakit ng tiyan na parang regla', 'regular na pananakit'], confidence: 0.95 }
];

function detectFilipinoSymptoms(text) {
  const detected = [];
  const lower = text.toLowerCase();
  for (const symptom of FILIPINO_SYMPTOMS) {
    for (const phrase of symptom.filipino) {
      if (lower.includes(phrase.toLowerCase())) {
        detected.push({
          tag: symptom.tag,
          phrase,
          confidence: symptom.confidence
        });
        break; // one match per symptom tag
      }
    }
  }
  return detected;
}

/* ─────────────────── Confidence scoring ───────────────────────────────── */

function scoreConfidence(parsed, rawText) {
  const scores = {};
  const textLen = rawText.length;

  // Chief complaint confidence
  if (parsed.chiefComplaint && parsed.chiefComplaint.length > 3) {
    scores.chiefComplaint = Math.min(1.0, 0.6 + (parsed.chiefComplaint.length / textLen) * 2);
  } else {
    scores.chiefComplaint = parsed.chiefComplaint ? 0.4 : 0.0;
  }

  // Findings confidence
  if (parsed.findings && parsed.findings.length > 10) {
    scores.findings = Math.min(1.0, 0.6 + (parsed.findings.length / textLen));
  } else {
    scores.findings = parsed.findings ? 0.4 : 0.0;
  }

  // Diagnosis confidence
  if (parsed.diagnosis && parsed.diagnosis.length > 2) {
    scores.diagnosis = Math.min(1.0, 0.7 + (parsed.diagnosis.length / textLen));
  } else {
    scores.diagnosis = parsed.diagnosis ? 0.4 : 0.0;
  }

  // Prescription confidence
  if (parsed.prescription && parsed.prescription.length > 5) {
    const medCount = parsed.medications ? parsed.medications.length : 0;
    scores.prescription = Math.min(1.0, 0.5 + medCount * 0.15);
  } else {
    scores.prescription = parsed.prescription ? 0.3 : 0.0;
  }

  // Follow-up confidence
  if (parsed.followUp && parsed.followUp.length > 3) {
    scores.followUp = 0.85;
  } else {
    scores.followUp = parsed.followUp ? 0.5 : 0.0;
  }

  // Vitals confidence
  const vitalKeys = Object.keys(parsed.vitalSigns || {});
  scores.vitalSigns = vitalKeys.length > 0 ? Math.min(1.0, 0.5 + vitalKeys.length * 0.12) : 0.0;

  // Pregnancy data confidence
  const pregKeys = Object.keys(parsed.pregnancyData || {});
  scores.pregnancyData = pregKeys.length > 0 ? Math.min(1.0, 0.5 + pregKeys.length * 0.1) : 0.0;

  // Filipino symptoms confidence
  const symCount = (parsed.filipinoSymptoms || []).length;
  scores.filipinoSymptoms = symCount > 0 ? Math.min(1.0, 0.5 + symCount * 0.1) : 0.0;

  // Overall average
  const values = Object.values(scores);
  scores.overall = values.length > 0
    ? values.reduce((a, b) => a + b, 0) / values.length
    : 0;

  return scores;
}

/* ─────────────────── Main parse function ────────────────────────────── */

function parseMedicalNote(rawNote) {
  const text = String(rawNote || '');

  // 1. Expand abbreviations for downstream extraction
  const expandedText = expandAbbreviations(text);

  // 2. Build section map using fuzzy header matching
  const lines = expandedText.split(/\n/);
  const sections = {};
  let currentHeader = null;

  for (const line of lines) {
    const match = fuzzyMatchHeader(line);
    if (match) {
      currentHeader = match.canonical;
      sections[currentHeader] = '';
    } else if (currentHeader) {
      sections[currentHeader] += (sections[currentHeader] ? '\n' : '') + line;
    }
  }

  // 3. Extract standard fields (fallback to regex if fuzzy section missing)
  const chiefComplaint =
    sections.chiefComplaint?.trim() ||
    text.match(/Chief\s*Complaint[s]?[:\s]+(.+?)(?:\n|\.|$)/i)?.[1]?.trim() ||
    text.match(/c\/o[:\s]+(.+?)(?:\n|\.|$)/i)?.[1]?.trim() ||
    '';

  const findings =
    sections.findings?.trim() ||
    text.match(/Findings?[:\s]+(.+?)(?:\n\n|\n[A-Z]|Diagnosis|Impression|Rx|Prescription|Follow[-\s]?up|$)/is)?.[1]?.trim() ||
    '';

  const diagnosis =
    sections.diagnosis?.trim() ||
    text.match(/Diagnosis[:\s]+(.+?)(?:\n|\.|$)/i)?.[1]?.trim() ||
    text.match(/Impression[:\s]+(.+?)(?:\n|\.|$)/i)?.[1]?.trim() ||
    '';

  const prescription =
    sections.prescription?.trim() ||
    text.match(/Prescription[:\s]+(.+?)(?:\n\n|\n[A-Z]|Follow[-\s]?up|Advice|Recommendation|$)/is)?.[1]?.trim() ||
    text.match(/Rx[:\s]+(.+?)(?:\n\n|\n[A-Z]|Follow[-\s]?up|Advice|Recommendation|$)/is)?.[1]?.trim() ||
    '';

  const followUp =
    sections.followUp?.trim() ||
    text.match(/Follow[-\s]?up[:\s]+(.+?)(?:\n|\.|$)/i)?.[1]?.trim() ||
    text.match(/Return[:\s]+(.+?)(?:\n|\.|$)/i)?.[1]?.trim() ||
    '';

  // 4. Extract vitals
  const vitalSigns = extractVitalSigns(expandedText);

  // 5. Extract pregnancy data
  const pregnancyData = extractPregnancyData(expandedText);

  // 6. Structure medications
  const medications = structureMedications(prescription);

  // 7. Detect Filipino symptoms
  const filipinoSymptoms = detectFilipinoSymptoms(text);

  const parsed = {
    chiefComplaint,
    findings,
    diagnosis,
    prescription,
    followUp,
    vitalSigns,
    pregnancyData,
    medications,
    filipinoSymptoms
  };

  // 8. Compute confidence scores
  parsed.confidence = scoreConfidence(parsed, text);

  return parsed;
}

module.exports = {
  parseMedicalNote,
  expandAbbreviations,
  extractVitalSigns,
  extractPregnancyData,
  structureMedications,
  detectFilipinoSymptoms,
  scoreConfidence,
  fuzzyMatchHeader,
  ABBREVIATIONS,
  FILIPINO_SYMPTOMS
};
