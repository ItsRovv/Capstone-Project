const { routeError } = require('../utils/routeError');

function mockRes() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; }
  };
}

const ORIG_ENV = process.env.NODE_ENV;

afterAll(() => {
  process.env.NODE_ENV = ORIG_ENV;
});

beforeEach(() => {
  delete process.env.NODE_ENV;
});

test('returns the real error message in development', () => {
  const res = mockRes();
  routeError(res, new Error('DB went away'), 500);
  expect(res.statusCode).toBe(500);
  expect(res.body.message).toBe('DB went away');
});

test('returns a generic message in production', () => {
  process.env.NODE_ENV = 'production';
  const res = mockRes();
  routeError(res, new Error('DB went away'), 500);
  expect(res.body.message).toBe('An internal server error occurred.');
});

test('accepts a custom status code', () => {
  const res = mockRes();
  routeError(res, new Error('nope'), 502);
  expect(res.statusCode).toBe(502);
});
