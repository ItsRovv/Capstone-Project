// Regression tests for admin-gated registration.
// The frontend stores the JWT in an httpOnly cookie (not readable by JS), so an
// admin creating a user sends the token as a COOKIE, not an Authorization header.
// These tests lock in that the controller accepts either.
jest.mock('../models/User');
jest.mock('../utils/mailer', () => ({
  sendMail: jest.fn().mockResolvedValue(true),
  isConfigured: jest.fn().mockReturnValue(true)
}));

process.env.JWT_SECRET = 'test-secret';

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { register } = require('../controllers/authController');

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
const adminToken = jwt.sign({ id: 1, role: 'admin', email: 'admin@c.local' }, process.env.JWT_SECRET);
const staffToken = jwt.sign({ id: 2, role: 'staff', email: 'staff@c.local' }, process.env.JWT_SECRET);

beforeEach(() => {
  jest.clearAllMocks();
  User.count.mockResolvedValue(1); // users already exist → admin gate applies
  User.findByEmail.mockResolvedValue(undefined);
  User.create.mockResolvedValue(7);
  User.findById.mockResolvedValue({ id: 7, name: 'New', email: 'new@c.local', role: 'staff' });
});

test('403 when no admin token is provided', async () => {
  const res = mockRes();
  await register(
    { headers: {}, cookies: {}, body: { name: 'New', email: 'new@c.local', password: STRONG_PW } },
    res,
    jest.fn()
  );
  expect(res.statusCode).toBe(403);
});

test('403 when the caller is authenticated but not an admin', async () => {
  const res = mockRes();
  await register(
    {
      headers: {},
      cookies: { lc_auth: staffToken },
      body: { name: 'New', email: 'new@c.local', password: STRONG_PW }
    },
    res,
    jest.fn()
  );
  expect(res.statusCode).toBe(403);
});

test('admin token in the httpOnly COOKIE allows creating a user (the bug fix)', async () => {
  const res = mockRes();
  await register(
    {
      headers: {},
      cookies: { lc_auth: adminToken },
      body: { name: 'New', email: 'new@c.local', password: STRONG_PW, role: 'staff' }
    },
    res,
    jest.fn()
  );
  expect(res.statusCode).toBe(201);
  expect(User.create).toHaveBeenCalled();
  expect(res.body.user).toMatchObject({ email: 'new@c.local', role: 'staff' });
});

test('admin token in the Authorization header still works (API clients)', async () => {
  const res = mockRes();
  await register(
    {
      headers: { authorization: `Bearer ${adminToken}` },
      cookies: {},
      body: { name: 'New', email: 'new@c.local', password: STRONG_PW, role: 'doctor' }
    },
    res,
    jest.fn()
  );
  expect(res.statusCode).toBe(201);
});
