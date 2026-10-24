const crypto = require('crypto');

const originalKey = process.env.APP_ENCRYPTION_KEY;
let encryption;

beforeEach(() => {
  jest.resetModules();
  process.env.APP_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
  encryption = require('../utils/encryption');
});

afterEach(() => {
  if (originalKey === undefined) delete process.env.APP_ENCRYPTION_KEY;
  else process.env.APP_ENCRYPTION_KEY = originalKey;
  jest.resetModules();
});

test.each([
  null,
  undefined,
  '',
  'Long legacy address with spaces and punctuation, Philippines 4700',
  JSON.stringify({ history: 'Legacy medical history recorded before encryption was enabled' }),
  { history: 'Legacy JSON object' }
])('preserves legacy value %#', (value) => {
  expect(encryption.decryptField(value)).toEqual(value);
  expect(encryption.decryptDeterministic(value)).toEqual(value);
});

test('reads the existing encrypted format for both encryption modes', () => {
  const value = 'Medical history';
  expect(encryption.decryptField(encryption.encryptField(value))).toBe(value);
  expect(encryption.decryptDeterministic(encryption.encryptDeterministic(value))).toBe(value.toLowerCase());
});

test('rejects authenticated payload tampering', () => {
  const payload = Buffer.from(encryption.encryptField('Medical history'), 'base64');
  payload[16] ^= 1;
  expect(() => encryption.decryptField(payload.toString('base64'))).toThrow();
});

test('rejects an encrypted payload with the wrong key', () => {
  const payload = encryption.encryptField('Medical history');
  jest.resetModules();
  process.env.APP_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
  const other = require('../utils/encryption');
  expect(() => other.decryptField(payload)).toThrow();
  expect(() => other.decryptDeterministic(payload)).toThrow();
});
