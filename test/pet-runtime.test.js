const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createRuntimeCapabilityReport,
  getInteractionPlaybackPlan,
} = require('../src/pet-runtime');

function makePackageReport(mode = 'interaction', overrides = {}) {
  return {
    manifest: {
      care: {
        mode,
        interactions: ['pet', 'feed', 'play', 'rest'],
        stats: mode === 'interaction' ? [] : ['happiness', 'satiety', 'energy'],
        actionMap: { pet: 'waving', feed: 'waiting', play: 'jumping', rest: 'idle' },
        animations: {},
        ...overrides.care,
      },
      actions: ['idle', 'waving', 'waiting', 'jumping'],
      ...overrides.manifest,
    },
    resources: {
      animations: {},
      ...overrides.resources,
    },
    atlas: {
      actionIds: ['idle', 'waving', 'waiting', 'jumping'],
      ...overrides.atlas,
    },
  };
}

test('reports interaction, light-care, and full-care compatibility without conflating rules', () => {
  const expected = {
    interaction: { interaction: true, lightCare: false, fullCare: false },
    'light-care': { interaction: true, lightCare: true, fullCare: false },
    'full-care': { interaction: true, lightCare: false, fullCare: true },
  };

  for (const [mode, capabilities] of Object.entries(expected)) {
    const report = createRuntimeCapabilityReport(makePackageReport(mode));
    assert.equal(report.mode, mode);
    assert.deepEqual(report.capabilities, capabilities);
    assert.deepEqual(report.actionMap, {
      pet: 'waving', feed: 'waiting', play: 'jumping', rest: 'idle',
    });
  }
});

test('uses a declared standard action for atlas playback when no interaction resource exists', () => {
  const report = createRuntimeCapabilityReport(makePackageReport('light-care', {
    care: { actionMap: { pet: 'review' } },
  }));

  const plan = getInteractionPlaybackPlan(report, 'pet', {});

  assert.deepEqual(plan, {
    kind: 'pet',
    action: 'review',
    animationUrl: null,
    source: 'atlas',
    useOverlay: false,
    hideBaseCanvas: false,
    playAtlasAction: true,
  });
});

test('prefers a validated dedicated interaction resource over the mapped atlas action', () => {
  const report = createRuntimeCapabilityReport(makePackageReport('light-care', {
    resources: { animations: { pet: { path: 'interactions/pet.gif' } } },
  }));

  const plan = getInteractionPlaybackPlan(report, 'pet', {
    pet: 'file:///pets/pet.gif',
  });

  assert.equal(plan.action, 'waving');
  assert.equal(plan.animationUrl, 'file:///pets/pet.gif');
  assert.equal(plan.source, 'overlay');
  assert.equal(plan.useOverlay, true);
  assert.equal(plan.hideBaseCanvas, true);
  assert.equal(plan.playAtlasAction, false);
});

test('falls back safely when an action map entry is not a standard action', () => {
  const report = createRuntimeCapabilityReport(makePackageReport('interaction', {
    care: { actionMap: { pet: 'future-action' } },
  }));

  const plan = getInteractionPlaybackPlan(report, 'pet', {});

  assert.equal(plan.action, 'waving');
  assert.equal(plan.source, 'atlas');
  assert.equal(plan.playAtlasAction, true);
});
