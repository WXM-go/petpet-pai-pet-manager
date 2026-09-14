const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeRenderingMode, isImageSmoothingEnabled } = require('../src/rendering');

test('keeps legacy pets pixelated and enables smooth rendering explicitly', () => {
  assert.equal(normalizeRenderingMode(), 'pixelated');
  assert.equal(normalizeRenderingMode('pixelated'), 'pixelated');
  assert.equal(normalizeRenderingMode('smooth'), 'smooth');
  assert.equal(isImageSmoothingEnabled('pixelated'), false);
  assert.equal(isImageSmoothingEnabled('smooth'), true);
});

test('rejects invalid rendering modes instead of silently changing style', () => {
  assert.throws(() => normalizeRenderingMode('vector'), /rendering mode/i);
});
