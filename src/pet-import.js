const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const extractZip = require('extract-zip');

const { getUniquePetFolderName, resolveWithin } = require('./pet-library');
const {
  PetPackageError,
  validatePetPackage,
  validateZipArchive,
  scanPackageTree,
} = require('./pet-package');

function findManifestRoot(directory) {
  if (fs.existsSync(path.join(directory, 'pet.json'))) return directory;
  const children = fs.readdirSync(directory, { withFileTypes: true });
  const candidates = children
    .filter((child) => child.isDirectory() && fs.existsSync(path.join(directory, child.name, 'pet.json')))
    .map((child) => path.join(directory, child.name));
  if (candidates.length !== 1) throw new PetPackageError('PET_MANIFEST_MISSING');
  return candidates[0];
}

function declaredFiles(manifest) {
  return [...new Set([
    'pet.json',
    manifest.spritesheetPath,
    manifest.previewPath,
    ...Object.values(manifest.care.animations),
    'README.txt',
  ].filter(Boolean))];
}

function copyPackage(sourceRoot, targetRoot, manifest, copyFile) {
  for (const relativePath of declaredFiles(manifest)) {
    const source = resolveWithin(sourceRoot, relativePath);
    if (!fs.existsSync(source)) {
      if (relativePath === 'README.txt' || relativePath === manifest.previewPath) continue;
      throw new PetPackageError('PET_RESOURCE_MISSING', relativePath);
    }
    const target = resolveWithin(targetRoot, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    copyFile(source, target);
  }
}

function importPetDirectory(sourceDirectory, options = {}) {
  const libraryRoot = path.resolve(options.libraryRoot || 'pets');
  fs.mkdirSync(libraryRoot, { recursive: true });
  const sourceRoot = findManifestRoot(path.resolve(sourceDirectory));
  const report = validatePetPackage(sourceRoot, options);
  const existingNames = new Set(fs.readdirSync(libraryRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name));
  const folderName = getUniquePetFolderName(report.manifest.id, existingNames);
  const stagingRoot = fs.mkdtempSync(path.join(libraryRoot, '.importing-'));
  const targetRoot = path.join(libraryRoot, folderName);
  const copyFile = options.copyFile || ((source, target) => fs.copyFileSync(source, target));
  let committed = false;
  try {
    copyPackage(sourceRoot, stagingRoot, report.manifest, copyFile);
    validatePetPackage(stagingRoot, options);
    fs.renameSync(stagingRoot, targetRoot);
    committed = true;
    return { folderName, targetRoot, manifest: report.manifest };
  } catch (error) {
    if (!committed && fs.existsSync(stagingRoot)) fs.rmSync(stagingRoot, { recursive: true, force: true });
    if (committed && fs.existsSync(targetRoot)) fs.rmSync(targetRoot, { recursive: true, force: true });
    if (error instanceof PetPackageError) throw error;
    throw new PetPackageError('PET_IMPORT_COPY_FAILED');
  } finally {
    if (!committed && fs.existsSync(stagingRoot)) fs.rmSync(stagingRoot, { recursive: true, force: true });
  }
}

async function importPetZip(zipPath, options = {}) {
  await validateZipArchive(zipPath, options);
  const tempRoot = fs.mkdtempSync(path.join(options.tempRoot || os.tmpdir(), 'petpet-import-'));
  try {
    await extractZip(path.resolve(zipPath), { dir: tempRoot });
    scanPackageTree(tempRoot, options);
    return importPetDirectory(tempRoot, options);
  } catch (error) {
    if (error instanceof PetPackageError) throw error;
    throw new PetPackageError('PET_ZIP_LIMIT', 'ZIP 解压失败');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function cleanupImportStaging(libraryRoot) {
  const resolvedRoot = path.resolve(libraryRoot);
  if (!fs.existsSync(resolvedRoot)) return;
  for (const entry of fs.readdirSync(resolvedRoot, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.startsWith('.importing-')) {
      fs.rmSync(path.join(resolvedRoot, entry.name), { recursive: true, force: true });
    }
  }
}

module.exports = { cleanupImportStaging, findManifestRoot, importPetDirectory, importPetZip };
