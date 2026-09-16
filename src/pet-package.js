const fs = require('node:fs');
const path = require('node:path');
const yauzl = require('yauzl');

const PetModel = require('./pet-model');
const {
  CARE_MODES,
  normalizeManifest,
  isSafeRelativePath,
  resolveWithin,
} = require('./pet-library');

const DEFAULT_PACKAGE_LIMITS = Object.freeze({
  maxManifestBytes: 1024 * 1024,
  maxArchiveBytes: 100 * 1024 * 1024,
  maxFileBytes: 100 * 1024 * 1024,
  maxTotalBytes: 200 * 1024 * 1024,
  maxFileCount: 256,
  maxPathLength: 240,
  maxPathDepth: 16,
  maxCompressionRatio: 100,
});

const ERROR_MESSAGES = Object.freeze({
  PET_MANIFEST_MISSING: '找不到 pet.json，桌宠包根目录必须包含 pet.json',
  PET_MANIFEST_INVALID: 'pet.json 格式不正确，请检查桌宠包配置',
  PET_VERSION_UNSUPPORTED: '桌宠包版本不受支持，当前仅支持 pet.json v2',
  PET_FUTURE_CAPABILITY: '此桌宠包声明了当前版本暂不支持的能力，暂时无法导入',
  PET_PATH_UNSAFE: '桌宠包包含不安全路径，已阻止导入',
  PET_PACKAGE_SYMLINK: '桌宠包不能包含符号链接',
  PET_PACKAGE_LIMIT: '桌宠包文件数量或总大小超过安全限制',
  PET_RESOURCE_MISSING: '找不到桌宠包声明的资源',
  PET_RESOURCE_LIMIT: '桌宠资源过大，已阻止导入',
  PET_RESOURCE_CORRUPT: '桌宠资源损坏或格式无法识别',
  PET_RESOURCE_FORMAT: '桌宠资源格式不受支持',
  PET_RESOURCE_ALPHA: '精灵图和互动资源必须包含透明通道',
  PET_ATLAS_INVALID: '精灵图必须是 1536×2288 的 8×11 标准图集',
  PET_ZIP_PATH: 'ZIP 桌宠包包含不安全路径',
  PET_ZIP_SYMLINK: 'ZIP 桌宠包不能包含符号链接',
  PET_ZIP_LIMIT: 'ZIP 桌宠包超过安全解压限制',
  PET_IMPORT_COPY_FAILED: '桌宠包复制失败，本次导入已撤销',
});

class PetPackageError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${ERROR_MESSAGES[code] || '桌宠包校验失败'}：${detail}` : (ERROR_MESSAGES[code] || '桌宠包校验失败'));
    this.name = 'PetPackageError';
    this.code = code;
    this.detail = detail;
  }
}

function limitsWith(options) {
  return { ...DEFAULT_PACKAGE_LIMITS, ...(options?.limits || {}) };
}

function isSafeArchivePath(value, limits = DEFAULT_PACKAGE_LIMITS) {
  if (typeof value !== 'string' || value.includes('\\') || value.includes('\0')) return false;
  if (value.length === 0 || value.length > limits.maxPathLength) return false;
  if (!isSafeRelativePath(value)) return false;
  return value.split('/').filter(Boolean).length <= limits.maxPathDepth;
}

function readFileForValidation(filePath, maxBytes) {
  let stats;
  try {
    stats = fs.statSync(filePath);
  } catch {
    throw new PetPackageError('PET_RESOURCE_MISSING', path.basename(filePath));
  }
  if (!stats.isFile()) throw new PetPackageError('PET_RESOURCE_CORRUPT', path.basename(filePath));
  if (stats.size <= 0 || stats.size > maxBytes) throw new PetPackageError('PET_RESOURCE_LIMIT', path.basename(filePath));
  try {
    return fs.readFileSync(filePath);
  } catch {
    throw new PetPackageError('PET_RESOURCE_CORRUPT', path.basename(filePath));
  }
}

function parsePng(buffer) {
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return null;
  let offset = 8;
  let width;
  let height;
  let hasAlpha = false;
  let hasIend = false;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const chunkEnd = offset + 12 + length;
    if (chunkEnd > buffer.length) throw new Error('truncated PNG chunk');
    if (type === 'IHDR') {
      if (length !== 13 || width !== undefined) throw new Error('invalid PNG header');
      width = buffer.readUInt32BE(offset + 8);
      height = buffer.readUInt32BE(offset + 12);
      const colorType = buffer[offset + 17];
      hasAlpha = colorType === 4 || colorType === 6;
    } else if (type === 'tRNS') {
      hasAlpha = true;
    } else if (type === 'IEND') {
      hasIend = true;
      break;
    }
    offset = chunkEnd;
  }
  if (!hasIend || width === undefined || width <= 0 || height <= 0) throw new Error('invalid PNG structure');
  return { format: 'png', width, height, hasAlpha, frameCount: 1 };
}

function parseWebp(buffer) {
  if (buffer.length < 16 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') return null;
  const riffSize = buffer.readUInt32LE(4);
  if (riffSize + 8 > buffer.length) throw new Error('truncated WEBP');
  let offset = 12;
  let metadata = null;
  while (offset + 8 <= buffer.length) {
    const type = buffer.toString('ascii', offset, offset + 4);
    const length = buffer.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd > buffer.length) throw new Error('truncated WEBP chunk');
    if (type === 'VP8X' && length >= 10) {
      const width = 1 + buffer.readUIntLE(dataStart + 4, 3);
      const height = 1 + buffer.readUIntLE(dataStart + 7, 3);
      metadata = { format: 'webp', width, height, hasAlpha: Boolean(buffer[dataStart] & 0x10), frameCount: 1 };
    } else if (type === 'VP8L' && length >= 5 && buffer[dataStart] === 0x2f) {
      const bits = buffer.readUInt32LE(dataStart + 1);
      metadata = {
        format: 'webp',
        width: 1 + (bits & 0x3fff),
        height: 1 + ((bits >>> 14) & 0x3fff),
        hasAlpha: Boolean((bits >>> 28) & 1),
        frameCount: 1,
      };
    }
    offset = dataEnd + (length % 2);
  }
  if (!metadata) throw new Error('unsupported WEBP encoding');
  return metadata;
}

function skipGifSubBlocks(buffer, offset) {
  while (offset < buffer.length) {
    const size = buffer[offset];
    offset += 1;
    if (size === 0) return offset;
    offset += size;
    if (offset > buffer.length) throw new Error('truncated GIF sub-block');
  }
  throw new Error('truncated GIF sub-block list');
}

function parseGif(buffer) {
  if (buffer.length < 13 || !['GIF87a', 'GIF89a'].includes(buffer.toString('ascii', 0, 6))) return null;
  const width = buffer.readUInt16LE(6);
  const height = buffer.readUInt16LE(8);
  if (!width || !height) throw new Error('invalid GIF dimensions');
  let offset = 13;
  const packed = buffer[10];
  if (packed & 0x80) offset += 3 * (2 ** ((packed & 0x07) + 1));
  let frameCount = 0;
  let hasAlpha = false;
  while (offset < buffer.length) {
    const marker = buffer[offset++];
    if (marker === 0x3b) break;
    if (marker === 0x21) {
      if (offset >= buffer.length) throw new Error('truncated GIF extension');
      const label = buffer[offset++];
      if (label === 0xf9) {
        if (offset + 5 > buffer.length || buffer[offset] !== 4) throw new Error('invalid GIF graphic control extension');
        hasAlpha ||= Boolean(buffer[offset + 1] & 0x01);
        offset += 6;
      } else {
        offset = skipGifSubBlocks(buffer, offset);
      }
    } else if (marker === 0x2c) {
      if (offset + 9 > buffer.length) throw new Error('truncated GIF image descriptor');
      const imagePacked = buffer[offset + 8];
      offset += 9;
      if (imagePacked & 0x80) offset += 3 * (2 ** ((imagePacked & 0x07) + 1));
      if (offset >= buffer.length) throw new Error('truncated GIF image data');
      offset += 1;
      offset = skipGifSubBlocks(buffer, offset);
      frameCount += 1;
    } else {
      throw new Error('unknown GIF block');
    }
    if (offset > buffer.length) throw new Error('truncated GIF');
  }
  if (buffer[buffer.length - 1] !== 0x3b || frameCount === 0) throw new Error('invalid GIF structure');
  return { format: 'gif', width, height, hasAlpha, frameCount };
}

function readImageMetadata(filePath, options = {}) {
  const buffer = readFileForValidation(filePath, options.maxResourceBytes || options.maxFileBytes || DEFAULT_PACKAGE_LIMITS.maxFileBytes);
  try {
    const metadata = parsePng(buffer) || parseWebp(buffer) || parseGif(buffer);
    if (!metadata) throw new Error('unknown image format');
    return metadata;
  } catch (error) {
    if (error instanceof PetPackageError) throw error;
    throw new PetPackageError('PET_RESOURCE_CORRUPT', path.basename(filePath));
  }
}

function scanPackageTree(root, options = {}) {
  const limits = limitsWith(options);
  const seen = new Set();
  const fingerprintParts = [];
  let fileCount = 0;
  let totalBytes = 0;
  function visit(directory, relativeDirectory = '') {
    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      throw new PetPackageError('PET_PACKAGE_LIMIT');
    }
    for (const entry of entries) {
      const relative = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      if (!isSafeArchivePath(relative, limits)) throw new PetPackageError('PET_PATH_UNSAFE', relative);
      const fullPath = path.join(directory, entry.name);
      const stats = fs.lstatSync(fullPath);
      if (stats.isSymbolicLink()) throw new PetPackageError('PET_PACKAGE_SYMLINK', relative);
      if (stats.isDirectory()) {
        visit(fullPath, relative);
        continue;
      }
      if (!stats.isFile()) throw new PetPackageError('PET_PACKAGE_LIMIT', relative);
      const key = relative.toLowerCase();
      if (seen.has(key)) throw new PetPackageError('PET_PATH_UNSAFE', relative);
      seen.add(key);
      fileCount += 1;
      totalBytes += stats.size;
      fingerprintParts.push(`${relative}:${stats.size}:${stats.mtimeMs}`);
      if (fileCount > limits.maxFileCount || stats.size > limits.maxFileBytes || totalBytes > limits.maxTotalBytes) {
        throw new PetPackageError('PET_PACKAGE_LIMIT', relative);
      }
    }
  }
  const resolvedRoot = path.resolve(root);
  const rootStats = fs.lstatSync(resolvedRoot);
  if (rootStats.isSymbolicLink()) throw new PetPackageError('PET_PACKAGE_SYMLINK', '.');
  if (!rootStats.isDirectory()) throw new PetPackageError('PET_MANIFEST_MISSING');
  visit(resolvedRoot);
  return { fileCount, totalBytes, fingerprint: fingerprintParts.sort().join('|') };
}

function resourcePath(root, relativePath) {
  if (!isSafeRelativePath(relativePath)) throw new PetPackageError('PET_PATH_UNSAFE', String(relativePath));
  try {
    return resolveWithin(root, relativePath);
  } catch {
    throw new PetPackageError('PET_PATH_UNSAFE', String(relativePath));
  }
}

function validateResource(root, relativePath, kind, limits) {
  const filePath = resourcePath(root, relativePath);
  if (!fs.existsSync(filePath)) throw new PetPackageError('PET_RESOURCE_MISSING', relativePath);
  const metadata = readImageMetadata(filePath, limits);
  const allowed = kind === 'spritesheet' ? ['png', 'webp'] : ['gif', 'png', 'webp'];
  if (!allowed.includes(metadata.format)) throw new PetPackageError('PET_RESOURCE_FORMAT', relativePath);
  if (path.extname(relativePath).toLowerCase() !== `.${metadata.format}`) {
    throw new PetPackageError('PET_RESOURCE_FORMAT', relativePath);
  }
  if ((kind === 'spritesheet' || kind === 'animation') && !metadata.hasAlpha) {
    throw new PetPackageError('PET_RESOURCE_ALPHA', relativePath);
  }
  return { path: relativePath, ...metadata };
}

function normalizePackageManifest(root, limits) {
  const manifestPath = path.join(root, 'pet.json');
  if (!fs.existsSync(manifestPath)) throw new PetPackageError('PET_MANIFEST_MISSING');
  let input;
  try {
    const stats = fs.statSync(manifestPath);
    if (!stats.isFile() || stats.size <= 0 || stats.size > limits.maxManifestBytes) throw new Error('manifest size');
    input = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    throw new PetPackageError('PET_MANIFEST_INVALID');
  }
  if (input?.spriteVersionNumber !== 2) throw new PetPackageError('PET_VERSION_UNSUPPORTED');
  if (input?.care?.mode && !CARE_MODES.has(String(input.care.mode))) throw new PetPackageError('PET_FUTURE_CAPABILITY');
  const paths = [
    input?.spritesheetPath,
    input?.previewPath,
    ...Object.values(input?.care?.animations || {}),
  ].filter((value) => value !== undefined);
  if (paths.some((value) => !isSafeArchivePath(value, limits))) throw new PetPackageError('PET_PATH_UNSAFE');
  try {
    return normalizeManifest(input);
  } catch (error) {
    throw new PetPackageError('PET_MANIFEST_INVALID', error.message);
  }
}

function validatePetPackage(root, options = {}) {
  const limits = limitsWith(options);
  const resolvedRoot = path.resolve(root);
  if (!fs.existsSync(resolvedRoot) || !fs.statSync(resolvedRoot).isDirectory()) throw new PetPackageError('PET_MANIFEST_MISSING');
  const totals = scanPackageTree(resolvedRoot, { limits });
  const manifest = normalizePackageManifest(resolvedRoot, limits);
  if (manifest.actions !== undefined && (!Array.isArray(manifest.actions) || manifest.actions.some((id) => !PetModel.ACTIONS[id]))) {
    throw new PetPackageError('PET_MANIFEST_INVALID', 'actions 只能包含标准动作');
  }
  for (const action of Object.values(manifest.care.actionMap)) {
    if (!PetModel.ACTIONS[action]) throw new PetPackageError('PET_MANIFEST_INVALID', 'actionMap 包含未知动作');
  }
  const resourceLimits = { ...limits, maxFileBytes: limits.maxResourceBytes || limits.maxFileBytes };
  const spritesheet = validateResource(resolvedRoot, manifest.spritesheetPath, 'spritesheet', resourceLimits);
  if (spritesheet.width !== 1536 || spritesheet.height !== 2288) throw new PetPackageError('PET_ATLAS_INVALID', manifest.spritesheetPath);
  const preview = manifest.previewPath
    ? validateResource(resolvedRoot, manifest.previewPath, 'preview', resourceLimits)
    : null;
  const animations = {};
  for (const [name, relativePath] of Object.entries(manifest.care.animations)) {
    animations[name] = validateResource(resolvedRoot, relativePath, 'animation', resourceLimits);
  }
  return {
    manifest,
    resources: { spritesheet, preview, animations },
    atlas: {
      cellWidth: PetModel.CELL_WIDTH,
      cellHeight: PetModel.CELL_HEIGHT,
      rowCount: 11,
      columnCount: 8,
      actionIds: PetModel.listActionIds(),
      lookDirections: [...PetModel.LOOK_DIRECTIONS],
    },
    totals,
  };
}

function zipEntryIsDirectory(entry) {
  const mode = (entry.externalFileAttributes >>> 16) & 0xffff;
  return entry.fileName.endsWith('/') || (mode & 0xf000) === 0x4000;
}

function zipEntryIsSymlink(entry) {
  const mode = (entry.externalFileAttributes >>> 16) & 0xffff;
  return (mode & 0xf000) === 0xa000;
}

function validateZipEntries(entries, options = {}) {
  const limits = limitsWith(options);
  const seen = new Set();
  let fileCount = 0;
  let totalUncompressedBytes = 0;
  for (const entry of entries) {
    const name = entry.fileName;
    if (!isSafeArchivePath(name, limits)) throw new PetPackageError('PET_ZIP_PATH', name);
    if (zipEntryIsSymlink(entry)) throw new PetPackageError('PET_ZIP_SYMLINK', name);
    if (typeof entry.isEncrypted === 'function' && entry.isEncrypted()) throw new PetPackageError('PET_ZIP_LIMIT', '不支持加密 ZIP');
    const key = name.replace(/\/$/, '').toLowerCase();
    if (seen.has(key)) throw new PetPackageError('PET_ZIP_PATH', name);
    seen.add(key);
    if (zipEntryIsDirectory(entry)) continue;
    fileCount += 1;
    const compressedSize = Number(entry.compressedSize);
    const uncompressedSize = Number(entry.uncompressedSize);
    if (!Number.isSafeInteger(compressedSize) || !Number.isSafeInteger(uncompressedSize) || compressedSize < 0 || uncompressedSize < 0) {
      throw new PetPackageError('PET_ZIP_LIMIT', name);
    }
    totalUncompressedBytes += uncompressedSize;
    if (fileCount > limits.maxFileCount || uncompressedSize > limits.maxFileBytes || totalUncompressedBytes > limits.maxTotalBytes) {
      throw new PetPackageError('PET_ZIP_LIMIT', name);
    }
    if (uncompressedSize > 0 && compressedSize === 0) throw new PetPackageError('PET_ZIP_LIMIT', name);
    if (compressedSize > 0 && uncompressedSize / compressedSize > limits.maxCompressionRatio) {
      throw new PetPackageError('PET_ZIP_LIMIT', name);
    }
  }
  return { fileCount, totalUncompressedBytes };
}

function validateZipArchive(zipPath, options = {}) {
  const limits = limitsWith(options);
  let stats;
  try {
    if (fs.lstatSync(zipPath).isSymbolicLink()) throw new PetPackageError('PET_ZIP_SYMLINK', 'ZIP 文件路径');
    stats = fs.statSync(zipPath);
  } catch (error) {
    if (error instanceof PetPackageError) throw error;
    throw new PetPackageError('PET_ZIP_LIMIT', 'ZIP 文件不存在');
  }
  if (!stats.isFile() || stats.size <= 0 || stats.size > limits.maxArchiveBytes) {
    throw new PetPackageError('PET_ZIP_LIMIT', 'ZIP 文件过大');
  }
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true, strictFileNames: true, validateEntrySizes: true }, (error, zipFile) => {
      if (error) return reject(new PetPackageError('PET_ZIP_LIMIT', 'ZIP 文件损坏'));
      const entries = [];
      let settled = false;
      const fail = (reason) => {
        if (settled) return;
        settled = true;
        zipFile.close();
        reject(reason);
      };
      zipFile.on('error', (zipError) => {
        const code = /path|fileName|absolute|relative|characters/i.test(zipError.message) ? 'PET_ZIP_PATH' : 'PET_ZIP_LIMIT';
        fail(new PetPackageError(code, code === 'PET_ZIP_PATH' ? '路径格式不安全' : 'ZIP 文件损坏'));
      });
      zipFile.on('entry', (entry) => {
        try {
          entries.push(entry);
          zipFile.readEntry();
        } catch (entryError) {
          fail(entryError instanceof PetPackageError ? entryError : new PetPackageError('PET_ZIP_LIMIT'));
        }
      });
      zipFile.on('end', () => {
        if (settled) return;
        try {
          settled = true;
          resolve(validateZipEntries(entries, { limits }));
        } catch (validationError) {
          reject(validationError);
        }
      });
      zipFile.readEntry();
    });
  });
}

module.exports = {
  DEFAULT_PACKAGE_LIMITS,
  ERROR_MESSAGES,
  PetPackageError,
  isSafeArchivePath,
  readImageMetadata,
  scanPackageTree,
  validatePetPackage,
  validateZipArchive,
  validateZipEntries,
};
