// mailer is side-effect free — no need for heavy mocking.
const { sendMail, isConfigured } = require('../utils/mailer');

const ORIG = { host: process.env.SMTP_HOST, user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD };

beforeEach(() => {
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASSWORD;
});

afterAll(() => {
  Object.assign(process.env, ORIG);
});

describe('isConfigured', () => {
  test('false when SMTP is not configured', () => {
    expect(isConfigured()).toBe(false);
  });

  test('true when host, user, and password are set', () => {
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_USER = 'user';
    process.env.SMTP_PASSWORD = 'pass';
    expect(isConfigured()).toBe(true);
  });
});

describe('sendMail', () => {
  test('returns false when SMTP is not configured', async () => {
    const result = await sendMail({ to: 'x@y.com', subject: 'hi', text: 'hello' });
    expect(result).toBe(false);
  });
});
