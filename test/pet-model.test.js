const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CELL_WIDTH,
  CELL_HEIGHT,
  getActionDefinition,
  getFrameRect,
  getLookDirectionCell,
  listActionIds,
} = require('../src/pet-model');

test('defines all nine standard actions in the Codex v2 row contract', () => {
  assert.deepEqual(listActionIds(), [
    'idle',
    'running-right',
    'running-left',
    'waving',
    'jumping',
    'failed',
    'waiting',
    'running',
    'review',
  ]);
});

test('maps a standard frame to the 192x208 atlas cell', () => {
  assert.deepEqual(getFrameRect('waving', 2), {
    x: 2 * CELL_WIDTH,
    y: 3 * CELL_HEIGHT,
    width: CELL_WIDTH,
    height: CELL_HEIGHT,
  });
});

test('uses six frames for processing and eight for locomotion', () => {
  assert.equal(getActionDefinition('running').frameCount, 6);
  assert.equal(getActionDefinition('running-right').frameCount, 8);
  assert.equal(getActionDefinition('running').label, '处理中');
});

test('maps the sixteen look directions clockwise across rows nine and ten', () => {
  assert.deepEqual(getLookDirectionCell('000'), { row: 9, column: 0 });
  assert.deepEqual(getLookDirectionCell('090'), { row: 9, column: 4 });
  assert.deepEqual(getLookDirectionCell('180'), { row: 10, column: 0 });
  assert.deepEqual(getLookDirectionCell('337.5'), { row: 10, column: 7 });
});
