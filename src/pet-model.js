(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.PetModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const CELL_WIDTH = 192;
  const CELL_HEIGHT = 208;

  const ACTIONS = Object.freeze({
    idle: { row: 0, frameCount: 6, label: '待机', durations: [280, 110, 110, 140, 140, 320], loop: true },
    'running-right': { row: 1, frameCount: 8, label: '向右跑', durations: [120, 120, 120, 120, 120, 120, 120, 220] },
    'running-left': { row: 2, frameCount: 8, label: '向左跑', durations: [120, 120, 120, 120, 120, 120, 120, 220] },
    waving: { row: 3, frameCount: 4, label: '挥手', durations: [140, 140, 140, 280] },
    jumping: { row: 4, frameCount: 5, label: '跳跃', durations: [140, 140, 140, 140, 280] },
    failed: { row: 5, frameCount: 8, label: '失败', durations: [140, 140, 140, 140, 140, 140, 140, 240] },
    waiting: { row: 6, frameCount: 6, label: '等待', durations: [150, 150, 150, 150, 150, 260] },
    running: { row: 7, frameCount: 6, label: '处理中', durations: [120, 120, 120, 120, 120, 220] },
    review: { row: 8, frameCount: 6, label: '检查', durations: [150, 150, 150, 150, 150, 280] },
  });

  const LOOK_DIRECTIONS = Object.freeze([
    '000', '022.5', '045', '067.5', '090', '112.5', '135', '157.5',
    '180', '202.5', '225', '247.5', '270', '292.5', '315', '337.5',
  ]);

  function getActionDefinition(actionId) {
    const definition = ACTIONS[actionId];
    if (!definition) throw new Error(`Unknown action: ${actionId}`);
    return definition;
  }

  function getFrameRect(actionId, frameIndex) {
    const definition = getActionDefinition(actionId);
    if (!Number.isInteger(frameIndex) || frameIndex < 0 || frameIndex >= definition.frameCount) {
      throw new RangeError(`Frame ${frameIndex} is out of range for ${actionId}`);
    }
    return {
      x: frameIndex * CELL_WIDTH,
      y: definition.row * CELL_HEIGHT,
      width: CELL_WIDTH,
      height: CELL_HEIGHT,
    };
  }

  function getLookDirectionCell(direction) {
    const index = LOOK_DIRECTIONS.indexOf(direction);
    if (index < 0) throw new Error(`Unknown look direction: ${direction}`);
    return index < 8 ? { row: 9, column: index } : { row: 10, column: index - 8 };
  }

  function listActionIds() {
    return Object.keys(ACTIONS);
  }

  return { ACTIONS, LOOK_DIRECTIONS, CELL_WIDTH, CELL_HEIGHT, getActionDefinition, getFrameRect, getLookDirectionCell, listActionIds };
});
