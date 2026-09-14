(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.PetInteractionLayer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function getInteractionPlaybackPlan(animationUrl) {
    const useOverlay = Boolean(animationUrl);
    return {
      useOverlay,
      hideBaseCanvas: useOverlay,
      playAtlasAction: !useOverlay,
    };
  }

  return { getInteractionPlaybackPlan };
});
