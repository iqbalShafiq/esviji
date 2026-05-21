import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'fs/promises';
import { LlmProvider } from '../../../packages/ai-core/src/index.js';
import { RevisionPlannerService } from '../src/services/RevisionPlannerService.js';
import type { GenerateTextOptions } from '../../../packages/ai-core/src/providers/LlmProvider.js';

class CapturingProvider extends LlmProvider {
  options?: GenerateTextOptions;

  async generateText(
    _systemPrompt: string,
    _userPrompt: string,
    options?: GenerateTextOptions
  ): Promise<string> {
    this.options = options;
    return JSON.stringify({ strategy: 'full_regenerate', notes: 'Regenerate with clearer geometry.' });
  }
}

test('RevisionPlannerService streams structured JSON revisions with medium reasoning', async () => {
  const provider = new CapturingProvider();
  const service = new RevisionPlannerService(provider);
  const onToken = () => undefined;
  const onReasoning = () => undefined;

  await service.plan(
    { canvas: { width: 128, height: 128 }, layers: [{ id: 'mark' }] } as never,
    '<svg><g id="mark"><path d="M0 0" /></g></svg>',
    [{ type: 'layout', severity: 'medium', problem: 'Mark is too small', target: 'mark' }] as never,
    1,
    { assetType: 'icon' } as never,
    {
      onToken,
      onReasoning,
      onRetry: () => undefined,
    }
  );

  assert.equal(provider.options?.onToken, onToken);
  assert.equal(provider.options?.onReasoning, onReasoning);
  assert.equal(provider.options?.reasoningEffort, 'medium');
});

test('OpenAiProvider sends JSON response format for invoke and stream calls', async () => {
  const source = await readFile(
    new URL('../../../packages/ai-core/src/providers/OpenAiProvider.ts', import.meta.url),
    'utf8'
  );

  assert.match(source, /response_format:\s*\{\s*type:\s*"json_object"\s*\}/);
  assert.match(source, /model\.invoke\([\s\S]*buildCallOptions\(options\)/);
  assert.match(source, /model\.stream\([\s\S]*buildCallOptions\(options\)/);
});

test('OpenAiProvider only applies timeout while opening streams, not while consuming chunks', async () => {
  const source = await readFile(
    new URL('../../../packages/ai-core/src/providers/OpenAiProvider.ts', import.meta.url),
    'utf8'
  );

  assert.match(source, /STREAM_START_TIMEOUT_MS\s*=\s*15_000/);
  assert.match(source, /model\.stream\([\s\S]*STREAM_START_TIMEOUT_MS/);
  assert.doesNotMatch(source, /iterator\.next\(\),\s*STREAM_/);
});
