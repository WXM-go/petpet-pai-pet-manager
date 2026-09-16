function createRendererWebPreferences(preloadPath) {
  return {
    preload: preloadPath,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: false,
  };
}

module.exports = { createRendererWebPreferences };
