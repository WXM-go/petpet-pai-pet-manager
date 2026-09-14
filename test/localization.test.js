const test = require('node:test');
const assert = require('node:assert/strict');
const { COPY, formatPetTitle, formatDirectionLabel, formatScaleLabel } = require('../src/copy');

test('provides Chinese-first product copy for every native window surface', () => {
  assert.equal(COPY.appName, '派派桌宠管理器');
  assert.equal(COPY.managerTitle, '派派桌宠管理器');
  assert.equal(COPY.previewTitle, '桌宠动作预览');
  assert.equal(COPY.menu.openManager, '打开派派管理器');
  assert.equal(COPY.menu.quit, '退出派派');
  assert.equal(COPY.errors.importFailed, '导入失败，请检查桌宠包格式');
});

test('formats Chinese direction and scale labels', () => {
  assert.equal(formatPetTitle('软团团'), '软团团 · 派派');
  assert.equal(formatDirectionLabel('090'), '向右');
  assert.equal(formatDirectionLabel('000'), '向上');
  assert.equal(formatScaleLabel(0.5), '极小 · 50%');
  assert.equal(formatScaleLabel(1), '标准 · 100%');
});
