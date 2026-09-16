const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('软团团 is the bundled v2 default pet', () => {
  const assetsRoot = path.join(root, 'assets');
  const bundledRoot = path.join(assetsRoot, 'soft-blob');
  const manifest = JSON.parse(fs.readFileSync(path.join(bundledRoot, 'pet.json'), 'utf8'));

  assert.equal(fs.existsSync(path.join(assetsRoot, 'pet.json')), false);
  assert.equal(manifest.id, 'soft-blob');
  assert.equal(manifest.displayName, '软团团');
  assert.equal(manifest.spriteVersionNumber, 2);
  assert.equal(manifest.renderingMode, 'smooth');
  assert.equal(manifest.care.mode, 'light-care');
  assert.deepEqual(manifest.care.interactions, ['pet', 'feed', 'play', 'rest']);
  assert.equal(fs.existsSync(path.join(bundledRoot, manifest.spritesheetPath)), true);
  assert.equal(fs.existsSync(path.join(bundledRoot, manifest.previewPath)), true);
  for (const relativePath of Object.values(manifest.care.animations)) {
    assert.equal(fs.existsSync(path.join(bundledRoot, relativePath)), true);
  }
});
