import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'fs/promises';
import { calculateBuildGraphRecursionLimit } from '../src/orchestrators/SvgBuildOrchestrator.js';

test('SvgBuildOrchestrator LangGraph node names do not reuse state channel names', async () => {
  const source = await readFile(new URL('../src/orchestrators/SvgBuildOrchestrator.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /\.addNode\('layout'/);
  assert.doesNotMatch(source, /\.addEdge\('style', 'layout'\)/);
  assert.doesNotMatch(source, /\.addEdge\('layout', 'generate_svg'\)/);
});

test('SvgBuildOrchestrator LangGraph recursion limit scales with max iterations', () => {
  assert.equal(calculateBuildGraphRecursionLimit(1), 13);
  assert.equal(calculateBuildGraphRecursionLimit(6), 33);
  assert.equal(calculateBuildGraphRecursionLimit(15), 69);
});

test('SvgBuildOrchestrator manual refine accepts streaming pipeline callbacks', async () => {
  const source = await readFile(new URL('../src/orchestrators/SvgBuildOrchestrator.ts', import.meta.url), 'utf8');

  assert.match(source, /type SvgPipelineCallbacks = \{/);
  assert.match(source, /async iterate\(\s*request: IterateSvgAssetRequest,\s*options\?: SvgIterateOptions/);
  assert.match(source, /onStage\?: \(stage: PipelineStage, message: string, progress: number\) => void/);
  assert.match(source, /onIterationRendered\?: \(iteration: number, previewUrl: string\) => void/);
  assert.match(source, /onToolEvent\?: \(/);
});

test('SvgBuildOrchestrator manual refine builds previous final context from persisted iteration data', async () => {
  const source = await readFile(new URL('../src/orchestrators/SvgBuildOrchestrator.ts', import.meta.url), 'utf8');

  assert.match(source, /buildManualRefineInstruction/);
  assert.match(source, /previousSvg/);
  assert.match(source, /previousPngPreviewPath/);
  assert.match(source, /previousScores/);
  assert.match(source, /previousIssues/);
  assert.match(source, /previousActionTaken/);
  assert.match(source, /finalScores/);
});

test('SvgBuildOrchestrator manual refine graph runs one generate/render/evaluate/export pass', async () => {
  const source = await readFile(new URL('../src/orchestrators/SvgBuildOrchestrator.ts', import.meta.url), 'utf8');

  assert.match(source, /private async runManualRefineGraph/);
  assert.match(source, /runName: 'svg_asset_refine_pipeline'/);
  assert.match(source, /\.addEdge\(START, 'generate_svg'\)/);
  assert.match(source, /\.addEdge\('generate_svg', 'render_preview'\)/);
  assert.match(source, /\.addEdge\('render_preview', 'evaluate'\)/);
  assert.match(source, /\.addEdge\('evaluate', 'optimize_export'\)/);
  assert.doesNotMatch(source, /svg_asset_refine_pipeline[\s\S]*\.addEdge\('evaluate', 'revise'\)/);
});

test('SvgAssetsController iterate creates a streamed background job like build', async () => {
  const source = await readFile(new URL('../src/controllers/svgAssets.controller.ts', import.meta.url), 'utf8');

  assert.match(source, /const jobId = generateId\('job'\)/);
  assert.match(source, /await this\.jobService\.create\(\{ jobId, assetId: parseResult\.data\.assetId \}\)/);
  assert.match(source, /void \(async \(\) => \{/);
  assert.match(source, /await this\.jobService\.start\(jobId\)/);
  assert.match(source, /await this\.orchestrator\.iterate\(parseResult\.data, \{/);
  assert.match(source, /onIterationRendered: \(iteration, previewUrl\) => void this\.jobService\.setLatestPreview\(jobId, previewUrl, iteration\)/);
  assert.match(source, /reply\.status\(202\)\.send\(\{ success: true, data: \{ jobId: job\.jobId, status: job\.status, progress: job\.progress \} \}\)/);
});
