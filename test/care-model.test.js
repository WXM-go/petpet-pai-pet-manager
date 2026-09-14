const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CARE_MODES,
  DEFAULT_CARE_CONFIG,
  createCareModel,
} = require('../src/care-model');

const stateOf = (model) => model.getState();

test('exports the three care modes and default light-care configuration', () => {
  assert.deepEqual(CARE_MODES, {
    INTERACTION: 'interaction',
    LIGHT_CARE: 'light-care',
    FULL_CARE: 'full-care',
  });
  assert.deepEqual(DEFAULT_CARE_CONFIG, {
    happiness: 80,
    satiety: 80,
    energy: 80,
    min: 20,
    max: 100,
    decay: { satietyMs: 10 * 60 * 1000, energyMs: 15 * 60 * 1000, happinessMs: 20 * 60 * 1000 },
    sleepEnergyMs: 2 * 60 * 1000,
    drowsyAfterMs: 10 * 60 * 1000,
    sleepingAfterMs: 20 * 60 * 1000,
  });
});

test('starts light-care awake with default bounded state and no offline elapsed time', () => {
  const model = createCareModel({ mode: CARE_MODES.LIGHT_CARE, lastInteractionAt: 0 });
  assert.deepEqual(stateOf(model), {
    mode: 'light-care', status: 'awake', happiness: 80, satiety: 80, energy: 80,
    lastInteractionAt: 0, runtimeElapsedMs: 0,
  });
});

test('applies runtime decay only after each configured interval', () => {
  const model = createCareModel({ mode: 'light-care', lastInteractionAt: 0 });
  model.advance(20 * 60 * 1000);
  assert.deepEqual(stateOf(model), {
    mode: 'light-care', status: 'sleeping', happiness: 79, satiety: 78, energy: 79,
    lastInteractionAt: 0, runtimeElapsedMs: 20 * 60 * 1000,
  });
});

test('transitions to drowsy at ten minutes and sleeping at twenty minutes without interaction', () => {
  const model = createCareModel({ mode: 'light-care' });
  model.advance(10 * 60 * 1000);
  assert.equal(stateOf(model).status, 'drowsy');
  model.advance(10 * 60 * 1000);
  assert.equal(stateOf(model).status, 'sleeping');
});

test('rest keeps the pet sleeping while a two-minute advance recovers energy', () => {
  const model = createCareModel({ mode: 'light-care' });
  model.interact('rest');
  assert.equal(stateOf(model).status, 'sleeping');
  model.advance(2 * 60 * 1000);
  assert.equal(stateOf(model).energy, 81);
  assert.equal(stateOf(model).status, 'sleeping');
});

test('accumulates sleep recovery across one-second monitor ticks', () => {
  const model = createCareModel({ mode: 'light-care' });
  model.interact('rest');
  for (let tick = 0; tick < 120; tick += 1) model.advance(1000);
  assert.equal(stateOf(model).energy, 81);
  assert.equal(stateOf(model).status, 'sleeping');
});

test('ordinary interaction wakes a pet that was put to rest', () => {
  const model = createCareModel({ mode: 'light-care' });
  model.interact('rest');
  model.interact('pet');
  assert.equal(stateOf(model).status, 'awake');
  assert.equal(stateOf(model).happiness, 88);
});

test('pet increases happiness by eight', () => {
  const model = createCareModel({ mode: 'light-care' });
  model.interact('pet');
  assert.equal(stateOf(model).happiness, 88);
});

test('feed increases satiety by twenty and happiness by three', () => {
  const model = createCareModel({ mode: 'light-care' });
  model.interact('feed');
  assert.equal(stateOf(model).satiety, 100);
  assert.equal(stateOf(model).happiness, 83);
});

test('play increases happiness and decreases energy and satiety', () => {
  const model = createCareModel({ mode: 'light-care' });
  model.interact('play');
  assert.deepEqual([stateOf(model).happiness, stateOf(model).energy, stateOf(model).satiety], [95, 72, 76]);
});

test('a single advance crossing twenty minutes applies recovery after the sleep threshold', () => {
  const model = createCareModel({ mode: 'light-care' });
  model.advance(22 * 60 * 1000);
  assert.equal(stateOf(model).status, 'sleeping');
  assert.equal(stateOf(model).energy, 80);
});

test('rejects zero, negative, and non-finite custom time intervals', () => {
  const intervalPaths = [
    ['decay', 'satietyMs'],
    ['decay', 'energyMs'],
    ['decay', 'happinessMs'],
    ['sleepEnergyMs'],
    ['drowsyAfterMs'],
    ['sleepingAfterMs'],
  ];
  for (const path of intervalPaths) {
    for (const value of [0, -1, Infinity, NaN]) {
      const config = path.length === 2
        ? { decay: { [path[1]]: value } }
        : { [path[0]]: value };
      assert.throws(() => createCareModel({ mode: 'light-care', config }), RangeError, `${path.join('.')}=${value}`);
    }
  }
});

test('clamps all state values to twenty through one hundred', () => {
  const lowModel = createCareModel({ mode: 'light-care', initial: { happiness: 1, satiety: 1, energy: 1 } });
  assert.deepEqual([stateOf(lowModel).happiness, stateOf(lowModel).satiety, stateOf(lowModel).energy], [20, 20, 20]);

  const highModel = createCareModel({ mode: 'light-care', initial: { happiness: 999, satiety: 999, energy: 999 } });
  highModel.interact('feed');
  assert.deepEqual([stateOf(highModel).happiness, stateOf(highModel).satiety, stateOf(highModel).energy], [100, 100, 100]);
});

test('returns capability information and skips light-care rules in interaction and full-care modes', () => {
  for (const mode of ['interaction', 'full-care', undefined, 'unknown']) {
    const model = createCareModel({ mode });
    assert.equal(stateOf(model).mode, mode === 'full-care' ? 'full-care' : 'interaction');
    assert.deepEqual(model.getCapabilities(), {
      mode: mode === 'full-care' ? 'full-care' : 'interaction',
      interaction: true,
      lightCare: false,
      fullCare: mode === 'full-care',
      stats: [],
    });
    assert.equal(model.advance(60 * 60 * 1000).mode, stateOf(model).mode);
    assert.deepEqual(model.interact('play'), stateOf(model));
    assert.equal(stateOf(model).status, 'awake');
  }
});

test('does not mutate the options or initial state objects', () => {
  const initial = { happiness: 10, satiety: 90, energy: 50 };
  const options = { mode: 'light-care', initial, lastInteractionAt: 12 };
  const before = JSON.parse(JSON.stringify(options));
  const model = createCareModel(options);
  model.interact('feed');
  model.advance(1000);
  assert.deepEqual(options, before);
  assert.notEqual(stateOf(model), initial);
});
