const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const PetModel = require('../src/pet-model');

function createPlayer() {
  let frameCallback;
  const context = {
    PetModel,
    DirectionLayout: null,
    Image: class {
      constructor() {
        this.complete = true;
        this.naturalWidth = 0;
        this.naturalHeight = 0;
      }

      addEventListener() {}

      set src(value) { this.url = value; }
    },
    requestAnimationFrame(callback) {
      frameCallback = callback;
      return 1;
    },
    cancelAnimationFrame() {},
    document: { createElement() { throw new Error('not needed for this test'); } },
  };
  context.globalThis = context;
  vm.runInNewContext(fs.readFileSync('src/pet-player.js', 'utf8'), context, { filename: 'src/pet-player.js' });
  const canvas = {
    width: 0,
    height: 0,
    getContext() {
      return { imageSmoothingEnabled: false, clearRect() {}, drawImage() {} };
    },
  };
  const player = context.PetPlayer.createPetPlayer({ canvas, spriteUrl: 'spritesheet.webp' });
  return {
    player,
    advance(timestamp) { frameCallback(timestamp); },
  };
}

test('resetPointerDirection updates the direction used after one-shot actions', () => {
  const { player } = createPlayer();
  try {
    player.setPointerDirection('270');
    player.resetPointerDirection();
    assert.equal(player.state.pointerDirection, '000');
    assert.equal(player.state.direction, '000');
  } finally {
    player.destroy();
  }
});

test('one-shot actions return to the current look direction when pointer following is enabled', () => {
  const { player, advance } = createPlayer();
  try {
    player.setPointerDirection('270');
    player.setAction('waving', { loops: 1 });
    advance(0);
    advance(140);
    advance(280);
    advance(420);

    assert.equal(player.state.mode, 'look');
    assert.equal(player.state.action, 'idle');
    assert.equal(player.state.direction, '270');
    assert.equal(player.state.pointerDirection, '270');
  } finally {
    player.destroy();
  }
});

test('one-shot actions return to looping idle when pointer following is disabled', () => {
  const { player, advance } = createPlayer();
  try {
    player.setPointerDirection('270');
    player.setPointerFollowing(false);
    player.setAction('waving', { loops: 1 });
    advance(0);
    advance(140);
    advance(280);
    advance(420);

    assert.equal(player.state.mode, 'action');
    assert.equal(player.state.action, 'idle');
    assert.equal(player.state.direction, '000');
    assert.equal(player.state.pointerDirection, '000');

    advance(700);
    assert.equal(player.state.mode, 'action');
    assert.equal(player.state.action, 'idle');
    assert.ok(player.state.frame > 0);
  } finally {
    player.destroy();
  }
});

test('disabling pointer following immediately switches a fixed look into looping idle', () => {
  const { player } = createPlayer();
  try {
    player.setPointerDirection('270');
    player.setPointerFollowing(false);

    assert.equal(player.state.pointerFollowing, false);
    assert.equal(player.state.pointerDirection, '000');
    assert.equal(player.state.direction, '000');
    assert.equal(player.state.mode, 'action');
    assert.equal(player.state.action, 'idle');
  } finally {
    player.destroy();
  }
});
