const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret';

jest.mock('../models/User');
const User = require('../models/User');
const moduleAccess = require('../middleware/moduleAccess');

const run = async (method, path, mods) => {
  moduleAccess.clearCache();
  User.findById.mockResolvedValue({ id: 9, allowed_modules: mods });
  const req = { method, path, headers: { authorization: `Bearer ${jwt.sign({ id: 9 }, 'test-secret')}` }, cookies: {} };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();
  await moduleAccess(req, res, next);
  return { res, next };
};

describe('module access guard', () => {
  test('no restrictions lets everything through', async () => {
    expect((await run('POST', '/admissions', null)).next).toHaveBeenCalled();
  });
  test('hidden module is blocked for reads and writes', async () => {
    expect((await run('GET', '/admissions/1', { transactions: 'edit' })).res.status).toHaveBeenCalledWith(403);
    expect((await run('POST', '/admissions', { transactions: 'edit' })).res.status).toHaveBeenCalledWith(403);
  });
  test('read-only allows GET but blocks writes', async () => {
    expect((await run('GET', '/consultation-transactions', { transactions: 'view' })).next).toHaveBeenCalled();
    const blocked = await run('POST', '/consultation-transactions', { transactions: 'view' });
    expect(blocked.res.status).toHaveBeenCalledWith(403);
    expect(blocked.next).not.toHaveBeenCalled();
  });
  test('editable allows writes', async () => {
    expect((await run('DELETE', '/consultation-transactions/4', { transactions: 'edit' })).next).toHaveBeenCalled();
  });
  test('patient and clinic option reads stay open for other modules, writes do not', async () => {
    expect((await run('GET', '/patients', { transactions: 'edit' })).next).toHaveBeenCalled();
    expect((await run('GET', '/clinic/options', { transactions: 'edit' })).next).toHaveBeenCalled();
    expect((await run('PUT', '/clinic/options/1', { transactions: 'edit' })).res.status).toHaveBeenCalledWith(403);
  });
  test('unmapped paths are untouched', async () => {
    expect((await run('GET', '/health', { transactions: 'view' })).next).toHaveBeenCalled();
  });
});
