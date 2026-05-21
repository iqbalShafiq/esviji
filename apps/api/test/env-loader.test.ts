import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { loadEnvFile } from '../src/config/loadEnv.js';

test('loadEnvFile populates DATABASE_URL when missing', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'svg-env-loader-'));
  const envPath = path.join(dir, '.env');

  try {
    await writeFile(envPath, 'DATABASE_URL=postgresql://example\n', 'utf-8');

    const previous = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;

    loadEnvFile(envPath);

    assert.equal(process.env.DATABASE_URL, 'postgresql://example');

    if (previous === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previous;
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
