const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeManifest,
  isSafeRelativePath,
  getUniquePetFolderName,
} = require('../src/pet-library');

test('normalizes a valid Codex v2 pet manifest', () => {
  assert.deepEqual(normalizeManifest({
    id: 'sample-pet',
    displayName: '示例桌宠',
    description: '通用示例',
    spriteVersionNumber: 2,
    spritesheetPath: 'spritesheet.webp',
  }), {
    id: 'sample-pet',
    displayName: '示例桌宠',
    description: '通用示例',
    spriteVersionNumber: 2,
    spritesheetPath: 'spritesheet.webp',
    renderingMode: 'pixelated',
    care: {
      version: 1,
      mode: 'interaction',
      interactions: [],
      stats: [],
      actionMap: {},
      animations: {},
    },
  });
});

test('normalizes smooth rendering and light-care capabilities', () => {
  assert.deepEqual(normalizeManifest({
    id: 'soft-blob',
    displayName: '软团团',
    spriteVersionNumber: 2,
    renderingMode: 'smooth',
    care: {
      version: 1,
      mode: 'light-care',
      interactions: ['pet', 'feed', 'play', 'rest'],
      stats: ['happiness', 'satiety', 'energy'],
      actionMap: { pet: 'waving', feed: 'waiting', play: 'jumping', rest: 'idle' },
      animations: { sleep: 'interactions.webp' },
    },
  }), {
    id: 'soft-blob',
    displayName: '软团团',
    description: '',
    spriteVersionNumber: 2,
    spritesheetPath: 'spritesheet.webp',
    renderingMode: 'smooth',
    care: {
      version: 1,
      mode: 'light-care',
      interactions: ['pet', 'feed', 'play', 'rest'],
      stats: ['happiness', 'satiety', 'energy'],
      actionMap: { pet: 'waving', feed: 'waiting', play: 'jumping', rest: 'idle' },
      animations: { sleep: 'interactions.webp' },
    },
  });
});

test('rejects unsupported rendering and care modes', () => {
  assert.throws(() => normalizeManifest({
    id: 'bad-render', displayName: '坏渲染', spriteVersionNumber: 2, renderingMode: 'vector',
  }), /renderingMode/);
  assert.throws(() => normalizeManifest({
    id: 'bad-care', displayName: '坏养成', spriteVersionNumber: 2, care: { mode: 'unknown' },
  }), /care.*mode/);
});

test('rejects manifests that escape the pet package directory', () => {
  assert.equal(isSafeRelativePath('spritesheet.webp'), true);
  assert.equal(isSafeRelativePath('preview/preview.png'), true);
  assert.equal(isSafeRelativePath('../outside.webp'), false);
  assert.equal(isSafeRelativePath('C:\\outside.webp'), false);
  assert.throws(() => normalizeManifest({
    id: 'unsafe',
    displayName: '危险',
    spriteVersionNumber: 2,
    spritesheetPath: '../outside.webp',
  }), /spritesheetPath/);
});

test('generates a non-colliding folder name for duplicate pet ids', () => {
  assert.equal(getUniquePetFolderName('sample-pet', new Set()), 'sample-pet');
  assert.equal(getUniquePetFolderName('sample-pet', new Set(['sample-pet'])), 'sample-pet-2');
  assert.equal(getUniquePetFolderName('sample-pet', new Set(['sample-pet', 'sample-pet-2'])), 'sample-pet-3');
});
