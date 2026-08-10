import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';

test('GET /api/ping returns pong', async () => {
  const response = await request(app).get('/api/ping');

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.message, 'pong');
});

test('POST /api/auth/signup rejects missing fields', async () => {
  const response = await request(app).post('/api/auth/signup').send({});

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.success, false);
  assert.equal(response.body.message, 'Validation failed');
});