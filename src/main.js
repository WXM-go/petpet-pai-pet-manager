const { app, BrowserWindow, Menu, dialog, ipcMain, screen } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');
const PetModel = require('./pet-model');
const WindowControls = require('./window-controls');
const { resolveWithin } = require('./pet-library');
const { scanPackageTree, validatePetPackage } = require('./pet-package');
const { cleanupImportStaging, importPetDirectory, importPetZip } = require('./pet-import');
const { quantizeDirection } = require('./direction-utils');
const { COPY, formatPetTitle, formatDirectionLabel, formatScaleLabel } = require('./copy');
const { CARE_MODES, createCareModel } = require('./care-model');
const { shouldSyncBundledFiles } = require('./bundled-pet-sync');
const { createRuntimeCapabilityReport } = require('./pet-runtime');
const { createRendererWebPreferences } = require('./electron-window-options');

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('in-process-gpu');
app.disableHardwareAcceleration();
app.setName(COPY.appName);

const BASE_WINDOW_SIZE = { width: 240, height: 260 };
const DEFAULT_SETTINGS = { mouseFollow: true, keyboardAction: true, petScale: 1 };
const DEFAULT_PET_FOLDER = 'soft-blob';
const CARE_TICK_MS = 1000;

let managerWindow;
let petWindow;
let previewWindow;
let demoEnabled = true;
let petScale = 1;
let dragState = null;
let inputProcess;
let pointerTimer;
let careTimer;
let libraryRoot;
let statePath;
let bundledPetReady = false;
let state = { selectedPetFolder: DEFAULT_PET_FOLDER, settings: { ...DEFAULT_SETTINGS }, petCare: {} };
const careModels = new Map();
const packageValidationCache = new Map();

function attachRendererDiagnostics(window, label) {
  const { webContents } = window;
  webContents.on('render-process-gone', (_event, details) => {
    console.error(`[${label}] renderer process gone: ${JSON.stringify(details)}`);
  });
  webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error(`[${label}] preload error: ${preloadPath} ${error?.stack || error?.message || error}`);
  });
  webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) console.error(`[${label}] console level=${level} ${sourceId}:${line} ${message}`);
  });
  webContents.on('did-fail-load', (_event, code, description, validatedURL, isMainFrame) => {
    console.error(`[${label}] load failed: ${code} ${description} ${validatedURL} mainFrame=${isMainFrame}`);
  });
}

app.on('child-process-gone', (_event, details) => {
  console.error(`[electron] child process gone: ${JSON.stringify(details)}`);
});

function getAppRoot() {
  return app.isPackaged ? path.dirname(process.execPath) : path.resolve(__dirname, '..');
}

function ensureWritableDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true });
  const probe = path.join(directory, `.petpet-write-${process.pid}`);
  fs.writeFileSync(probe, 'ok');
  fs.rmSync(probe, { force: true });
}

function initializeStorage() {
  const localRoot = path.join(getAppRoot(), 'pets');
  try {
    ensureWritableDirectory(localRoot);
    libraryRoot = localRoot;
  } catch {
    libraryRoot = path.join(app.getPath('userData'), 'pets');
    ensureWritableDirectory(libraryRoot);
  }
  statePath = path.join(libraryRoot, '..', 'petpet-state.json');
  cleanupImportStaging(libraryRoot);
  try {
    const loaded = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    state = { ...state, ...loaded, settings: { ...DEFAULT_SETTINGS, ...(loaded.settings || {}) }, petCare: loaded.petCare || {} };
  } catch {
    // First run or an incomplete state file: use defaults.
  }
  petScale = Math.max(0.5, Math.min(1.5, Number(state.settings.petScale) || 1));
}

function getCareModel(entry) {
  if (!entry) return null;
  const existing = careModels.get(entry.folderName);
  if (existing) return existing;
  const saved = state.petCare?.[entry.folderName] || {};
  const model = createCareModel({
    mode: entry.manifest.care?.mode,
    initial: saved,
  });
  careModels.set(entry.folderName, model);
  return model;
}

function persistCare(entry, model) {
  if (!entry || !model) return;
  const careState = model.getState();
  state.petCare[entry.folderName] = {
    happiness: careState.happiness,
    satiety: careState.satiety,
    energy: careState.energy,
  };
}

function getSelectedCare() {
  const selected = getSelectedPet();
  const model = getCareModel(selected);
  return model ? { state: model.getState(), capabilities: model.getCapabilities() } : null;
}

function tickCare() {
  const selected = getSelectedPet();
  const model = getCareModel(selected);
  if (!selected || !model || model.getCapabilities().mode !== CARE_MODES.LIGHT_CARE) return;
  model.advance(CARE_TICK_MS);
  persistCare(selected, model);
  if (Math.round(model.getState().runtimeElapsedMs / CARE_TICK_MS) % 10 === 0) saveState();
  sendCommand({ type: 'care-state', value: model.getState() });
  managerWindow?.webContents.send('manager-state', getManagerState());
}

function saveState() {
  state.settings.petScale = petScale;
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
}

function copyFileIfPresent(source, target) {
  if (!fs.existsSync(source)) return;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function ensureBundledPet() {
  if (bundledPetReady) return;
  const bundledRoot = path.join(__dirname, '..', 'assets', DEFAULT_PET_FOLDER);
  const manifestPath = path.join(bundledRoot, 'pet.json');
  const manifest = validatePetPackage(bundledRoot).manifest;
  const targetRoot = path.join(libraryRoot, DEFAULT_PET_FOLDER);
  const relativePaths = [...new Set([
    'pet.json',
    manifest.spritesheetPath,
    manifest.previewPath,
    ...Object.values(manifest.care?.animations || {}),
  ].filter(Boolean))];
  const getFingerprint = (root, relativePath) => {
    const filePath = resolveWithin(root, relativePath);
    try {
      const stats = fs.statSync(filePath);
      return {
        exists: stats.isFile(),
        size: stats.size,
        content: relativePath === 'pet.json' ? fs.readFileSync(filePath, 'utf8') : undefined,
      };
    } catch {
      return { exists: false, size: 0 };
    }
  };
  const needsSync = shouldSyncBundledFiles(
    relativePaths.map((relativePath) => getFingerprint(bundledRoot, relativePath)),
    relativePaths.map((relativePath) => getFingerprint(targetRoot, relativePath)),
  );
  if (needsSync) {
    fs.mkdirSync(targetRoot, { recursive: true });
    copyFileIfPresent(manifestPath, path.join(targetRoot, 'pet.json'));
    copyFileIfPresent(resolveWithin(bundledRoot, manifest.spritesheetPath), resolveWithin(targetRoot, manifest.spritesheetPath));
    if (manifest.previewPath) copyFileIfPresent(resolveWithin(bundledRoot, manifest.previewPath), resolveWithin(targetRoot, manifest.previewPath));
    for (const relativePath of Object.values(manifest.care?.animations || {})) {
      copyFileIfPresent(resolveWithin(bundledRoot, relativePath), resolveWithin(targetRoot, relativePath));
    }
  }
  bundledPetReady = true;
}

function readPetEntry(folderName) {
  const directory = resolveWithin(libraryRoot, folderName);
  const manifestPath = path.join(directory, 'pet.json');
  if (!fs.existsSync(manifestPath)) return null;
  try {
    const tree = scanPackageTree(directory);
    const cached = packageValidationCache.get(directory);
    const report = cached?.fingerprint === tree.fingerprint
      ? cached.report
      : validatePetPackage(directory);
    packageValidationCache.set(directory, { fingerprint: report.totals.fingerprint, report });
    const manifest = report.manifest;
    const spritePath = path.join(directory, manifest.spritesheetPath);
    let previewUrl = null;
    if (report.resources.preview) {
      const previewPath = resolveWithin(directory, report.resources.preview.path);
      previewUrl = pathToFileURL(previewPath).href;
    }
    const animationUrls = {};
    for (const [name, resource] of Object.entries(report.resources.animations)) {
      const animationPath = resolveWithin(directory, resource.path);
      animationUrls[name] = pathToFileURL(animationPath).href;
    }
    return {
      folderName,
      directory,
      manifest,
      spritePath,
      spriteUrl: pathToFileURL(spritePath).href,
      previewUrl,
      animationUrls,
      runtimeCapabilities: createRuntimeCapabilityReport(report),
      bundled: folderName === DEFAULT_PET_FOLDER,
    };
  } catch {
    return null;
  }
}

function listPetEntries() {
  ensureBundledPet();
  return fs.readdirSync(libraryRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readPetEntry(entry.name))
    .filter(Boolean)
    .sort((a, b) => a.manifest.displayName.localeCompare(b.manifest.displayName, 'zh-CN'));
}

function serializePetEntry(entry) {
  return {
    folderName: entry.folderName,
    manifest: entry.manifest,
    spriteUrl: entry.spriteUrl,
    previewUrl: entry.previewUrl,
    animationUrls: entry.animationUrls,
    runtimeCapabilities: entry.runtimeCapabilities,
    bundled: entry.bundled,
  };
}

function getSelectedPet() {
  const entries = listPetEntries();
  let selected = entries.find((entry) => entry.folderName === state.selectedPetFolder);
  if (!selected) {
    selected = entries[0];
    state.selectedPetFolder = selected ? selected.folderName : null;
    saveState();
  }
  return selected;
}

function getManagerState() {
  return {
    appName: COPY.appName,
    pets: listPetEntries().map(serializePetEntry),
    selectedPetFolder: state.selectedPetFolder,
    settings: { ...state.settings, petScale },
    care: getSelectedCare(),
    petVisible: Boolean(petWindow && !petWindow.isDestroyed() && petWindow.isVisible()),
  };
}

function sendCommand(command) {
  if (petWindow && !petWindow.isDestroyed()) petWindow.webContents.send('pet-command', command);
}

function sendPetBootstrap() {
  const selected = getSelectedPet();
  if (!selected) return;
  sendCommand({ type: 'load-pet', pet: serializePetEntry(selected) });
  sendCommand({ type: 'scale', value: petScale });
  sendCommand({ type: 'demo', value: demoEnabled });
  sendCommand({ type: 'settings', value: state.settings });
  const care = getCareModel(selected);
  if (care) sendCommand({ type: 'care-state', value: care.getState() });
}

function applyPetScale(scale) {
  if (!petWindow || petWindow.isDestroyed()) return;
  petScale = Math.max(0.5, Math.min(1.5, Number(scale) || 1));
  const nextSize = WindowControls.getScaledWindowSize(BASE_WINDOW_SIZE.width, BASE_WINDOW_SIZE.height, petScale);
  const bounds = petWindow.getBounds();
  petWindow.setBounds(WindowControls.keepBottomRight(bounds, nextSize.width, nextSize.height));
  state.settings.petScale = petScale;
  saveState();
  sendCommand({ type: 'scale', value: petScale });
  managerWindow?.webContents.send('manager-state', getManagerState());
}

function handleWindowDrag(command) {
  if (!petWindow || petWindow.isDestroyed()) return;
  if (command.type === 'start') {
    const [windowX, windowY] = petWindow.getPosition();
    dragState = { windowX, windowY, startMouseX: command.screenX, startMouseY: command.screenY };
  } else if (command.type === 'move' && dragState) {
    const position = WindowControls.getDraggedPosition({
      ...dragState,
      currentMouseX: command.screenX,
      currentMouseY: command.screenY,
    });
    petWindow.setPosition(position.x, position.y);
  } else if (command.type === 'end') {
    dragState = null;
  }
}

function buildContextMenu() {
  const actionItems = PetModel.listActionIds().map((actionId) => ({
    label: PetModel.ACTIONS[actionId].label,
    click: () => sendCommand({ type: 'action', value: actionId }),
  }));
  const directionItems = PetModel.LOOK_DIRECTIONS.map((direction) => ({
    label: formatDirectionLabel(direction),
    click: () => sendCommand({ type: 'direction', value: direction }),
  }));
  const sizeItems = WindowControls.SIZE_PRESETS.map((preset) => ({
    label: formatScaleLabel(preset.scale),
    type: 'radio',
    checked: preset.scale === petScale,
    click: () => applyPetScale(preset.scale),
  }));
  return Menu.buildFromTemplate([
    { label: COPY.menu.autoDemo, type: 'checkbox', checked: demoEnabled, click: (item) => { demoEnabled = item.checked; sendCommand({ type: 'demo', value: demoEnabled }); } },
    { type: 'separator' },
    { label: COPY.menu.playAction, submenu: actionItems },
    { label: COPY.menu.observeDirection, submenu: directionItems },
    { label: COPY.menu.petSize, submenu: sizeItems },
    { type: 'separator' },
    { label: COPY.menu.openManager, click: () => managerWindow?.show() },
    { label: COPY.menu.openPreview, click: () => openPreviewWindow() },
    { label: COPY.menu.pauseResume, click: () => sendCommand({ type: 'toggle-pause' }) },
    { type: 'separator' },
    { label: COPY.menu.quit, role: 'quit' },
  ]);
}

function interactWithSelectedPet(kind) {
  const selected = getSelectedPet();
  const model = getCareModel(selected);
  if (!selected || !model) return getManagerState();
  const next = model.interact(kind);
  persistCare(selected, model);
  saveState();
  sendCommand({ type: 'care-state', value: next });
  sendCommand({ type: 'interaction', value: kind });
  managerWindow?.webContents.send('manager-state', getManagerState());
  return getManagerState();
}

function openPreviewWindow() {
  if (previewWindow && !previewWindow.isDestroyed()) {
    previewWindow.focus();
    return;
  }
  previewWindow = new BrowserWindow({
    width: 980,
    height: 760,
    minWidth: 720,
    minHeight: 560,
    title: COPY.previewTitle,
    backgroundColor: '#f4f7fb',
    webPreferences: createRendererWebPreferences(path.join(__dirname, 'preload.js')),
  });
  attachRendererDiagnostics(previewWindow, 'preview');
  previewWindow.loadFile(path.join(app.getAppPath(), 'preview.html')).catch((error) => {
    console.error(`[preview] load error: ${error.stack || error.message}`);
  });
  previewWindow.on('closed', () => { previewWindow = null; });
}

function createPetWindow() {
  petWindow = new BrowserWindow({
    ...BASE_WINDOW_SIZE,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    show: false,
    webPreferences: createRendererWebPreferences(path.join(__dirname, 'preload.js')),
  });
  attachRendererDiagnostics(petWindow, 'pet');
  petWindow.loadFile(path.join(app.getAppPath(), 'index.html')).catch((error) => {
    console.error(`[pet] load error: ${error.stack || error.message}`);
  });
  const placeAndShow = () => {
    const area = screen.getPrimaryDisplay().workArea;
    const bounds = petWindow.getBounds();
    petWindow.setPosition(area.x + area.width - bounds.width - 20, area.y + area.height - bounds.height - 40);
    if (!petWindow.isVisible()) petWindow.show();
  };
  petWindow.once('ready-to-show', placeAndShow);
  petWindow.webContents.once('did-finish-load', placeAndShow);
  petWindow.webContents.on('did-fail-load', (_event, code, description) => console.error(`桌宠页面加载失败: ${code} ${description}`));
  petWindow.on('closed', () => { petWindow = null; });
}

function createManagerWindow() {
  managerWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 980,
    minHeight: 700,
    title: COPY.managerTitle,
    backgroundColor: '#f7f8fc',
    webPreferences: createRendererWebPreferences(path.join(__dirname, 'preload.js')),
  });
  attachRendererDiagnostics(managerWindow, 'manager');
  managerWindow.loadFile(path.join(app.getAppPath(), 'manager.html')).catch((error) => {
    console.error(`[manager] load error: ${error.stack || error.message}`);
  });
  managerWindow.on('closed', () => { managerWindow = null; });
}

async function chooseAndImport(kind) {
  const options = { properties: kind === 'zip' ? ['openFile'] : ['openDirectory'] };
  if (kind === 'zip') options.filters = [{ name: '桌宠包', extensions: ['zip'] }];
  const result = await dialog.showOpenDialog(managerWindow, options);
  if (result.canceled || !result.filePaths[0]) return null;
  const imported = kind === 'zip'
    ? await importPetZip(result.filePaths[0], { libraryRoot, tempRoot: app.getPath('temp') })
    : importPetDirectory(result.filePaths[0], { libraryRoot });
  const entry = readPetEntry(imported.folderName);
  if (!entry) throw new Error('导入后的桌宠校验失败');
  managerWindow?.webContents.send('manager-state', getManagerState());
  return serializePetEntry(entry);
}

function selectPet(folderName) {
  const entry = readPetEntry(folderName);
  if (!entry) throw new Error(COPY.errors.petNotFound);
  state.selectedPetFolder = folderName;
  saveState();
  sendPetBootstrap();
  if (petWindow && !petWindow.isVisible()) petWindow.show();
  managerWindow?.webContents.send('manager-state', getManagerState());
  return serializePetEntry(entry);
}

function deletePet(folderName) {
  if (folderName === DEFAULT_PET_FOLDER) throw new Error(COPY.errors.cannotDeleteDefault);
  const entry = readPetEntry(folderName);
  if (!entry) throw new Error(COPY.errors.petMissing);
  fs.rmSync(entry.directory, { recursive: true, force: true });
  if (state.selectedPetFolder === folderName) {
    state.selectedPetFolder = DEFAULT_PET_FOLDER;
    saveState();
    sendPetBootstrap();
  }
  managerWindow?.webContents.send('manager-state', getManagerState());
  return getManagerState();
}

const POWER_SHELL_KEYBOARD_MONITOR = String.raw`
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class PetPetKeyboardMonitor {
  private delegate IntPtr KeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);
  private static KeyboardProc callback = HookCallback;
  private static IntPtr hook = IntPtr.Zero;
  private static long lastSent = 0;
  [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)] private static extern IntPtr SetWindowsHookEx(int idHook, KeyboardProc callback, IntPtr module, uint threadId);
  [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)] private static extern bool UnhookWindowsHookEx(IntPtr hook);
  [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)] private static extern IntPtr CallNextHookEx(IntPtr hook, int nCode, IntPtr wParam, IntPtr lParam);
  [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)] private static extern IntPtr GetModuleHandle(string name);
  [DllImport("user32.dll")] private static extern int GetMessage(out Message message, IntPtr window, uint min, uint max);
  [DllImport("user32.dll")] private static extern bool TranslateMessage(ref Message message);
  [DllImport("user32.dll")] private static extern IntPtr DispatchMessage(ref Message message);
  private static IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam) {
    if (nCode >= 0) {
      long now = Environment.TickCount64;
      if (now - lastSent >= 450) { Console.WriteLine("{\"type\":\"keyboardActivity\"}"); Console.Out.Flush(); lastSent = now; }
    }
    return CallNextHookEx(hook, nCode, wParam, lParam);
  }
  public static void Run() {
    hook = SetWindowsHookEx(13, callback, GetModuleHandle(null), 0);
    if (hook == IntPtr.Zero) return;
    Message message;
    while (GetMessage(out message, IntPtr.Zero, 0, 0) > 0) { TranslateMessage(ref message); DispatchMessage(ref message); }
    UnhookWindowsHookEx(hook);
  }
  [StructLayout(LayoutKind.Sequential)] private struct Message { public IntPtr window; public uint message; public IntPtr wParam; public IntPtr lParam; public uint time; public int x; public int y; }
}
'@
[PetPetKeyboardMonitor]::Run()
`;

function startInputMonitor() {
  if (process.platform !== 'win32') return;
  const encoded = Buffer.from(POWER_SHELL_KEYBOARD_MONITOR, 'utf16le').toString('base64');
  inputProcess = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
  inputProcess.stdout.setEncoding('utf8');
  let buffer = '';
  inputProcess.stdout.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) if (line.trim() === '{"type":"keyboardActivity"}' && state.settings.keyboardAction) sendCommand({ type: 'keyboard-action' });
  });
  inputProcess.on('error', (error) => console.warn(`键盘活动监听不可用: ${error.message}`));
}

function stopInputMonitor() {
  if (inputProcess && !inputProcess.killed) inputProcess.kill();
  inputProcess = null;
}

function updatePointerDirection() {
  if (!petWindow || petWindow.isDestroyed() || !state.settings.mouseFollow) return;
  const cursor = screen.getCursorScreenPoint();
  const bounds = petWindow.getBounds();
  const dx = cursor.x - (bounds.x + bounds.width / 2);
  const dy = cursor.y - (bounds.y + bounds.height / 2);
  const candidate = Math.hypot(dx, dy) < 12 ? '000' : quantizeDirection(dx, dy);
  if (candidate === updatePointerDirection.lastCandidate) updatePointerDirection.stableCount += 1;
  else { updatePointerDirection.lastCandidate = candidate; updatePointerDirection.stableCount = 0; }
  if (candidate !== updatePointerDirection.current && updatePointerDirection.stableCount >= 2) {
    updatePointerDirection.current = candidate;
    sendCommand({ type: 'pointer-direction', value: candidate });
  }
}
updatePointerDirection.current = '000';
updatePointerDirection.lastCandidate = '000';
updatePointerDirection.stableCount = 0;

function startPointerMonitor() { pointerTimer = setInterval(updatePointerDirection, 50); }
function stopPointerMonitor() { if (pointerTimer) clearInterval(pointerTimer); pointerTimer = null; }
function startCareMonitor() { careTimer = setInterval(tickCare, CARE_TICK_MS); }
function stopCareMonitor() { if (careTimer) clearInterval(careTimer); careTimer = null; }

function registerIpc() {
  ipcMain.on('show-context-menu', () => buildContextMenu().popup({ window: petWindow }));
  ipcMain.handle('pet:interact', (_event, kind) => interactWithSelectedPet(kind));
  ipcMain.on('window-drag', (_event, command) => handleWindowDrag(command));
  ipcMain.on('renderer-ready', () => sendPetBootstrap());
  ipcMain.handle('manager:get-state', () => getManagerState());
  ipcMain.handle('manager:import-zip', () => chooseAndImport('zip'));
  ipcMain.handle('manager:import-folder', () => chooseAndImport('folder'));
  ipcMain.handle('manager:select-pet', (_event, folderName) => selectPet(folderName));
  ipcMain.handle('manager:delete-pet', async (_event, folderName) => {
    const answer = await dialog.showMessageBox(managerWindow, { type: 'question', buttons: [COPY.menu.delete, COPY.menu.cancel], defaultId: 1, cancelId: 1, title: COPY.menu.delete, message: COPY.errors.deleteConfirm });
    return answer.response === 0 ? deletePet(folderName) : getManagerState();
  });
  ipcMain.handle('manager:run-pet', () => { petWindow?.show(); return getManagerState(); });
  ipcMain.handle('manager:hide-pet', () => { petWindow?.hide(); return getManagerState(); });
  ipcMain.handle('manager:toggle-pause', () => { sendCommand({ type: 'toggle-pause' }); return getManagerState(); });
  ipcMain.handle('manager:action', (_event, action) => { sendCommand({ type: 'action', value: action }); return getManagerState(); });
  ipcMain.handle('manager:interact', (_event, kind) => interactWithSelectedPet(kind));
  ipcMain.handle('manager:setting', (_event, key, value) => {
    if (!(key in state.settings)) throw new Error(COPY.errors.unknownSetting);
    state.settings[key] = Boolean(value);
    if (key === 'mouseFollow' && !state.settings.mouseFollow) sendCommand({ type: 'direction', value: '000' });
    saveState();
    sendCommand({ type: 'settings', value: state.settings });
    managerWindow?.webContents.send('manager-state', getManagerState());
    return getManagerState();
  });
  ipcMain.handle('manager:scale', (_event, value) => { applyPetScale(value); return getManagerState(); });
  ipcMain.handle('manager:preview', () => { openPreviewWindow(); return true; });
  ipcMain.handle('preview:get-pet', () => {
    const selected = getSelectedPet();
    return selected ? serializePetEntry(selected) : null;
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  registerIpc();
  initializeStorage();
  ensureBundledPet();
  createPetWindow();
  createManagerWindow();
  // Input monitors are enabled after the windows have fully initialized.
  setTimeout(() => {
    startPointerMonitor();
    startInputMonitor();
    startCareMonitor();
  }, 1200);
});

app.on('before-quit', () => { stopPointerMonitor(); stopInputMonitor(); stopCareMonitor(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
