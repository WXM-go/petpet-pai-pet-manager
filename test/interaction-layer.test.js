const test = require('node:test');
const assert = require('node:assert/strict');
const { getInteractionPlaybackPlan } = require('../src/interaction-layer');

test('专属互动动画播放时隐藏底层画布并停止重复动作', () => {
  assert.deepEqual(getInteractionPlaybackPlan('file:///pet.gif'), {
    useOverlay: true,
    hideBaseCanvas: true,
    playAtlasAction: false,
  });
});

test('没有专属互动动画时回退到标准图集动作', () => {
  assert.deepEqual(getInteractionPlaybackPlan(null), {
    useOverlay: false,
    hideBaseCanvas: false,
    playAtlasAction: true,
  });
});
