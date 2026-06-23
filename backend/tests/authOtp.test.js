// Tests for the OTP flows: forgot-password, reset-password, verify-email.
jest.mock('../models/User');
jest.mock('../utils/mailer', () => ({
  sendMail: jest.fn().mockResolvedValue(true),
  isConfigured: jest.fn().mockReturnValue(true)
}));

process.env.JWT_SECRET = 'test-secret';

const User = require('../models/User');
const { sendMail } = require('../utils/mailer');
const { hashOtp } = require('../utils/otp');
const { forgotPassword, resetPassword, verifyEmail } = require('../controllers/authController');

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    cookie() { return this; },
    clearCookie() { return this; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; }
  };
}

const STRONG_PW = 'Secret1!';

beforeEach(() => {
  jest.clearAllMocks();
  User.setOtp = jest.fn().mockResolvedValue();
  User.clearOtp = jest.fn().mockResolvedValue();
  User.markEmailVerified = jest.fn().mockResolvedValue();
  User.setPassword = jest.fn().mockResolvedValue(true);
  User.incrementOtpAttempts = jest.fn().mockResolvedValue(1);
});

describe('forgotPassword', () => {
  test('400 on invalid email', async () => {
    const res = mockRes();
    await forgotPassword({ body: { email: 'not-an-email' } }, res, jest.fn());
    expect(res.statusCode).toBe(400);
  });

  test('returns generic success and sends OTP when the user exists', async () => {
    User.findByEmail.mockResolvedValue({ id: 1, name: 'A', email: 'a@b.com' });
    const res = mockRes();
    await forgotPassword({ body: { email: 'a@b.com' } }, res, jest.fn());
    expect(res.statusCode).toBe(200);
    expect(User.setOtp).toHaveBeenCalled();
    expect(sendMail).toHaveBeenCalled();
  });

  test('returns the same generic success when the user does NOT exist (no enumeration)', async () => {
    User.findByEmail.mockResolvedValue(undefined);
    const res = mockRes();
    await forgotPassword({ body: { email: 'missing@b.com' } }, res, jest.fn());
    expect(res.statusCode).toBe(200);
    expect(User.setOtp).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });
});

describe('resetPassword', () => {
  test('rejects a weak new password', async () => {
    const res = mockRes();
    await resetPassword(
      { body: { email: 'a@b.com', otp: '123456', newPassword: 'weak' } },
      res,
      jest.fn()
    );
    expect(res.statusCode).toBe(400);
  });

  test('sets a new password when the OTP is valid', async () => {
    const hash = await hashOtp('123456');
    User.findByEmail.mockResolvedValue({
      id: 1,
      email: 'a@b.com',
      otp_code_hash: hash,
      otp_purpose: 'password_reset',
      otp_expires_at: new Date(Date.now() + 5 * 60 * 1000),
      otp_attempts: 0
    });
    const res = mockRes();
    await resetPassword(
      { body: { email: 'a@b.com', otp: '123456', newPassword: STRONG_PW } },
      res,
      jest.fn()
    );
    expect(res.statusCode).toBe(200);
    expect(User.setPassword).toHaveBeenCalledWith(1, STRONG_PW);
  });

  test('rejects an expired OTP', async () => {
    const hash = await hashOtp('123456');
    User.findByEmail.mockResolvedValue({
      id: 1,
      email: 'a@b.com',
      otp_code_hash: hash,
      otp_purpose: 'password_reset',
      otp_expires_at: new Date(Date.now() - 1000),
      otp_attempts: 0
    });
    const res = mockRes();
    await resetPassword(
      { body: { email: 'a@b.com', otp: '123456', newPassword: STRONG_PW } },
      res,
      jest.fn()
    );
    expect(res.statusCode).toBe(400);
    expect(User.setPassword).not.toHaveBeenCalled();
  });

  test('rejects a wrong OTP and increments attempts', async () => {
    const hash = await hashOtp('123456');
    User.findByEmail.mockResolvedValue({
      id: 1,
      email: 'a@b.com',
      otp_code_hash: hash,
      otp_purpose: 'password_reset',
      otp_expires_at: new Date(Date.now() + 5 * 60 * 1000),
      otp_attempts: 0
    });
    const res = mockRes();
    await resetPassword(
      { body: { email: 'a@b.com', otp: '000000', newPassword: STRONG_PW } },
      res,
      jest.fn()
    );
    expect(res.statusCode).toBe(400);
    expect(User.incrementOtpAttempts).toHaveBeenCalledWith(1);
    expect(User.setPassword).not.toHaveBeenCalled();
  });
});

describe('verifyEmail', () => {
  test('verifies the account when the OTP is valid', async () => {
    const hash = await hashOtp('654321');
    User.findByEmail.mockResolvedValue({
      id: 5,
      email: 'v@b.com',
      email_verified: 0,
      otp_code_hash: hash,
      otp_purpose: 'email_verify',
      otp_expires_at: new Date(Date.now() + 5 * 60 * 1000),
      otp_attempts: 0
    });
    const res = mockRes();
    await verifyEmail({ body: { email: 'v@b.com', otp: '654321' } }, res, jest.fn());
    expect(res.statusCode).toBe(200);
    expect(User.markEmailVerified).toHaveBeenCalledWith(5);
  });

  test('is idempotent for an already-verified account', async () => {
    User.findByEmail.mockResolvedValue({ id: 5, email: 'v@b.com', email_verified: 1 });
    const res = mockRes();
    await verifyEmail({ body: { email: 'v@b.com', otp: '654321' } }, res, jest.fn());
    expect(res.statusCode).toBe(200);
    expect(User.markEmailVerified).not.toHaveBeenCalled();
  });
});
