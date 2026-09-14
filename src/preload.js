const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petAPI', {
  showContextMenu: () => ipcRenderer.send('show-context-menu'),
  interact: (kind) => ipcRenderer.invoke('pet:interact', kind),
  windowDrag: (command) => ipcRenderer.send('window-drag', command),
  onCommand: (callback) => ipcRenderer.on('pet-command', (_event, command) => callback(command)),
  rendererReady: () => ipcRenderer.send('renderer-ready'),
});

contextBridge.exposeInMainWorld('managerAPI', {
  getState: () => ipcRenderer.invoke('manager:get-state'),
  importZip: () => ipcRenderer.invoke('manager:import-zip'),
  importFolder: () => ipcRenderer.invoke('manager:import-folder'),
  selectPet: (folderName) => ipcRenderer.invoke('manager:select-pet', folderName),
  deletePet: (folderName) => ipcRenderer.invoke('manager:delete-pet', folderName),
  runPet: () => ipcRenderer.invoke('manager:run-pet'),
  hidePet: () => ipcRenderer.invoke('manager:hide-pet'),
  togglePause: () => ipcRenderer.invoke('manager:toggle-pause'),
  playAction: (action) => ipcRenderer.invoke('manager:action', action),
  interact: (kind) => ipcRenderer.invoke('manager:interact', kind),
  setSetting: (key, value) => ipcRenderer.invoke('manager:setting', key, value),
  setScale: (value) => ipcRenderer.invoke('manager:scale', value),
  openPreview: () => ipcRenderer.invoke('manager:preview'),
  getPreviewPet: () => ipcRenderer.invoke('preview:get-pet'),
  onState: (callback) => ipcRenderer.on('manager-state', (_event, state) => callback(state)),
});
