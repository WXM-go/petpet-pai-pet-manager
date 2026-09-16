const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { importPetDirectory } = require('../src/pet-import');

const root = path.join(__dirname, '..');
const sampleRoot = path.join(root, 'examples', 'sample-pet');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'petpet-import-test-'));
}

test('commits a fully validated package atomically into a unique folder', () => {
  const libraryRoot = tempDir();
  try {
    const result = importPetDirectory(sampleRoot, { libraryRoot });
    assert.equal(result.folderName, 'sample-pet');
    assert.equal(fs.existsSync(path.join(libraryRoot, 'sample-pet', 'pet.json')), true);
    assert.equal(fs.existsSync(path.join(libraryRoot, 'sample-pet', 'spritesheet.webp')), true);
    assert.deepEqual(fs.readdirSync(libraryRoot), ['sample-pet']);
  } finally {
    fs.rmSync(libraryRoot, { recursive: true, force: true });
  }
});

test('removes staging and target directories after a partial copy failure', () => {
  const libraryRoot = tempDir();
  let copies = 0;
  try {
    assert.throws(() => importPetDirectory(sampleRoot, {
      libraryRoot,
      copyFile(source, target) {
        copies += 1;
        if (copies === 2) throw new Error('simulated copy failure');
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(source, target);
      },
    }), (error) => error.code === 'PET_IMPORT_COPY_FAILED' && /[\u4e00-\u9fff]/.test(error.message));
    assert.equal(copies, 2);
    assert.deepEqual(fs.readdirSync(libraryRoot), []);
  } finally {
    fs.rmSync(libraryRoot, { recursive: true, force: true });
  }
});

test('cleans abandoned staging directories without touching installed pets', () => {
  const libraryRoot = tempDir();
  try {
    fs.mkdirSync(path.join(libraryRoot, '.importing-abandoned'), { recursive: true });
    fs.mkdirSync(path.join(libraryRoot, 'installed-pet'), { recursive: true });
    const { cleanupImportStaging } = require('../src/pet-import');
    cleanupImportStaging(libraryRoot);
    assert.equal(fs.existsSync(path.join(libraryRoot, '.importing-abandoned')), false);
    assert.equal(fs.existsSync(path.join(libraryRoot, 'installed-pet')), true);
  } finally {
    fs.rmSync(libraryRoot, { recursive: true, force: true });
  }
});
