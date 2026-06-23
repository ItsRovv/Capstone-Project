// Mock the User model so these tests never touch a real database.
jest.mock('../models/User');

const User = require('../models/User');
const { login, register } = require('../controllers/authController');

process.env.JWT_SECRET = 'test-secret';

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    // cookie() is called by setAuthCookie in the auth controller
    cookie() { return this; },
    clearCookie() { return this; },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  // Stub new lockout / timing-safe helpers so they never hit a real DB
  User.dummyCompare = jest.fn().mockResolvedValue();
  User.incrementFailedLogin = jest.fn().mockResolvedValue();
  User.resetFailedLogin = jest.fn().mockResolvedValue();
});

describe('login', () => {
  test('400 when email or password missing', async () => {
    const res = mockRes();
    await login({ body: { email: '' } }, res, jest.fn());
    expect(res.statusCode).toBe(400);
  });

  test('401 when user not found', async () => {
    User.findByEmail.mockResolvedValue(undefined);
    const res = mockRes();
    await login({ body: { email: 'x@y.com', password: 'secret' } }, res, jest.fn());
    expect(res.statusCode).toBe(401);
  });

  test('returns token on valid credentials', async () => {
    User.findByEmail.mockResolvedValue({
      id: 1,
      name: 'Admin',
      email: 'a@b.com',
      role: 'admin',
      password_hash: 'hash',
      locked_until: null,
      email_verified: 1
    });
    User.comparePassword.mockResolvedValue(true);
    User.resetFailedLogin = jest.fn().mockResolvedValue();
    const res = mockRes();
    await login({ body: { email: 'a@b.com', password: 'secret' } }, res, jest.fn());
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toMatchObject({ email: 'a@b.com', role: 'admin' });
    expect(res.body.user).not.toHaveProperty('password_hash');
  });

  test('403 EMAIL_NOT_VERIFIED when the account is unverified', async () => {
    User.findByEmail.mockResolvedValue({
      id: 2,
      name: 'New',
      email: 'new@b.com',
      role: 'staff',
      password_hash: 'hash',
      locked_until: null,
      email_verified: 0
    });
    User.comparePassword.mockResolvedValue(true);
    const res = mockRes();
    await login({ body: { email: 'new@b.com', password: 'secret' } }, res, jest.fn());
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
  });
});

describe('register', () => {
  test('400 when fields missing', async () => {
    const res = mockRes();
    await register({ body: { email: 'a@b.com' } }, res, jest.fn());
    expect(res.statusCode).toBe(400);
  });

  test('400 when password does not meet complexity policy', async () => {
    const res = mockRes();
    // 'weak1' is too short and lacks uppercase / special char
    await register(
      { body: { name: 'A', email: 'a@b.com', password: 'weak1' } },
      res,
      jest.fn()
    );
    expect(res.statusCode).toBe(400);
  });

  // Use a password that satisfies the policy: 8+ chars, upper, lower, digit, special
  const STRONG_PW = 'Secret1!';

  test('409 when email already registered', async () => {
    User.findByEmail.mockResolvedValue({ id: 1 });
    User.count.mockResolvedValue(0); // First user path — no admin check required
    const res = mockRes();
    await register(
      { body: { name: 'A', email: 'a@b.com', password: STRONG_PW } },
      res,
      jest.fn()
    );
    expect(res.statusCode).toBe(409);
  });

  test('first user becomes admin and gets a token', async () => {
    User.findByEmail.mockResolvedValue(undefined);
    User.count.mockResolvedValue(0);
    User.create.mockResolvedValue(1);
    User.findById.mockResolvedValue({
      id: 1,
      name: 'A',
      email: 'a@b.com',
      role: 'admin'
    });
    const res = mockRes();
    await register(
      { body: { name: 'A', email: 'a@b.com', password: STRONG_PW } },
      res,
      jest.fn()
    );
    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user.role).toBe('admin');
  });
});
