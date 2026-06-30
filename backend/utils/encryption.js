const crypto = require('crypto');

const ALG = 'aes-256-gcm';
const IV_LEN = 16;
const TAG_LEN = 16;
const KEY_LEN = 32;

function getKey() {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('APP_ENCRYPTION_KEY is required in production');
    }
    console.warn('[encryption] APP_ENCRYPTION_KEY not set — passing through plaintext in dev');
    return null;
  }
  // Accept base64-encoded 32-byte key, or raw hex string
  let key;
  try {
    key = Buffer.from(raw, 'base64');
  } catch {
    key = Buffer.from(raw, 'hex');
  }
  if (key.length !== KEY_LEN) {
    throw new Error(`APP_ENCRYPTION_KEY must decode to ${KEY_LEN} bytes (got ${key.length})`);
  }
  return key;
}

const KEY = getKey();

function encryptField(plaintext) {
  if (!KEY) return plaintext; // dev fallback
  if (plaintext === null || plaintext === undefined) return plaintext;
  const text = String(plaintext);
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALG, KEY, iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, tag, enc]);
  return payload.toString('base64');
}

function decryptField(ciphertext) {
  if (!KEY) return ciphertext; // dev fallback
  if (ciphertext === null || ciphertext === undefined) return ciphertext;
  const buf = Buffer.from(String(ciphertext), 'base64');
  if (buf.length < IV_LEN + TAG_LEN) return ciphertext; // likely plaintext legacy
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const enc = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALG, KEY, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString('utf8');
}

/**
 * Deterministic encryption for fields that need exact-match lookup.
 * Uses a fixed IV derived from the plaintext so the same input always
 * produces the same ciphertext. DO NOT use this for high-cardinality fields
 * that might be brute-forced (e.g., names); use only for phone numbers, emails, etc.
 */
function encryptDeterministic(plaintext) {
  if (!KEY) return plaintext;
  if (plaintext === null || plaintext === undefined) return plaintext;
  const text = String(plaintext).toLowerCase().trim();
  // Derive a deterministic IV from the plaintext using HMAC
  const iv = crypto.createHmac('sha256', KEY).update(text).digest().subarray(0, IV_LEN);
  const cipher = crypto.createCipheriv(ALG, KEY, iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, tag, enc]);
  return payload.toString('base64');
}

function decryptDeterministic(ciphertext) {
  if (!KEY) return ciphertext;
  if (ciphertext === null || ciphertext === undefined) return ciphertext;
  const buf = Buffer.from(String(ciphertext), 'base64');
  if (buf.length < IV_LEN + TAG_LEN) return ciphertext;
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const enc = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALG, KEY, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString('utf8');
}

/**
 * Encrypt an object's fields in-place. Pass an array of field names.
 */
function encryptObject(obj, fields, { deterministic = [] } = {}) {
  if (!obj) return obj;
  const result = { ...obj };
  for (const field of fields) {
    if (result[field] !== undefined) {
      result[field] = deterministic.includes(field)
        ? encryptDeterministic(result[field])
        : encryptField(result[field]);
    }
  }
  return result;
}

/**
 * Decrypt an object's fields in-place.
 */
function decryptObject(obj, fields, { deterministic = [] } = {}) {
  if (!obj) return obj;
  const result = { ...obj };
  for (const field of fields) {
    if (result[field] !== undefined) {
      result[field] = deterministic.includes(field)
        ? decryptDeterministic(result[field])
        : decryptField(result[field]);
    }
  }
  return result;
}

module.exports = {
  encryptField,
  decryptField,
  encryptDeterministic,
  decryptDeterministic,
  encryptObject,
  decryptObject
};
