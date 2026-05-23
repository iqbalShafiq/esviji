import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSvg } from '../../../packages/svg-core/src/validateSvg.ts';
import { sanitizeSvg } from '../../../packages/svg-core/src/sanitizeSvg.ts';

const svgWithCommonSafeFilters = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <filter id="shadow">
      <feDropShadow dx="0" dy="8" stdDeviation="6" flood-color="#708090" flood-opacity="0.3" />
      <feFlood flood-color="#708090" flood-opacity="0.3" />
      <feComposite in2="SourceAlpha" operator="in" />
      <feMerge>
        <feMergeNode />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
      <feComponentTransfer>
        <feFuncA type="linear" slope="0.3" />
      </feComponentTransfer>
    </filter>
  </defs>
  <rect width="512" height="512" fill="#FFFFFF" filter="url(#shadow)" />
</svg>`;

test('validateSvg accepts common safe filter primitives used by generated SVGs', () => {
  const result = validateSvg(svgWithCommonSafeFilters);

  assert.equal(result.valid, true);
  assert.deepEqual(result.warnings, []);
  assert.match(result.sanitizedSvg, /<feDropShadow\b/);
  assert.match(result.sanitizedSvg, /<feFlood\b/);
  assert.match(result.sanitizedSvg, /<feComposite\b/);
  assert.match(result.sanitizedSvg, /<feMerge\b/);
  assert.match(result.sanitizedSvg, /<feMergeNode\b/);
  assert.match(result.sanitizedSvg, /<feComponentTransfer\b/);
  assert.match(result.sanitizedSvg, /<feFuncA\b/);
});

test('sanitizeSvg preserves common safe filter primitives used by generated SVGs', () => {
  const sanitized = sanitizeSvg(svgWithCommonSafeFilters);

  assert.match(sanitized, /<feDropShadow\b/);
  assert.match(sanitized, /<feFlood\b/);
  assert.match(sanitized, /<feComposite\b/);
  assert.match(sanitized, /<feMerge\b/);
  assert.match(sanitized, /<feMergeNode\b/);
  assert.match(sanitized, /<feComponentTransfer\b/);
  assert.match(sanitized, /<feFuncA\b/);
});
