const CARE_MODES = Object.freeze({
  INTERACTION: 'interaction',
  LIGHT_CARE: 'light-care',
  FULL_CARE: 'full-care',
});

const DEFAULT_CARE_CONFIG = Object.freeze({
  happiness: 80,
  satiety: 80,
  energy: 80,
  min: 20,
  max: 100,
  decay: Object.freeze({
    satietyMs: 10 * 60 * 1000,
    energyMs: 15 * 60 * 1000,
    happinessMs: 20 * 60 * 1000,
  }),
  sleepEnergyMs: 2 * 60 * 1000,
  drowsyAfterMs: 10 * 60 * 1000,
  sleepingAfterMs: 20 * 60 * 1000,
});

function clamp(value, config) {
  const number = Number.isFinite(value) ? value : config.min;
  return Math.max(config.min, Math.min(config.max, number));
}

function normalizeMode(mode) {
  return mode === CARE_MODES.LIGHT_CARE || mode === CARE_MODES.FULL_CARE
    ? mode
    : CARE_MODES.INTERACTION;
}

function validateIntervals(config) {
  const intervals = [
    config.decay.satietyMs,
    config.decay.energyMs,
    config.decay.happinessMs,
    config.sleepEnergyMs,
    config.drowsyAfterMs,
    config.sleepingAfterMs,
  ];
  if (intervals.some((interval) => !Number.isFinite(interval) || interval <= 0)) {
    throw new RangeError('Care model time intervals must be finite positive numbers');
  }
}

function createCareModel(options = {}) {
  const config = { ...DEFAULT_CARE_CONFIG, ...(options.config || {}) };
  config.decay = { ...DEFAULT_CARE_CONFIG.decay, ...((options.config || {}).decay || {}) };
  validateIntervals(config);
  const mode = normalizeMode(options.mode);
  const isLightCare = mode === CARE_MODES.LIGHT_CARE;
  const initial = options.initial || {};
  let resting = false;
  let sleepRecoveryRemainderMs = 0;
  const state = {
    mode,
    status: 'awake',
    happiness: clamp(initial.happiness ?? config.happiness, config),
    satiety: clamp(initial.satiety ?? config.satiety, config),
    energy: clamp(initial.energy ?? config.energy, config),
    lastInteractionAt: Number.isFinite(options.lastInteractionAt) ? options.lastInteractionAt : 0,
    runtimeElapsedMs: 0,
  };

  function snapshot() {
    return { ...state };
  }

  function getCapabilities() {
    return {
      mode,
      interaction: true,
      lightCare: isLightCare,
      fullCare: mode === CARE_MODES.FULL_CARE,
      stats: isLightCare ? ['happiness', 'satiety', 'energy'] : [],
    };
  }

  function advance(elapsedMs = 0) {
    const elapsed = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0;
    if (!isLightCare) return snapshot();

    const wasSleeping = state.status === 'sleeping';
    const previousRuntime = state.runtimeElapsedMs;
    const previousIdleMs = previousRuntime - state.lastInteractionAt;
    state.runtimeElapsedMs += elapsed;
    state.satiety = clamp(
      state.satiety - (Math.floor(state.runtimeElapsedMs / config.decay.satietyMs)
        - Math.floor(previousRuntime / config.decay.satietyMs)), config,
    );
    state.energy = clamp(
      state.energy - (Math.floor(state.runtimeElapsedMs / config.decay.energyMs)
        - Math.floor(previousRuntime / config.decay.energyMs)), config,
    );
    state.happiness = clamp(
      state.happiness - (Math.floor(state.runtimeElapsedMs / config.decay.happinessMs)
        - Math.floor(previousRuntime / config.decay.happinessMs)), config,
    );
    const currentIdleMs = state.runtimeElapsedMs - state.lastInteractionAt;
    const sleepingRecoveryMs = resting || wasSleeping
      ? elapsed
      : Math.max(0, currentIdleMs - config.sleepingAfterMs)
        - Math.max(0, previousIdleMs - config.sleepingAfterMs);
    const totalSleepRecoveryMs = sleepRecoveryRemainderMs + sleepingRecoveryMs;
    const recoveredEnergy = Math.floor(totalSleepRecoveryMs / config.sleepEnergyMs);
    sleepRecoveryRemainderMs = totalSleepRecoveryMs % config.sleepEnergyMs;
    state.energy = clamp(state.energy + recoveredEnergy, config);

    const idleMs = currentIdleMs;
    if (resting) state.status = 'sleeping';
    else if (idleMs >= config.sleepingAfterMs) state.status = 'sleeping';
    else if (idleMs >= config.drowsyAfterMs) state.status = 'drowsy';
    else state.status = 'awake';
    return snapshot();
  }

  function interact(kind) {
    if (!isLightCare) return snapshot();
    state.lastInteractionAt = state.runtimeElapsedMs;
    if (kind === 'rest') {
      resting = true;
      sleepRecoveryRemainderMs = 0;
      state.status = 'sleeping';
      return snapshot();
    }
    resting = false;
    sleepRecoveryRemainderMs = 0;
    state.status = 'awake';
    if (kind === 'pet') state.happiness = clamp(state.happiness + 8, config);
    if (kind === 'feed') {
      state.satiety = clamp(state.satiety + 20, config);
      state.happiness = clamp(state.happiness + 3, config);
    }
    if (kind === 'play') {
      state.happiness = clamp(state.happiness + 15, config);
      state.energy = clamp(state.energy - 8, config);
      state.satiety = clamp(state.satiety - 4, config);
    }
    return snapshot();
  }

  return {
    advance,
    interact,
    getCapabilities,
    getState: snapshot,
  };
}

module.exports = { CARE_MODES, DEFAULT_CARE_CONFIG, createCareModel };
