import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';

test('GET /api/jobs/:jobId returns 404 for unknown job', async () => {
  const app = await buildApp();
  const response = await app.inject({ method: 'GET', url: '/api/jobs/job_missing' });
  assert.equal(response.statusCode, 404);
  await app.close();
});

test('GET /api/jobs/:jobId/stream returns SSE error for unknown job', async () => {
  const app = await buildApp();
  const response = await app.inject({ method: 'GET', url: '/api/jobs/job_missing/stream' });
  assert.equal(response.statusCode, 200);
  assert.match(response.headers['content-type'] || '', /text\/event-stream/);
  assert.match(response.body, /event: error/);
  await app.close();
});
