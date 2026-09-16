(function (root, factory) {
  const petModel = root?.PetModel || (typeof require === 'function' ? require('./pet-model') : null);
  const api = factory(petModel);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.PetRuntime = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (PetModel) {
  const CARE_MODES = new Set(['interaction', 'light-care', 'full-care']);
  const DEFAULT_ACTION_MAP = Object.freeze({
    pet: 'waving',
    feed: 'waiting',
    play: 'jumping',
    rest: 'idle',
  });

  function normalizeCareMode(mode) {
    return CARE_MODES.has(mode) ? mode : 'interaction';
  }

  function isStandardAction(action) {
    return typeof action === 'string' && Boolean(PetModel?.ACTIONS?.[action]);
  }

  function createRuntimeCapabilityReport(packageReport = {}) {
    const manifest = packageReport.manifest || {};
    const care = manifest.care || {};
    const mode = normalizeCareMode(care.mode);
    const actionMap = {};
    for (const [kind, action] of Object.entries(care.actionMap || {})) {
      if (isStandardAction(action)) actionMap[kind] = action;
    }

    const actionIds = Array.isArray(packageReport.atlas?.actionIds)
      ? [...packageReport.atlas.actionIds]
      : (typeof PetModel?.listActionIds === 'function' ? PetModel.listActionIds() : []);
    const animationKinds = Object.keys(packageReport.resources?.animations || {});

    return {
      mode,
      capabilities: {
        interaction: true,
        lightCare: mode === 'light-care',
        fullCare: mode === 'full-care',
      },
      interactions: Array.isArray(care.interactions) ? [...care.interactions] : [],
      stats: Array.isArray(care.stats) ? [...care.stats] : [],
      actionMap,
      animations: animationKinds,
      actions: actionIds,
    };
  }

  function getMappedAction(runtimeCapabilities, kind) {
    const mapped = runtimeCapabilities?.actionMap?.[kind];
    if (isStandardAction(mapped)) return mapped;
    const fallback = DEFAULT_ACTION_MAP[kind];
    return isStandardAction(fallback) ? fallback : null;
  }

  function getInteractionPlaybackPlan(runtimeCapabilities, kind, animationUrls = {}) {
    const action = getMappedAction(runtimeCapabilities, kind);
    const hasValidatedAnimation = runtimeCapabilities?.animations?.includes(kind);
    const animationUrl = hasValidatedAnimation && typeof animationUrls?.[kind] === 'string'
      ? animationUrls[kind]
      : null;
    const useOverlay = Boolean(animationUrl);

    return {
      kind,
      action,
      animationUrl,
      source: useOverlay ? 'overlay' : action ? 'atlas' : 'none',
      useOverlay,
      hideBaseCanvas: useOverlay,
      playAtlasAction: !useOverlay && Boolean(action),
    };
  }

  return {
    CARE_MODES,
    DEFAULT_ACTION_MAP,
    createRuntimeCapabilityReport,
    getInteractionPlaybackPlan,
  };
});
