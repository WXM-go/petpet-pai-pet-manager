const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SIZE_PRESETS,
  getScaledWindowSize,
  keepBottomRight,
  getDraggedPosition,
} = require('../src/window-controls');

test('offers six desktop-pet size presets including two smaller sizes', () => {
  assert.deepEqual(SIZE_PRESETS.map(({ id, scale }) => ({ id, scale })), [
    { id: 'tiny', scale: 0.5 },
    { id: 'compact', scale: 0.65 },
    { id: 'small', scale: 0.8 },
    { id: 'normal', scale: 1 },
    { id: 'large', scale: 1.25 },
    { id: 'xlarge', scale: 1.5 },
  ]);
});

test('calculates scaled window dimensions from the standard pet window', () => {
  assert.deepEqual(getScaledWindowSize(240, 260, 1.25), { width: 300, height: 325 });
});

test('keeps the pet anchored at the same bottom-right point when resizing', () => {
  assert.deepEqual(keepBottomRight({ x: 100, y: 200, width: 240, height: 260 }, 300, 325), {
    x: 40,
    y: 135,
    width: 300,
    height: 325,
  });
});

test('moves the window by the pointer delta while dragging', () => {
  assert.deepEqual(getDraggedPosition({
    windowX: 100,
    windowY: 200,
    startMouseX: 500,
    startMouseY: 500,
    currentMouseX: 520,
    currentMouseY: 480,
  }), { x: 120, y: 180 });
});
