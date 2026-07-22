// 剧本：日常修炼 — 灵气积累，小概率触及突破契机
const { avgRoot, parseDurationDays, rand } = require('./utils');

module.exports = {
  id: 'cultivation_routine',

  match(actionText) {
    if (!/修炼|吐纳|打坐|闭关|引气|修行/.test(actionText)) return null;
    if (/突破|冲击|渡劫/.test(actionText)) return null; // 突破走 breakthrough_attempt
    const days = Math.min(90, parseDurationDays(actionText, 3));
    return { days };
  },

  resolve(character, { days }) {
    const root = avgRoot(character);
    const comp = character.comprehension || 50;
    // 效率 = 灵根 × 悟性系数；每日灵气 = 效率 × 4
    const efficiency = (root / 100) * (0.5 + comp / 100);
    const qiGain = Math.max(1, Math.round(efficiency * days * 4));

    const qiMax = character.qi_max > 0 ? character.qi_max : 100;
    const sets = {};
    if (character.qi_max <= 0) sets.qi_max = 100; // 引气入体，初开气海

    // 突破契机提示（仅提示，不触发锁）
    const afterQi = Math.min(qiMax, (character.qi_current || 0) + qiGain);
    const chance = (character.dao_heart || 50) / 100 * (afterQi / qiMax);
    const breakthroughHint = Math.random() < chance * 0.4;

    const actualGain = afterQi - (character.qi_current || 0);
    const resultText = breakthroughHint
      ? `闭关${days}天，灵气积累 ${actualGain > 0 ? `+${actualGain}` : '无增长（气海已满）'}。修炼至深处，你隐约感到瓶颈松动——突破的契机或许已经不远了。`
      : `闭关${days}天，灵气积累 ${actualGain > 0 ? `+${actualGain}` : '无增长（气海已满）'}。修炼平稳，日复一日的吐纳。`;

    return {
      deltas: { qi_current: qiGain },
      sets,
      elapsedDays: days,
      resultText,
      renderParams: { days, qiGain: actualGain, breakthroughHint },
      options: breakthroughHint
        ? ['尝试冲击瓶颈', '继续稳固修为', '外出历练一番']
        : ['继续修炼', '探索四周', '前往坊市'],
    };
  },
};
