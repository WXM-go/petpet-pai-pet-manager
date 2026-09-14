const test = require('node:test');
const assert = require('node:assert/strict');
const { shouldAutoDemo } = require('../src/playback-policy');

test('does not schedule automatic actions while the pet is sleeping', () => {
  assert.equal(shouldAutoDemo({ demoEnabled: true, careStatus: 'sleeping' }), false);
});

test('keeps automatic actions available when the pet is awake or drowsy', () => {
  assert.equal(shouldAutoDemo({ demoEnabled: true, careStatus: 'awake' }), true);
  assert.equal(shouldAutoDemo({ demoEnabled: true, careStatus: 'drowsy' }), true);
});

test('does not schedule automatic actions when automatic demo is disabled', () => {
  assert.equal(shouldAutoDemo({ demoEnabled: false, careStatus: 'awake' }), false);
});
