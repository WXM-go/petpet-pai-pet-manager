const SIZE_PRESETS = [
  { id: 'tiny', label: '极小（50%）', scale: 0.5 },
  { id: 'compact', label: '偏小（65%）', scale: 0.65 },
  { id: 'small', label: '小（80%）', scale: 0.8 },
  { id: 'normal', label: '标准（100%）', scale: 1 },
  { id: 'large', label: '大（125%）', scale: 1.25 },
  { id: 'xlarge', label: '特大（150%）', scale: 1.5 },
];

function getScaledWindowSize(baseWidth, baseHeight, scale) {
  return {
    width: Math.round(baseWidth * scale),
    height: Math.round(baseHeight * scale),
  };
}

function keepBottomRight(bounds, width, height) {
  return {
    x: bounds.x + bounds.width - width,
    y: bounds.y + bounds.height - height,
    width,
    height,
  };
}

function getDraggedPosition({
  windowX,
  windowY,
  startMouseX,
  startMouseY,
  currentMouseX,
  currentMouseY,
}) {
  return {
    x: windowX + currentMouseX - startMouseX,
    y: windowY + currentMouseY - startMouseY,
  };
}

module.exports = {
  SIZE_PRESETS,
  getScaledWindowSize,
  keepBottomRight,
  getDraggedPosition,
};
