const request = require('supertest');

// JWT secret is required by the auth controller at import time.
process.env.JWT_SECRET = 'test-secret';

const app = require('../server');

describe('health & misc endpoints', () => {
  test('GET /health returns ok with uptime', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', service: 'lying-in-clinic-api' });
    expect(typeof res.body.uptime).toBe('number');
  });

  test('GET / returns service info', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  test('GET /health/ready returns 503 when the DB is unavailable (test env)', async () => {
    // In the test environment the DB pool is intentionally disabled, so the
    // readiness probe must report "not ready" rather than falsely pass.
    const res = await request(app).get('/health/ready');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('not_ready');
  });

  test('unknown /api route returns 404 JSON', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Endpoint not found');
  });
});
