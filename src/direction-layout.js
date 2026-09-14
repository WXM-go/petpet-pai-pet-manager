(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DirectionLayout = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function buildDirectionTransforms(boundsByDirection, canonicalDirection = '000', cellWidth = 192, cellHeight = 208) {
    const canonical = boundsByDirection && boundsByDirection[canonicalDirection];
    if (!canonical || canonical.height <= 0 || canonical.width <= 0) return {};

    const targetHeight = canonical.height;
    const targetBaseline = canonical.y + canonical.height;
    const targetCenterX = cellWidth / 2;
    const transforms = {};

    for (const [direction, source] of Object.entries(boundsByDirection)) {
      if (!source || source.width <= 0 || source.height <= 0) continue;
      const scale = targetHeight / source.height;
      const width = Math.max(1, Math.round(source.width * scale));
      const height = Math.max(1, Math.round(source.height * scale));
      transforms[direction] = {
        source: { x: source.x, y: source.y, width: source.width, height: source.height },
        destination: {
          x: Math.round(targetCenterX - width / 2),
          y: Math.round(targetBaseline - height),
          width,
          height,
        },
      };
    }

    return transforms;
  }

  return { buildDirectionTransforms };
});
