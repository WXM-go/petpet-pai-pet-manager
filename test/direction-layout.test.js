const test = require('node:test');
const assert = require('node:assert/strict');
const { buildDirectionTransforms } = require('../src/direction-layout');

test('normalizes look cells to the canonical 000 height and baseline', () => {
  const transforms = buildDirectionTransforms({
    '000': { x: 53, y: 7, width: 86, height: 196 },
    '180': { x: 60, y: 29, width: 76, height: 174 },
  }, '000', 192, 208);

  assert.deepEqual(transforms['000'], {
    source: { x: 53, y: 7, width: 86, height: 196 },
    destination: { x: 53, y: 7, width: 86, height: 196 },
  });
  assert.equal(transforms['180'].destination.height, 196);
  assert.equal(transforms['180'].destination.y, 7);
  assert.equal(transforms['180'].destination.x, 53);
  assert.equal(transforms['180'].destination.width, 86);
});
