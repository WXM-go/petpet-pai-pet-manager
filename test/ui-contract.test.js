const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('manager and desktop pet surfaces expose the Chinese-first interaction UI contract', () => {
  const manager = read('manager.html');
  const desktop = read('index.html');
  const main = read('src/main.js');
  const renderer = read('src/renderer.js');

  assert.match(manager, /派派桌宠管理器/);
  assert.match(manager, /桌宠库/);
  assert.match(manager, /data-interaction="pet"/);
  assert.match(manager, /data-interaction="feed"/);
  assert.match(manager, /data-interaction="play"/);
  assert.match(manager, /data-interaction="rest"/);
  assert.match(desktop, /id="interaction-bubble"/);
  assert.match(desktop, /喂零食/);
  assert.match(desktop, /src\/playback-policy\.js/);
  assert.match(desktop, /src\/interaction-layer\.js/);
  assert.match(renderer, /lastCareStatus !== 'sleeping'/);
  assert.match(renderer, /clearTimeout\(demoTimer\)/);
  assert.match(renderer, /care-animation-active/);
  assert.match(main, /Menu\.setApplicationMenu\(null\)/);
  assert.match(main, /DEFAULT_PET_FOLDER = 'soft-blob'/);
  assert.match(main, /assets', DEFAULT_PET_FOLDER/);
});
