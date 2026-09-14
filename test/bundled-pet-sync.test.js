const test = require('node:test');
const assert = require('node:assert/strict');
const { shouldSyncBundledFiles } = require('../src/bundled-pet-sync');

test('refreshes a bundled pet when a cached asset is missing or changed', () => {
  assert.equal(shouldSyncBundledFiles([
    { exists: true, size: 1746332 },
    { exists: true, size: 793 },
  ], [
    { exists: true, size: 1800476 },
    { exists: true, size: 793 },
  ]), true);
  assert.equal(shouldSyncBundledFiles([
    { exists: true, size: 1746332 },
    { exists: true, size: 793 },
  ], [
    { exists: false, size: 0 },
    { exists: true, size: 793 },
  ]), true);
});

test('does not recopy unchanged bundled files', () => {
  const files = [{ exists: true, size: 1746332 }, { exists: true, size: 793 }];
  assert.equal(shouldSyncBundledFiles(files, files), false);
});
