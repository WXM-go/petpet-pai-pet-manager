const LOOK_DIRECTIONS = Object.freeze([
  '000', '022.5', '045', '067.5', '090', '112.5', '135', '157.5',
  '180', '202.5', '225', '247.5', '270', '292.5', '315', '337.5',
]);

function normalizeAngle(angle) {
  return ((angle % 360) + 360) % 360;
}

function quantizeDirection(dx, dy) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) throw new TypeError('Direction vector must be finite');
  if (dx === 0 && dy === 0) return '000';
  // Codex v2 uses screen-space compass angles: 000 is up, 090 is right,
  // 180 is down, and 270 is left. In screen coordinates positive y points down.
  const angle = normalizeAngle(Math.atan2(dx, -dy) * 180 / Math.PI);
  const index = Math.round(angle / 22.5) % LOOK_DIRECTIONS.length;
  return LOOK_DIRECTIONS[index];
}

function directionDistance(first, second) {
  const firstIndex = LOOK_DIRECTIONS.indexOf(first);
  const secondIndex = LOOK_DIRECTIONS.indexOf(second);
  if (firstIndex < 0 || secondIndex < 0) throw new Error('Unknown look direction');
  const distance = Math.abs(firstIndex - secondIndex) * 22.5;
  return Math.min(distance, 360 - distance);
}

module.exports = { LOOK_DIRECTIONS, quantizeDirection, directionDistance };
