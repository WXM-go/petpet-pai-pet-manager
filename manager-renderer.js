const { COPY, formatScaleLabel } = PetPetCopy;

const ACTIONS = [
  ['idle', '待机'], ['running-right', '向右跑'], ['running-left', '向左跑'], ['waving', '挥手'],
  ['jumping', '跳跃'], ['failed', '失败'], ['waiting', '等待'], ['running', '处理中'], ['review', '检查'],
];

const grid = document.getElementById('pet-grid');
const selectedName = document.getElementById('selected-name');
const selectedDescription = document.getElementById('selected-description');
const detailName = document.getElementById('detail-name');
const detailDescription = document.getElementById('detail-description');
const heroCanvas = document.querySelector('#hero-preview canvas');
const petCount = document.getElementById('pet-count');
const toast = document.getElementById('toast');
const mouseToggle = document.getElementById('mouse-follow-toggle');
const keyboardToggle = document.getElementById('keyboard-action-toggle');
const scaleSelect = document.getElementById('scale-select');
const searchInput = document.getElementById('pet-search');
const filterSelect = document.getElementById('pet-filter');
let appState = null;
let toastTimer;

const CARE_MODE_LABELS = Object.freeze({ interaction: '即时互动', 'light-care': '轻养成', 'full-care': '完整养成' });
const CARE_STATUS_LABELS = Object.freeze({ awake: '准备好陪你', drowsy: '有点困了', sleeping: '正在睡觉' });

function showToast(message, isError = false) {
  toast.textContent = message;
  toast.style.background = isError ? '#b84d64' : '#2c3650';
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2800);
}

function drawPetPreview(canvas, pet) {
  if (!pet) return;
  const image = new Image();
  const mode = pet.manifest.renderingMode || 'pixelated';
  canvas.classList.toggle('smooth', mode === 'smooth');
  canvas.classList.toggle('pixelated', mode !== 'smooth');
  image.onload = () => {
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = mode === 'smooth';
    context.drawImage(image, 0, 0, 192, 208, 0, 0, canvas.width, canvas.height);
  };
  image.src = pet.spriteUrl;
}

function getCapability(pet) {
  return pet?.manifest?.care || { mode: 'interaction', interactions: [] };
}

function getVisiblePets() {
  const query = searchInput.value.trim().toLocaleLowerCase('zh-CN');
  const filter = filterSelect.value;
  return (appState?.pets || []).filter((pet) => {
    const care = getCapability(pet);
    const matchesQuery = !query || `${pet.manifest.displayName} ${pet.manifest.description}`.toLocaleLowerCase('zh-CN').includes(query);
    const matchesFilter = filter === 'all'
      || (filter === 'care' && care.mode !== 'interaction')
      || (filter === 'basic' && care.mode === 'interaction');
    return matchesQuery && matchesFilter;
  });
}

function createCard(pet) {
  const card = document.createElement('article');
  card.className = `pet-card${pet.folderName === appState.selectedPetFolder ? ' selected' : ''}`;
  card.dataset.folder = pet.folderName;
  card.tabIndex = 0;
  const thumb = document.createElement('div');
  thumb.className = 'pet-thumb';
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 104;
  thumb.append(canvas);
  const title = document.createElement('h4');
  title.textContent = pet.manifest.displayName;
  const description = document.createElement('p');
  description.textContent = pet.manifest.description || '可以在桌面陪伴你的桌宠。';
  const type = document.createElement('span');
  type.className = 'pet-type';
  type.textContent = CARE_MODE_LABELS[getCapability(pet).mode] || CARE_MODE_LABELS.interaction;
  const deleteButton = document.createElement('button');
  deleteButton.className = 'delete-card';
  deleteButton.type = 'button';
  deleteButton.textContent = '×';
  deleteButton.title = pet.bundled ? COPY.errors.cannotDeleteDefault : COPY.menu.delete;
  deleteButton.disabled = pet.bundled;
  deleteButton.addEventListener('click', async (event) => {
    event.stopPropagation();
    if (pet.bundled) return;
    try { appState = await window.managerAPI.deletePet(pet.folderName); render(); }
    catch (error) { showToast(error.message || COPY.errors.deleteFailed, true); }
  });
  card.append(thumb, title, description, type, deleteButton);
  const select = async () => {
    try { await window.managerAPI.selectPet(pet.folderName); appState = await window.managerAPI.getState(); render(); }
    catch (error) { showToast(error.message || COPY.errors.selectFailed, true); }
  };
  card.addEventListener('click', select);
  card.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); } });
  drawPetPreview(canvas, pet);
  return card;
}

function renderCare(care) {
  const state = care?.state;
  const mode = care?.capabilities?.mode || 'interaction';
  document.getElementById('capability-badge').textContent = CARE_MODE_LABELS[mode] || CARE_MODE_LABELS.interaction;
  document.getElementById('care-status-label').textContent = state ? (CARE_STATUS_LABELS[state.status] || CARE_STATUS_LABELS.awake) : '即时互动';
  const supported = new Set(care?.capabilities?.stats || (mode === 'light-care' ? ['happiness', 'satiety', 'energy'] : []));
  for (const stat of ['happiness', 'satiety', 'energy']) {
    const row = document.querySelector(`[data-stat="${stat}"]`);
    const value = state && supported.has(stat) ? Math.round(state[stat]) : null;
    row.querySelector('strong').textContent = value === null ? '—' : `${value}`;
    row.querySelector('.stat-track i').style.width = value === null ? '0%' : `${value}%`;
    row.hidden = value === null;
  }
  const note = document.getElementById('care-note');
  if (mode === 'light-care') note.textContent = '状态只在派派运行时变化，不会因为暂时离开而惩罚你。';
  else if (mode === 'full-care') note.textContent = '这个桌宠声明了完整养成能力，更多玩法将由后续扩展提供。';
  else note.textContent = '这个桌宠没有长期状态，但仍可进行即时互动。';
}

function renderActions(selected) {
  const box = document.getElementById('action-list');
  box.replaceChildren();
  ACTIONS.forEach(([id, label]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'action-button';
    button.textContent = label;
    button.addEventListener('click', async () => {
      try { appState = await window.managerAPI.playAction(id); render(); }
      catch (error) { showToast(error.message || '动作播放失败', true); }
    });
    box.append(button);
  });
  document.getElementById('action-title').textContent = selected ? '动作' : '动作（暂无桌宠）';
}

function renderHero(pet) {
  if (!pet) {
    selectedName.textContent = '还没有桌宠';
    selectedDescription.textContent = '点击右上角“导入桌宠”，添加朋友发来的桌宠包。';
    detailName.textContent = '还没有桌宠';
    detailDescription.textContent = '导入桌宠后，这里会显示它的能力和陪伴状态。';
    return;
  }
  selectedName.textContent = pet.manifest.displayName;
  selectedDescription.textContent = pet.manifest.description || '一个可以在桌面陪伴你的桌宠。';
  detailName.textContent = pet.manifest.displayName;
  detailDescription.textContent = pet.manifest.description || '一个可以在桌面陪伴你的桌宠。';
  drawPetPreview(heroCanvas, pet);
}

function render() {
  if (!appState) return;
  const selected = appState.pets.find((pet) => pet.folderName === appState.selectedPetFolder) || appState.pets[0];
  const visiblePets = getVisiblePets();
  petCount.textContent = `${appState.pets.length} 只`;
  renderHero(selected);
  renderCare(appState.care);
  renderActions(selected);
  grid.replaceChildren();
  if (!visiblePets.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = appState.pets.length ? '没有找到符合条件的桌宠。' : '还没有可用桌宠，点击“导入桌宠”开始添加。';
    grid.append(empty);
  } else visiblePets.forEach((pet) => grid.append(createCard(pet)));
  mouseToggle.checked = Boolean(appState.settings.mouseFollow);
  keyboardToggle.checked = Boolean(appState.settings.keyboardAction);
  scaleSelect.value = String(appState.settings.petScale || 1);
  document.getElementById('hide-button').disabled = !appState.petVisible;
  document.getElementById('pet-status-line').textContent = appState.petVisible ? '桌宠正在桌面陪伴你' : '桌宠目前已隐藏';
}

async function refresh() { appState = await window.managerAPI.getState(); render(); }

async function importWith(method, successMessage) {
  try {
    const imported = await method();
    if (imported) showToast(`${successMessage}：${imported.manifest.displayName}`);
    await refresh();
  } catch (error) { showToast(error.message || COPY.errors.importFailed, true); }
}

document.getElementById('import-zip-button').addEventListener('click', () => importWith(window.managerAPI.importZip, '导入成功'));
document.getElementById('more-import-button').addEventListener('click', () => importWith(window.managerAPI.importFolder, '导入成功'));
document.getElementById('preview-button').addEventListener('click', () => window.managerAPI.openPreview());
document.getElementById('open-action-preview').addEventListener('click', () => window.managerAPI.openPreview());
document.getElementById('run-button').addEventListener('click', async () => { appState = await window.managerAPI.runPet(); render(); });
document.getElementById('hide-button').addEventListener('click', async () => { appState = await window.managerAPI.hidePet(); render(); });
document.getElementById('pause-button').addEventListener('click', async () => { appState = await window.managerAPI.togglePause(); render(); });
mouseToggle.addEventListener('change', async () => { appState = await window.managerAPI.setSetting('mouseFollow', mouseToggle.checked); render(); });
keyboardToggle.addEventListener('change', async () => { appState = await window.managerAPI.setSetting('keyboardAction', keyboardToggle.checked); render(); });
scaleSelect.addEventListener('change', async () => { appState = await window.managerAPI.setScale(Number(scaleSelect.value)); render(); });
searchInput.addEventListener('input', render);
filterSelect.addEventListener('change', render);
document.querySelectorAll('[data-interaction]').forEach((button) => button.addEventListener('click', async () => {
  try { appState = await window.managerAPI.interact(button.dataset.interaction); render(); showToast(`${button.textContent.trim()}完成了`); }
  catch (error) { showToast(error.message || '互动失败，请稍后再试', true); }
}));
document.querySelectorAll('[data-scroll]').forEach((button) => button.addEventListener('click', () => document.getElementById(button.dataset.scroll)?.scrollIntoView({ behavior: 'smooth', block: 'start' })));

window.managerAPI.onState((nextState) => { appState = nextState; render(); });
window.managerAPI.getState().then((nextState) => { appState = nextState; render(); }).catch((error) => showToast(error.message || COPY.errors.managerInitFailed, true));
