(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.PetPlaybackPolicy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function shouldAutoDemo({ demoEnabled, careStatus } = {}) {
    return Boolean(demoEnabled) && careStatus !== 'sleeping';
  }

  return { shouldAutoDemo };
});
