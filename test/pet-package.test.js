const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  DEFAULT_PACKAGE_LIMITS,
  PetPackageError,
  isSafeArchivePath,
  readImageMetadata,
  scanPackageTree,
  validatePetPackage,
  validateZipEntries,
} = require('../src/pet-package');

const root = path.join(__dirname, '..');
const softBlobRoot = path.join(root, 'assets', 'soft-blob');
const sampleRoot = path.join(root, 'examples', 'sample-pet');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'petpet-package-test-'));
}

function copySamplePackage() {
  const directory = makeTempDir();
  fs.cpSync(sampleRoot, directory, { recursive: true });
  return directory;
}

function assertPackageError(action, code) {
  assert.throws(action, (error) => {
    assert.ok(error instanceof PetPackageError);
    assert.equal(error.code, code);
    assert.match(error.message, /[\u4e00-\u9fff]/);
    return true;
  });
}

function makeZipEntries(entries) {
  let offset = 0;
  const localParts = [];
  const centralParts = [];
  for (const item of entries) {
    const name = Buffer.from(item.name, 'utf8');
    const data = Buffer.from(item.data || '');
    const local = Buffer.alloc(30 + name.length + data.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(item.uncompressedSize ?? data.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    data.copy(local, 30 + name.length);
    localParts.push(local);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(item.uncompressedSize ?? data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(item.externalFileAttributes || 0, 38);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centralParts.push(central);
    offset += local.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

test('validates the bundled v2 package, atlas contract, and transparent spritesheet', () => {
  const report = validatePetPackage(softBlobRoot);
  assert.equal(report.manifest.spriteVersionNumber, 2);
  assert.equal(report.manifest.renderingMode, 'smooth');
  assert.equal(report.manifest.care.mode, 'light-care');
  assert.deepEqual(report.atlas, {
    cellWidth: 192,
    cellHeight: 208,
    rowCount: 11,
    columnCount: 8,
    actionIds: ['idle', 'running-right', 'running-left', 'waving', 'jumping', 'failed', 'waiting', 'running', 'review'],
    lookDirections: ['000', '022.5', '045', '067.5', '090', '112.5', '135', '157.5', '180', '202.5', '225', '247.5', '270', '292.5', '315', '337.5'],
  });
  assert.equal(report.resources.spritesheet.width, 1536);
  assert.equal(report.resources.spritesheet.height, 2288);
  assert.equal(report.resources.spritesheet.hasAlpha, true);
  assert.deepEqual(Object.keys(report.resources.animations).sort(), ['drowsy', 'feed', 'pet', 'play', 'sleep']);
});

test('keeps the minimal old v2 package compatible with default interaction care', () => {
  const report = validatePetPackage(sampleRoot);
  assert.equal(report.manifest.renderingMode, 'pixelated');
  assert.deepEqual(report.manifest.care, {
    version: 1,
    mode: 'interaction',
    interactions: [],
    stats: [],
    actionMap: {},
    animations: {},
  });
});

test('accepts all three declared care capability levels without enabling full-care rules', () => {
  for (const mode of ['interaction', 'light-care', 'full-care']) {
    const directory = copySamplePackage();
    try {
      const manifestPath = path.join(directory, 'pet.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      manifest.care = { version: 1, mode, interactions: ['pet'], stats: mode === 'interaction' ? [] : ['happiness'] };
      fs.writeFileSync(manifestPath, JSON.stringify(manifest));
      assert.equal(validatePetPackage(directory).manifest.care.mode, mode);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }
});

test('rejects non-v2 packages instead of guessing a legacy atlas contract', () => {
  const directory = copySamplePackage();
  try {
    const manifestPath = path.join(directory, 'pet.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.spriteVersionNumber = 1;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    assertPackageError(() => validatePetPackage(directory), 'PET_VERSION_UNSUPPORTED');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('maps future care capabilities to a Chinese compatibility error', () => {
  const directory = copySamplePackage();
  try {
    const manifestPath = path.join(directory, 'pet.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.care = { version: 1, mode: 'full-care-plus' };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    assertPackageError(() => validatePetPackage(directory), 'PET_FUTURE_CAPABILITY');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('rejects unsafe manifest paths before reading resources', () => {
  const directory = copySamplePackage();
  try {
    const manifestPath = path.join(directory, 'pet.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.spritesheetPath = '../outside.webp';
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    assertPackageError(() => validatePetPackage(directory), 'PET_PATH_UNSAFE');
    assert.equal(isSafeArchivePath('../outside.webp'), false);
    assert.equal(isSafeArchivePath('C:/outside.webp'), false);
    assert.equal(isSafeArchivePath('safe/path.webp'), true);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('rejects missing, oversized, corrupted, and wrongly sized resources', () => {
  const missing = copySamplePackage();
  try {
    const manifestPath = path.join(missing, 'pet.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.care = { version: 1, mode: 'interaction', animations: { pet: 'interactions/pet.gif' } };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    assertPackageError(() => validatePetPackage(missing), 'PET_RESOURCE_MISSING');
  } finally {
    fs.rmSync(missing, { recursive: true, force: true });
  }

  const oversized = copySamplePackage();
  try {
    assertPackageError(() => validatePetPackage(oversized, { limits: { maxResourceBytes: 10 } }), 'PET_RESOURCE_LIMIT');
  } finally {
    fs.rmSync(oversized, { recursive: true, force: true });
  }

  const corrupt = copySamplePackage();
  try {
    fs.writeFileSync(path.join(corrupt, 'spritesheet.webp'), 'not an image');
    assertPackageError(() => validatePetPackage(corrupt), 'PET_RESOURCE_CORRUPT');
  } finally {
    fs.rmSync(corrupt, { recursive: true, force: true });
  }

  const wrongSize = copySamplePackage();
  try {
    fs.copyFileSync(path.join(root, 'artifacts', 'soft-blob', 'final', 'spritesheet-repaired-standard.webp'), path.join(wrongSize, 'spritesheet.webp'));
    assertPackageError(() => validatePetPackage(wrongSize), 'PET_ATLAS_INVALID');
  } finally {
    fs.rmSync(wrongSize, { recursive: true, force: true });
  }

  const wrongExtension = copySamplePackage();
  try {
    const manifestPath = path.join(wrongExtension, 'pet.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.spritesheetPath = 'spritesheet.txt';
    fs.renameSync(path.join(wrongExtension, 'spritesheet.webp'), path.join(wrongExtension, 'spritesheet.txt'));
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    assertPackageError(() => validatePetPackage(wrongExtension), 'PET_RESOURCE_FORMAT');
  } finally {
    fs.rmSync(wrongExtension, { recursive: true, force: true });
  }
});

test('reports image metadata and rejects a package tree over its file budget', () => {
  const metadata = readImageMetadata(path.join(softBlobRoot, 'interactions', 'pet.gif'));
  assert.equal(metadata.format, 'gif');
  assert.equal(metadata.width, 192);
  assert.equal(metadata.height, 208);
  assert.equal(metadata.hasAlpha, true);
  assert.ok(metadata.frameCount > 0);

  const directory = makeTempDir();
  try {
    fs.writeFileSync(path.join(directory, 'large.bin'), '1234567890');
    assert.throws(() => scanPackageTree(directory, { limits: { maxTotalBytes: 5 } }), (error) => error.code === 'PET_PACKAGE_LIMIT');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('rejects ZIP traversal, symlink entries, and expansion budgets before extraction', async () => {
  const zipPath = path.join(makeTempDir(), 'unsafe.zip');
  try {
    fs.writeFileSync(zipPath, makeZipEntries([{ name: '../evil.txt', data: 'x' }]));
    await assert.rejects(() => require('../src/pet-package').validateZipArchive(zipPath), (error) => error.code === 'PET_ZIP_PATH');

    const symlinkPath = path.join(path.dirname(zipPath), 'symlink.zip');
    fs.writeFileSync(symlinkPath, makeZipEntries([{ name: 'link', data: 'target', externalFileAttributes: 0xA0000000 }]));
    await assert.rejects(() => require('../src/pet-package').validateZipArchive(symlinkPath), (error) => error.code === 'PET_ZIP_SYMLINK');

    const oversized = makeZipEntries([{ name: 'huge.bin', data: 'x', uncompressedSize: DEFAULT_PACKAGE_LIMITS.maxTotalBytes + 1 }]);
    assert.throws(() => validateZipEntries([{ fileName: 'huge.bin', compressedSize: 1, uncompressedSize: DEFAULT_PACKAGE_LIMITS.maxTotalBytes + 1, externalFileAttributes: 0 }]), (error) => error.code === 'PET_ZIP_LIMIT');
    assert.ok(oversized.length > 0);
  } finally {
    fs.rmSync(path.dirname(zipPath), { recursive: true, force: true });
  }
});
