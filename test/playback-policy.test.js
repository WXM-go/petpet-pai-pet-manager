const test = require('node:test');
const assert = require('node:assert/strict');
const { shouldAutoDemo, shouldRescheduleDemo } = require('../src/playback-policy');

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

test('does not reset the automatic-demo timer for an unchanged care status', () => {
  assert.equal(shouldRescheduleDemo({
    demoEnabled: true,
    careStatus: 'awake',
    previousCareStatus: 'awake',
  }), false);
});

test('reschedules automatic demo when care status changes or initializes', () => {
  assert.equal(shouldRescheduleDemo({ demoEnabled: true, careStatus: 'awake' }), true);
  assert.equal(shouldRescheduleDemo({
    demoEnabled: true,
    careStatus: 'drowsy',
    previousCareStatus: 'awake',
  }), true);
});

test('does not schedule automatic demo while a pet is resting', () => {
  assert.equal(shouldRescheduleDemo({
    demoEnabled: true,
    careStatus: 'awake',
    resting: true,
  }), false);
});
