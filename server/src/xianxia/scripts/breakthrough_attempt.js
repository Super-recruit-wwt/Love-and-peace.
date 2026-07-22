// 剧本：突破尝试 — 服务端直接设 timer，接 breakthrough.js 倒计时锁结算管线
const { cultivationTier, parseJson } = require('./utils');

// 按境界层级的突破耗时（分钟）
const TIER_MINUTES = [10, 15, 20, 25, 35, 45, 55, 55, 55, 60];

module.exports = {
  id: 'breakthrough_attempt',

  match(actionText) {
    if (!/突破|冲击瓶颈|冲击.*境|渡劫|闭关冲击|冲关/.test(actionText)) return null;
    return {};
  },

  resolve(character) {
    const tier = cultivationTier(character);
    const paths = parseJson(character.cultivation_paths, {});
    const hasPath = Object.values(paths).some(Boolean);

    // 门槛：已有修炼路线，或灵力积累足够
    if (!hasPath && (character.qi_current || 0) < 30) {
      return {
        deltas: {},
        elapsedDays: 1,
        resultText: '你尝试感应瓶颈，却发现体内灵力浅薄得可怜——连门槛都摸不到，谈何突破。还是先好生修炼积累吧。',
        renderParams: { outcome: 'not_ready' },
        options: ['闭关修炼积累灵力', '外出历练', '打听突破的机缘'],
      };
    }

    const minutes = TIER_MINUTES[Math.min(tier, TIER_MINUTES.length - 1)];
    return {
      deltas: {},
      elapsedDays: 1, // 冲关准备，游戏内一日
      timer: { type: 'breakthrough', minutes, narrative: '突破进行中……天象渐起，灵气汇聚。' },
      resultText: '你盘膝入定，开始冲击瓶颈。体内灵力如潮水般涌向那道无形的壁障——突破一旦开始，便只能静待结果。',
      renderParams: { outcome: 'started', minutes },
      options: [],
    };
  },
};
