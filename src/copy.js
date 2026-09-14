(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.PetPetCopy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const COPY = Object.freeze({
    appName: '派派桌宠管理器',
    managerTitle: '派派桌宠管理器',
    petTitleSuffix: ' · 派派',
    previewTitle: '桌宠动作预览',
    previewDescription: '点击按钮查看动作；方向按钮对应精灵图中的 16 个环绕视角。',
    menu: Object.freeze({
      autoDemo: '自动演示',
      playAction: '播放动作',
      observeDirection: '选择观察方向',
      petSize: '桌宠大小',
      openManager: '打开派派管理器',
      openPreview: '打开动作预览',
      pauseResume: '暂停 / 继续',
      quit: '退出派派',
      delete: '删除桌宠',
      cancel: '取消',
    }),
    errors: Object.freeze({
      importFailed: '导入失败，请检查桌宠包格式',
      deleteFailed: '删除失败，请稍后再试',
      selectFailed: '切换失败，请稍后再试',
      managerInitFailed: '管理器初始化失败，请重启派派',
      petNotFound: '找不到要切换的桌宠',
      petMissing: '桌宠不存在',
      unknownSetting: '未知设置项',
      cannotDeleteDefault: '默认桌宠不能删除',
      deleteConfirm: '确定要从派派中删除这个桌宠吗？',
    }),
    interaction: Object.freeze({
      pet: '摸摸',
      feed: '喂零食',
      play: '一起玩',
      rest: '休息',
    }),
  });

  const DIRECTIONS = Object.freeze({
    '000': '向上', '022.5': '右上', '045': '右上', '067.5': '右上',
    '090': '向右', '112.5': '右下', '135': '右下', '157.5': '右下',
    '180': '向下', '202.5': '左下', '225': '左下', '247.5': '左下',
    '270': '向左', '292.5': '左上', '315': '左上', '337.5': '左上',
  });

  const SCALES = Object.freeze({
    0.5: '极小 · 50%',
    0.65: '偏小 · 65%',
    0.8: '小 · 80%',
    1: '标准 · 100%',
    1.25: '大 · 125%',
    1.5: '特大 · 150%',
  });

  function formatPetTitle(name) {
    return `${name}${COPY.petTitleSuffix}`;
  }

  function formatDirectionLabel(direction) {
    return DIRECTIONS[direction] || `观察 ${direction}°`;
  }

  function formatScaleLabel(scale) {
    return SCALES[Number(scale)] || `${Math.round(Number(scale) * 100)}%`;
  }

  return { COPY, DIRECTIONS, SCALES, formatPetTitle, formatDirectionLabel, formatScaleLabel };
});
