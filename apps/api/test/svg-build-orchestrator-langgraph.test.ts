import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'fs/promises';

test('SvgBuildOrchestrator LangGraph node names do not reuse state channel names', async () => {
  const source = await readFile(new URL('../src/orchestrators/SvgBuildOrchestrator.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /\.addNode\('layout'/);
  assert.doesNotMatch(source, /\.addEdge\('style', 'layout'\)/);
  assert.doesNotMatch(source, /\.addEdge\('layout', 'generate_svg'\)/);
});
