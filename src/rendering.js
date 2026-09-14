(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.Rendering = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const RENDERING_MODES = new Set(['pixelated', 'smooth']);

  function normalizeRenderingMode(value) {
    const mode = value ?? 'pixelated';
    if (!RENDERING_MODES.has(mode)) throw new Error(`Unsupported rendering mode: ${mode}`);
    return mode;
  }

  function isImageSmoothingEnabled(mode) {
    return normalizeRenderingMode(mode) === 'smooth';
  }

  return { RENDERING_MODES, normalizeRenderingMode, isImageSmoothingEnabled };
});
