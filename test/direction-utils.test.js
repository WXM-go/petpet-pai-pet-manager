const test = require('node:test');
const assert = require('node:assert/strict');
const { quantizeDirection, directionDistance } = require('../src/direction-utils');

test('quantizes screen-space pointer vectors into sixteen look directions', () => {
  assert.equal(quantizeDirection(0, -1), '000');
  assert.equal(quantizeDirection(1, -1), '045');
  assert.equal(quantizeDirection(1, 0), '090');
  assert.equal(quantizeDirection(0, 1), '180');
  assert.equal(quantizeDirection(-1, 0), '270');
});

test('returns the shortest circular distance between look directions', () => {
  assert.equal(directionDistance('000', '337.5'), 22.5);
  assert.equal(directionDistance('045', '225'), 180);
  assert.equal(directionDistance('090', '090'), 0);
});
