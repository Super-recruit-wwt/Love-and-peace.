// 剧本：日常修炼 — 修为积累，修为已满时引导突破（精气神修正版）
const { avgRoot, parseDurationDays, rand, buffMult, consumeBuffs, SERIOUS_INJURY_PATTERN } = require('./utils');
const techniques = require('../techniques');

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
    const qiMax = character.qi_max > 0 ? character.qi_max : techniques.effectiveQiMax(character);
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

    // 效率：灵根 × (0.3 + 气/200 + 神/300) × 主修功法效率倍率
    const techEff = techniques.efficiencyMult(character);
    const mainTech = techniques.getMainTechnique(character);
    const efficiency = (root / 100) * (0.3 + qiMax / 200 + spiritVal / 300 + qiVal / 400);
    let qiGain = Math.max(1, Math.round(efficiency * techEff * days * 4));

    const sets = {};
    if (character.qi_max <= 0) sets.qi_max = techniques.effectiveQiMax(character);

    // 精过低，连续修炼超过30天 → 身体透支
    const bodyOverdraft = essence < 20 && days > 30;
    if (bodyOverdraft) qiGain = Math.round(qiGain * 0.5);

    // 旧伤未愈（突破留下的受创/受损/重伤/走火入魔）→ 修炼效率减半，可与透支叠加
    const bodyInjured = SERIOUS_INJURY_PATTERN.test(character.body_status || '');
    if (bodyInjured) qiGain = Math.round(qiGain * 0.5);

    // 聚灵丹等修炼增效 buff（乘区），本次修炼后消耗
    const cultMult = buffMult(character, 'cultivation_efficiency');
    if (cultMult !== 1) {
      qiGain = Math.round(qiGain * cultMult);
      sets.active_buffs = JSON.stringify(consumeBuffs(character, 'cultivation'));
    }

    // 突破契机提示：道心 × 修为占比 × (神/200 + 0.3)
    const afterQi = Math.min(qiMax, qiCurrent + qiGain);
    const chance = (character.dao_heart || 50) / 100 * (afterQi / qiMax) * (spiritVal / 200 + 0.3);
    const breakthroughHint = Math.random() < chance * 0.4;

    const actualGain = afterQi - qiCurrent;

    // 功法深度经验（触类旁通）：主修心法 +1/天 × 悟性/50 × 领悟速度；其余所有功法三成
    let depthUpText = '';
    const depthRewards = [];
    {
      const learnSpeed = Number(techniques.unlockedEffect(character).learn_speed) || 1;
      const expGain = days * (comp / 50) * learnSpeed;
      const r = techniques.gainDepthExp(character, expGain, {
        boostName: mainTech ? mainTech.name : null, boostMult: 1, otherMult: 0.3,
      });
      if (r.gains.length > 0) {
        sets.learned_techniques = JSON.stringify(r.list);
        const upNames = [];
        for (const g of r.gains) {
          if (g.levelUps.length > 0) {
            const label = techniques.DEPTH_LABELS[g.levelUps[g.levelUps.length - 1]];
            upNames.push(`《${g.name}》${label}`);
            depthRewards.push({ text: `《${g.name}》领悟·${label}`, tone: 'gain' });
            if (mainTech && g.name === mainTech.name) {
              sets.qi_max = techniques.recalcQiMax(character, r.list); // 主修心法升深，气海上限即时刷新
            }
          }
        }
        if (upNames.length > 0) depthUpText = ` 日积月累的吐纳让你对${upNames.join('、')}的领悟更进一层！`;
      }
    }

    let overdoseText = '';
    if (bodyOverdraft) overdoseText = ' 你的身体太弱了——连日的打坐让你的经脉隐隐作痛，修炼效率大打折扣。';
    if (bodyInjured) overdoseText += ' 旧伤未愈，灵力行至伤处便滞涩难行，修炼效率减半——还是先把伤养好。';
    if (cultMult !== 1) overdoseText += ' 聚灵丹的药力随吐纳化开，灵气汇聚比平时快了不少。';
    if (mainTech && techEff !== 1) {
      overdoseText += techEff > 1
        ? ` 《${mainTech.name}》运转周天，灵气炼化远比粗浅吐纳来得精纯。`
        : ` 《${mainTech.name}》行功路数于灵气积累并无助益，进境慢了几分。`;
    }

    // 日常涓流：每修满 30 天，精/气/神各 +1（远低于功法与丹药，但日积月累）
    const trickle = Math.floor(days / 30);
    if (trickle > 0) {
      overdoseText += ` 日积月累的打坐让精气神也凝实了几分（各 +${trickle}）。`;
    }

    const resultText = breakthroughHint
      ? `闭关${days}天，修为积累 ${actualGain > 0 ? `+${actualGain}` : '无增长（气海已满）'}。修炼至深处，你隐约感到瓶颈松动——突破的契机或许已经不远了。${overdoseText}${depthUpText}`
      : `闭关${days}天，修为积累 ${actualGain > 0 ? `+${actualGain}` : '无增长（气海已满）'}。修炼平稳，日复一日的吐纳。${overdoseText}${depthUpText}`;

    return {
      deltas: trickle > 0
        ? { qi_current: actualGain, essence: trickle, qi: trickle, spirit: trickle }
        : { qi_current: actualGain },
      sets,
      extraRewards: depthRewards.length > 0 ? depthRewards : undefined,
      elapsedDays: days,
      resultText,
      renderParams: { days, qiGain: actualGain, breakthroughHint, bodyOverdraft },
      options: breakthroughHint
        ? ['冲击瓶颈，尝试突破', '继续稳固修为', '外出历练一番']
        : ['继续修炼', '探索四周', '前往坊市'],
    };
  },
};
