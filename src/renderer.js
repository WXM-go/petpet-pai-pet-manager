const DEMO_ACTIONS = ['waving', 'jumping', 'running', 'review', 'waiting', 'running-right', 'running-left'];
const { shouldAutoDemo } = PetPlaybackPolicy;
const { getInteractionPlaybackPlan } = PetInteractionLayer;
const canvas = document.getElementById('pet-canvas');
const status = document.getElementById('status');
const dragSurface = document.querySelector('.pet-stage');
const interactionBubble = document.getElementById('interaction-bubble');
const careAnimation = document.getElementById('care-animation');
const player = PetPlayer.createPetPlayer({
  canvas,
  spriteUrl: 'assets/soft-blob/spritesheet.webp',
  renderingMode: 'pixelated',
  onStateChange: (state) => {
    status.textContent = state.mode === 'look' ? `${state.direction}°` : PetModel.ACTIONS[state.action].label;
  },
});

let demoTimer;
let demoIndex = 0;
let isDragging = false;
let inputSettings = { mouseFollow: true, keyboardAction: true };
let currentPet = null;
let dragStart = null;
let hasDragged = false;
let careAnimationTimer;
let lastCareStatus;

function setPetScale(scale) {
  const root = document.documentElement;
  const normalizedScale = Math.max(0.5, Math.min(1.5, Number(scale) || 1));
  root.style.setProperty('--pet-width', `${Math.round(240 * normalizedScale)}px`);
  root.style.setProperty('--pet-height', `${Math.round(260 * normalizedScale)}px`);
  root.style.setProperty('--handle-left', `${Math.round(30 * normalizedScale)}px`);
  root.style.setProperty('--handle-width', `${Math.round(180 * normalizedScale)}px`);
  root.style.setProperty('--handle-height', `${Math.round(22 * normalizedScale)}px`);
  root.dataset.petScale = normalizedScale <= 0.5 ? 'tiny' : 'normal';
}

function setRenderingMode(mode) {
  canvas.classList.toggle('smooth', mode === 'smooth');
  canvas.classList.toggle('pixelated', mode !== 'smooth');
}

function toggleInteractionBubble(force) {
  const visible = force ?? !interactionBubble.classList.contains('visible');
  interactionBubble.classList.toggle('visible', visible);
  interactionBubble.setAttribute('aria-hidden', String(!visible));
}

function playInteraction(kind) {
  const animationUrl = currentPet?.animationUrls?.[kind];
  const playbackPlan = getInteractionPlaybackPlan(animationUrl);
  if (playbackPlan.useOverlay) {
    player.setAction('idle', { loops: 0 });
    showCareAnimation(animationUrl, kind === 'rest' ? 1800 : 1200);
    return;
  }
  const action = currentPet?.manifest?.care?.actionMap?.[kind]
    || ({ pet: 'waving', feed: 'waiting', play: 'jumping', rest: 'idle' }[kind]);
  if (playbackPlan.playAtlasAction && action && PetModel.ACTIONS[action]) {
    player.setAction(action, { loops: action === 'idle' ? 0 : 1 });
  }
}

function setCareAnimationVisible(visible) {
  careAnimation.classList.toggle('visible', visible);
  canvas.classList.toggle('care-animation-active', visible);
}

function showCareAnimation(animationUrl, durationMs) {
  clearTimeout(careAnimationTimer);
  clearTimeout(demoTimer);
  careAnimation.src = `${animationUrl}?t=${Date.now()}`;
  setCareAnimationVisible(true);
  careAnimationTimer = setTimeout(() => {
    setCareAnimationVisible(false);
    scheduleDemo();
  }, durationMs);
}

function scheduleDemo() {
  clearTimeout(demoTimer);
  if (!shouldAutoDemo({ demoEnabled: player.state.demo, careStatus: lastCareStatus })) return;
  demoTimer = setTimeout(() => {
    player.setAction(DEMO_ACTIONS[demoIndex % DEMO_ACTIONS.length], { loops: 1 });
    demoIndex += 1;
    scheduleDemo();
  }, 9000);
}

window.petAPI.onCommand((command) => {
  if (command.type === 'load-pet') {
    currentPet = command.pet;
    lastCareStatus = undefined;
    setRenderingMode(command.pet.manifest.renderingMode);
    player.setSpriteUrl(command.pet.spriteUrl, command.pet.manifest.renderingMode);
    document.title = `${command.pet.manifest.displayName} · 派派`;
    scheduleDemo();
  } else if (command.type === 'action') {
    player.setAction(command.value, { loops: command.value === 'idle' ? 0 : 1 });
    scheduleDemo();
  } else if (command.type === 'direction') {
    player.setDirection(command.value);
    scheduleDemo();
  } else if (command.type === 'pointer-direction') {
    if (inputSettings.mouseFollow) player.setPointerDirection(command.value);
  } else if (command.type === 'keyboard-action') {
    if (inputSettings.keyboardAction && lastCareStatus !== 'sleeping') {
      player.setAction('running', { loops: 1 });
      scheduleDemo();
    }
  } else if (command.type === 'settings') {
    inputSettings = { ...inputSettings, ...command.value };
    if (!inputSettings.mouseFollow) player.setDirection('000');
  } else if (command.type === 'demo') {
    player.setDemo(command.value);
    if (command.value) scheduleDemo(); else clearTimeout(demoTimer);
  } else if (command.type === 'toggle-pause') {
    player.setPaused(!player.state.paused);
  } else if (command.type === 'scale') {
    setPetScale(command.value);
  } else if (command.type === 'interaction') {
    playInteraction(command.value);
  } else if (command.type === 'care-state') {
    const statusLabel = { drowsy: '犯困了', sleeping: '睡着了', awake: '' }[command.value?.status] || '';
    status.textContent = statusLabel;
    status.style.opacity = statusLabel ? '1' : '0';
    const nextStatus = command.value?.status;
    if (nextStatus === 'sleeping') {
      clearTimeout(demoTimer);
      player.setAction('idle', { loops: 0 });
    }
    if (nextStatus !== lastCareStatus && (nextStatus === 'drowsy' || nextStatus === 'sleeping')) {
      const animationUrl = currentPet?.animationUrls?.[nextStatus];
      if (animationUrl) showCareAnimation(animationUrl, nextStatus === 'sleeping' ? 1800 : 1400);
    }
    lastCareStatus = nextStatus;
    if (nextStatus !== 'sleeping') scheduleDemo();
  }
});

dragSurface.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  if (event.target.closest('.interaction-bubble')) return;
  isDragging = true;
  hasDragged = false;
  dragStart = { x: event.screenX, y: event.screenY };
  dragSurface.setPointerCapture(event.pointerId);
  window.petAPI.windowDrag({ type: 'start', screenX: event.screenX, screenY: event.screenY });
});

dragSurface.addEventListener('pointermove', (event) => {
  if (!isDragging) return;
  if (dragStart && Math.hypot(event.screenX - dragStart.x, event.screenY - dragStart.y) > 4) hasDragged = true;
  window.petAPI.windowDrag({ type: 'move', screenX: event.screenX, screenY: event.screenY });
});

function endDragging(event) {
  if (!isDragging || (event && event.button !== 0)) return;
  isDragging = false;
  window.petAPI.windowDrag({ type: 'end' });
  if (!hasDragged) toggleInteractionBubble();
  dragStart = null;
}

dragSurface.addEventListener('pointerup', endDragging);
dragSurface.addEventListener('pointercancel', endDragging);

window.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  window.petAPI.showContextMenu();
});

interactionBubble.addEventListener('pointerdown', (event) => event.stopPropagation());
interactionBubble.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-interaction]');
  if (!button) return;
  toggleInteractionBubble(false);
  try { await window.petAPI.interact(button.dataset.interaction); }
  catch { status.textContent = '互动失败'; status.style.opacity = '1'; }
});

document.addEventListener('pointerdown', (event) => {
  if (!event.target.closest('#interaction-bubble') && !event.target.closest('.pet-stage')) toggleInteractionBubble(false);
});

window.petAPI.rendererReady();
scheduleDemo();
