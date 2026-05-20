import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEvaluatorPrompt } from '../../../packages/ai-core/src/prompts/evaluator.prompt.js';

test('buildEvaluatorPrompt includes previous evaluation context when available', () => {
  const { user } = buildEvaluatorPrompt({
    classification: { assetType: 'icon' },
    brief: { subject: 'rocket' },
    styleSystem: { name: 'mono' },
    layout: { layers: [] },
    previousEvaluationContext: {
      iteration: 1,
      scores: { overall: 62 },
      issues: [
        {
          severity: 'high',
          type: 'readability',
          target: 'rocket flame',
          problem: 'Flame is too small at 16px',
        },
      ],
      revisionPlan: { notes: 'Increase flame size' },
    },
  });

  assert.match(user, /Previous evaluation context/);
  assert.match(user, /Flame is too small at 16px/);
  assert.match(user, /Increase flame size/);
  assert.match(user, /determine whether earlier fixes are now resolved/i);
});
