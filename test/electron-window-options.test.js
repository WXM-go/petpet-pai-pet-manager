const test = require('node:test');
const assert = require('node:assert/strict');
const { createRendererWebPreferences } = require('../src/electron-window-options');

test('creates a renderer preference boundary that can launch on Windows', () => {
  const preloadPath = 'C:\\petpet\\src\\preload.js';

  assert.deepEqual(createRendererWebPreferences(preloadPath), {
    preload: preloadPath,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: false,
  });
});
