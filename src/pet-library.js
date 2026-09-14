const fs = require('node:fs');
const path = require('node:path');

const PET_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;
const RENDERING_MODES = new Set(['pixelated', 'smooth']);
const CARE_MODES = new Set(['interaction', 'light-care', 'full-care']);
const CARE_INTERACTIONS = new Set(['pet', 'feed', 'play', 'rest']);
const CARE_STATS = new Set(['happiness', 'satiety', 'energy']);

function isSafeRelativePath(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  const normalized = value.replaceAll('\\', '/');
  if (normalized.startsWith('/') || /^[a-zA-Z]:\//.test(normalized)) return false;
  const segments = normalized.split('/');
  return segments.every((segment) => segment && segment !== '.' && segment !== '..');
}

function normalizeCare(input) {
  if (input === undefined || input === null) {
    return { version: 1, mode: 'interaction', interactions: [], stats: [], actionMap: {}, animations: {} };
  }
  if (typeof input !== 'object' || Array.isArray(input)) throw new TypeError('care must contain an object');
  const version = Number(input.version ?? 1);
  const mode = String(input.mode ?? 'interaction');
  if (version !== 1) throw new Error('care.version must be 1');
  if (!CARE_MODES.has(mode)) throw new Error('care.mode is not supported');
  const interactions = input.interactions ?? [];
  const stats = input.stats ?? [];
  if (!Array.isArray(interactions) || interactions.some((item) => !CARE_INTERACTIONS.has(item))) {
    throw new Error('care.interactions contains an unsupported value');
  }
  if (!Array.isArray(stats) || stats.some((item) => !CARE_STATS.has(item))) {
    throw new Error('care.stats contains an unsupported value');
  }
  const actionMap = input.actionMap ?? {};
  if (!actionMap || typeof actionMap !== 'object' || Array.isArray(actionMap)) throw new Error('care.actionMap must be an object');
  for (const [interaction, action] of Object.entries(actionMap)) {
    if (!CARE_INTERACTIONS.has(interaction) || typeof action !== 'string' || !action.trim()) {
      throw new Error('care.actionMap contains an invalid entry');
    }
  }
  const animations = input.animations ?? {};
  if (!animations || typeof animations !== 'object' || Array.isArray(animations)) throw new Error('care.animations must be an object');
  for (const [name, assetPath] of Object.entries(animations)) {
    if (!name.trim() || !isSafeRelativePath(assetPath)) throw new Error('care.animations contains an unsafe path');
  }
  return {
    version,
    mode,
    interactions: [...interactions],
    stats: [...stats],
    actionMap: { ...actionMap },
    animations: { ...animations },
  };
}

function normalizeManifest(input) {
  if (!input || typeof input !== 'object') throw new TypeError('pet.json must contain an object');
  const id = String(input.id ?? '').trim();
  const displayName = String(input.displayName ?? '').trim();
  const spriteVersionNumber = Number(input.spriteVersionNumber);
  const spritesheetPath = input.spritesheetPath ?? 'spritesheet.webp';
  if (!PET_ID_PATTERN.test(id)) throw new Error('id must contain only letters, numbers, dots, underscores, or hyphens');
  if (!displayName || displayName.length > 80) throw new Error('displayName is required and must be at most 80 characters');
  if (spriteVersionNumber !== 2) throw new Error('spriteVersionNumber must be 2');
  if (!isSafeRelativePath(spritesheetPath)) throw new Error('spritesheetPath must be a safe relative path');
  const renderingMode = input.renderingMode ?? 'pixelated';
  if (!RENDERING_MODES.has(renderingMode)) throw new Error('renderingMode is not supported');
  const manifest = {
    id,
    displayName,
    description: String(input.description ?? '').trim(),
    spriteVersionNumber,
    spritesheetPath,
    renderingMode,
    care: normalizeCare(input.care),
  };
  if (input.previewPath !== undefined) {
    if (!isSafeRelativePath(input.previewPath)) throw new Error('previewPath must be a safe relative path');
    manifest.previewPath = input.previewPath;
  }
  if (input.actions !== undefined) manifest.actions = input.actions;
  return manifest;
}

function getUniquePetFolderName(id, existingNames) {
  const names = existingNames instanceof Set ? existingNames : new Set(existingNames || []);
  if (!names.has(id)) return id;
  let suffix = 2;
  while (names.has(`${id}-${suffix}`)) suffix += 1;
  return `${id}-${suffix}`;
}

function resolveWithin(root, relativePath) {
  if (!isSafeRelativePath(relativePath)) throw new Error('Unsafe relative path');
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error('Resolved path escapes root');
  }
  return resolved;
}

function assertNoSymlinkComponents(root, relativePath = '') {
  const normalized = relativePath ? relativePath.replaceAll('\\', '/') : '';
  if (normalized && !isSafeRelativePath(normalized)) throw new Error('Unsafe relative path');
  let current = path.resolve(root);
  for (const segment of normalized ? normalized.split('/') : []) {
    current = path.join(current, segment);
    let stats;
    try {
      stats = fs.lstatSync(current);
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    if (stats.isSymbolicLink()) throw new Error('桌宠包不能包含符号链接');
  }
}

module.exports = {
  PET_ID_PATTERN,
  RENDERING_MODES,
  CARE_MODES,
  normalizeCare,
  isSafeRelativePath,
  normalizeManifest,
  getUniquePetFolderName,
  resolveWithin,
  assertNoSymlinkComponents,
};
