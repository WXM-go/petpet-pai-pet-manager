(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.PetPlaybackPolicy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function shouldAutoDemo({ demoEnabled, careStatus, resting } = {}) {
    return Boolean(demoEnabled) && careStatus !== 'sleeping' && !resting;
  }

  function shouldRescheduleDemo({ demoEnabled, careStatus, resting, previousCareStatus } = {}) {
    return shouldAutoDemo({ demoEnabled, careStatus, resting })
      && careStatus !== previousCareStatus;
  }

  return { shouldAutoDemo, shouldRescheduleDemo };
});
