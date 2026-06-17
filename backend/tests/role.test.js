const requireRole = require('../middleware/role');

function mockRes() {
  return {
    statusCode: null,
    body: null,
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

describe('requireRole', () => {
  test('401 when no user on request', () => {
    const res = mockRes();
    const next = jest.fn();
    requireRole('admin')({}, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('403 when user role is not allowed', () => {
    const res = mockRes();
    const next = jest.fn();
    requireRole('admin')({ user: { role: 'staff' } }, res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('calls next() when role is allowed', () => {
    const res = mockRes();
    const next = jest.fn();
    requireRole('admin', 'doctor')({ user: { role: 'doctor' } }, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBeNull();
  });
});
