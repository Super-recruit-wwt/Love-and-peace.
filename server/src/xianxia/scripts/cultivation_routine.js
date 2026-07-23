// 剧本：日常修炼 — 修为积累，修为已满时引导突破（精气神修正版）
const { avgRoot, parseDurationDays, rand } = require('./utils');

module.exports = {
  id: 'cultivation_routine',

  match(actionText) {
    if (!/修炼|吐纳|打坐|闭关|引气|修行/.test(actionText)) return null;
    if (/突破|冲击|渡劫/.test(actionText)) return null;
    const days = Math.min(90, parseDurationDays(actionText, 3));
    return { days };
  },

  resolve(character, { days }) {
    const root = avgRoot(character);
    const comp = character.comprehension || 50;
    const essence = character.essence || 40;
    const spiritVal = character.spirit || 30;
    const qiMax = character.qi_max > 0 ? character.qi_max : 100;
    const qiCurrent = character.qi_current || 0;
    const qiVal = character.qi || 40;

    // 修为已满：不再产生收益，引导冲击瓶颈
    if (character.qi_max > 0 && qiCurrent >= qiMax) {
      return {
        deltas: {},
        extraRewards: [{ text: '修为已满', tone: 'time' }],
        elapsedDays: days,
        resultText: `你又静坐了${days}天，气海却早已充盈到了极致——灵力在经脉中周而复始，再难寸进。你清晰地感到那道无形的壁障：修为已到当前境界的顶点，唯有冲击瓶颈、踏入下一层天地，才能继续走下去。`,
        renderParams: { outcome: 'qi_full', days },
        options: ['冲击瓶颈，尝试突破', '外出历练一番', '前往坊市'],
      };
    }

    // 效率：灵根 × (0.3 + 气/200 + 神/300)
    const efficiency = (root / 100) * (0.3 + qiMax / 200 + spiritVal / 300 + qiVal / 400);
    let qiGain = Math.max(1, Math.round(efficiency * days * 4));

    const sets = {};
    if (character.qi_max <= 0) sets.qi_max = 100;

    // 精过低，连续修炼超过30天 → 身体透支
    const bodyOverdraft = essence < 20 && days > 30;
    if (bodyOverdraft) qiGain = Math.round(qiGain * 0.5);

    // 旧伤未愈（突破失败留下的受创/重伤/走火入魔）→ 修炼效率减半，可与透支叠加
    const bodyInjured = /受创|重伤|走火入魔/.test(character.body_status || '');
    if (bodyInjured) qiGain = Math.round(qiGain * 0.5);

    // 突破契机提示：道心 × 修为占比 × (神/200 + 0.3)
    const afterQi = Math.min(qiMax, qiCurrent + qiGain);
    const chance = (character.dao_heart || 50) / 100 * (afterQi / qiMax) * (spiritVal / 200 + 0.3);
    const breakthroughHint = Math.random() < chance * 0.4;

    const actualGain = afterQi - qiCurrent;
    let overdoseText = '';
    if (bodyOverdraft) overdoseText = ' 你的身体太弱了——连日的打坐让你的经脉隐隐作痛，修炼效率大打折扣。';
    if (bodyInjured) overdoseText += ' 旧伤未愈，灵力行至伤处便滞涩难行，修炼效率减半——还是先把伤养好。';

    const resultText = breakthroughHint
      ? `闭关${days}天，修为积累 ${actualGain > 0 ? `+${actualGain}` : '无增长（气海已满）'}。修炼至深处，你隐约感到瓶颈松动——突破的契机或许已经不远了。${overdoseText}`
      : `闭关${days}天，修为积累 ${actualGain > 0 ? `+${actualGain}` : '无增长（气海已满）'}。修炼平稳，日复一日的吐纳。${overdoseText}`;

    return {
      deltas: { qi_current: actualGain },
      sets,
      elapsedDays: days,
      resultText,
      renderParams: { days, qiGain: actualGain, breakthroughHint, bodyOverdraft },
      options: breakthroughHint
        ? ['冲击瓶颈，尝试突破', '继续稳固修为', '外出历练一番']
        : ['继续修炼', '探索四周', '前往坊市'],
    };
  },
};
