(function (root, factory) {
  const api = factory(root.PetModel, root.DirectionLayout);
  if (root) root.PetPlayer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (PetModel, DirectionLayout) {
  function createPetPlayer(options) {
    const { canvas, spriteUrl, onStateChange, renderingMode = 'pixelated' } = options;
    const ctx = canvas.getContext('2d');
    const { CELL_WIDTH, CELL_HEIGHT, ACTIONS, getFrameRect, getLookDirectionCell } = PetModel;
    canvas.width = CELL_WIDTH;
    canvas.height = CELL_HEIGHT;
    let currentRenderingMode = renderingMode;
    ctx.imageSmoothingEnabled = currentRenderingMode === 'smooth';

    const image = new Image();
    let directionTransforms = {};
    const state = {
      mode: 'action',
      action: 'idle',
      frame: 0,
      direction: '000',
      pointerDirection: '000',
      pointerFollowing: true,
      paused: false,
      demo: true,
      nextFrameAt: 0,
      remainingLoops: 0,
    };
    let animationFrame;
    let lastTime = 0;

    function notify() {
      if (typeof onStateChange === 'function') onStateChange({ ...state });
    }

    function getLookCellBounds() {
      if (!DirectionLayout || !image.naturalWidth || !image.naturalHeight) return {};

      const offscreen = document.createElement('canvas');
      offscreen.width = image.naturalWidth;
      offscreen.height = image.naturalHeight;
      const offscreenContext = offscreen.getContext('2d', { willReadFrequently: true });
      if (!offscreenContext) return {};
      offscreenContext.drawImage(image, 0, 0);

      const pixels = offscreenContext.getImageData(0, 0, offscreen.width, offscreen.height).data;
      const bounds = {};
      for (const direction of PetModel.LOOK_DIRECTIONS) {
        const cell = getLookDirectionCell(direction);
        const originX = cell.column * CELL_WIDTH;
        const originY = cell.row * CELL_HEIGHT;
        const maxX = Math.min(originX + CELL_WIDTH, offscreen.width);
        const maxY = Math.min(originY + CELL_HEIGHT, offscreen.height);
        let minX = CELL_WIDTH;
        let minY = CELL_HEIGHT;
        let maxLocalX = -1;
        let maxLocalY = -1;

        for (let y = originY; y < maxY; y += 1) {
          for (let x = originX; x < maxX; x += 1) {
            const alpha = pixels[(y * offscreen.width + x) * 4 + 3];
            if (alpha > 8) {
              const localX = x - originX;
              const localY = y - originY;
              minX = Math.min(minX, localX);
              minY = Math.min(minY, localY);
              maxLocalX = Math.max(maxLocalX, localX);
              maxLocalY = Math.max(maxLocalY, localY);
            }
          }
        }

        if (maxLocalX >= 0 && maxLocalY >= 0) {
          bounds[direction] = {
            x: minX,
            y: minY,
            width: maxLocalX - minX + 1,
            height: maxLocalY - minY + 1,
          };
        }
      }
      return bounds;
    }

    function prepareDirectionTransforms() {
      try {
        directionTransforms = DirectionLayout
          ? DirectionLayout.buildDirectionTransforms(getLookCellBounds(), '000', CELL_WIDTH, CELL_HEIGHT)
          : {};
      } catch {
        // Fall back to the full-cell draw if the renderer cannot read the atlas.
        directionTransforms = {};
      }
    }

    function draw() {
      ctx.clearRect(0, 0, CELL_WIDTH, CELL_HEIGHT);
      if (!image.complete) return;
      let source;
      if (state.mode === 'look') {
        const cell = getLookDirectionCell(state.direction);
        const transform = directionTransforms[state.direction];
        if (transform) {
          ctx.drawImage(
            image,
            cell.column * CELL_WIDTH + transform.source.x,
            cell.row * CELL_HEIGHT + transform.source.y,
            transform.source.width,
            transform.source.height,
            transform.destination.x,
            transform.destination.y,
            transform.destination.width,
            transform.destination.height,
          );
          return;
        }
        source = { x: cell.column * CELL_WIDTH, y: cell.row * CELL_HEIGHT, width: CELL_WIDTH, height: CELL_HEIGHT };
      } else {
        source = getFrameRect(state.action, state.frame);
      }
      ctx.drawImage(image, source.x, source.y, source.width, source.height, 0, 0, CELL_WIDTH, CELL_HEIGHT);
    }

    function setAction(actionId, config = {}) {
      if (!ACTIONS[actionId]) throw new Error(`Unknown action: ${actionId}`);
      state.mode = 'action';
      state.action = actionId;
      state.frame = 0;
      state.remainingLoops = config.loops ?? (ACTIONS[actionId].loop ? 0 : 1);
      state.nextFrameAt = 0;
      notify();
      draw();
    }

    function setDirection(direction) {
      state.mode = 'look';
      state.direction = direction;
      state.frame = 0;
      notify();
      draw();
    }

    function setPointerDirection(direction) {
      state.pointerDirection = direction;
      state.direction = direction;
      if (state.action === 'idle' || state.mode === 'look') state.mode = 'look';
      notify();
      draw();
    }

    function resetPointerDirection() {
      state.pointerDirection = '000';
      state.direction = '000';
      notify();
      draw();
    }

    function setPointerFollowing(enabled) {
      state.pointerFollowing = Boolean(enabled);
      if (!state.pointerFollowing) {
        resetPointerDirection();
        state.mode = 'action';
        state.action = 'idle';
        state.frame = 0;
        state.remainingLoops = 0;
        state.nextFrameAt = 0;
        notify();
        draw();
      }
      else {
        notify();
        draw();
      }
    }

    function setSpriteUrl(spriteUrl, nextRenderingMode = currentRenderingMode) {
      currentRenderingMode = nextRenderingMode || 'pixelated';
      ctx.imageSmoothingEnabled = currentRenderingMode === 'smooth';
      image.src = spriteUrl;
      directionTransforms = {};
      state.mode = 'action';
      state.action = 'idle';
      state.frame = 0;
      state.nextFrameAt = 0;
      notify();
    }

    function setPaused(paused) {
      state.paused = Boolean(paused);
      notify();
    }

    function setDemo(enabled) {
      state.demo = Boolean(enabled);
      notify();
    }

    function tick(timestamp) {
      if (!lastTime) lastTime = timestamp;
      if (!state.paused && state.mode === 'action' && timestamp >= state.nextFrameAt) {
        const definition = ACTIONS[state.action];
        state.nextFrameAt = timestamp + definition.durations[state.frame];
        state.frame += 1;
        if (state.frame >= definition.frameCount) {
          if (definition.loop || state.remainingLoops === 0) {
            state.frame = 0;
          } else if (state.remainingLoops > 1) {
            state.remainingLoops -= 1;
            state.frame = 0;
          } else {
            state.action = 'idle';
            state.frame = 0;
            state.remainingLoops = 0;
            state.nextFrameAt = timestamp;
            if (state.pointerFollowing) {
              state.mode = 'look';
              state.direction = state.pointerDirection;
            } else {
              state.mode = 'action';
            }
          }
          notify();
        }
        draw();
      }
      animationFrame = requestAnimationFrame(tick);
    }

    image.addEventListener('load', () => {
      prepareDirectionTransforms();
      draw();
    });
    image.src = spriteUrl;
    animationFrame = requestAnimationFrame(tick);

    return {
      state,
      setAction,
      setDirection,
      setPointerDirection,
      resetPointerDirection,
      setPointerFollowing,
      setSpriteUrl,
      setPaused,
      setDemo,
      draw,
      destroy() {
        cancelAnimationFrame(animationFrame);
      },
    };
  }

  return { createPetPlayer };
});
