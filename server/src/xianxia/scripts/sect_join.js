// 剧本：拜入宗门 — 精气神修正 + 欺天面特殊装备
const { db } = require('../../db');
const { avgRoot, regionOf, rand, parseJson } = require('./utils');

const REGION_SECTS = {
  '中州': '太虚剑宗',
  '北荒': '铁骨门',
  '南疆': '青木宗',
  '东海': '碧水宫',
  '西漠': '搬山宗',
};

module.exports = {
  id: 'sect_join',

  match(actionText) {
    if (!/拜师|拜入|入门|加入.*宗|求道|投师|拜山门/.test(actionText)) return null;
    return {};
  },

  resolve(character) {
    const region = regionOf(character);
    const sect = REGION_SECTS[region] || '太虚剑宗';
    const essence = character.essence || 40;
    const qiMax = character.qi_max || 100;
    const corr = character.strange_corruption || 0;

    // 诡道异化者禁止入门
    if (corr >= 41) {
      return {
        deltas: {},
        elapsedDays: 1,
        resultText: `验灵碑前，你体内的异化气息刚刚接触到碑面——整块碑就发出了刺耳的尖鸣。执事的脸色瞬间变了。`,
        renderParams: { sect, success: false, reason: 'strange_corruption' },
        options: ['离开此地', '打听其他门路', '尝试解释'],
      };
    }

    // 分数：灵根 × 0.5 + 气 × 0.0015 + 悟性 × 0.3
    const score = avgRoot(character) * 0.5 + qiMax * 0.0015 + (character.comprehension || 50) * 0.3;
    let success = score >= 55 || Math.random() < score / 120;

    // 精≥100 体修破格录取
    const physicalAdmit = essence >= 100 && ['铁骨门','搬山宗'].includes(sect);

    // 欺天面：强制成功（一次性碎裂）
    const specialEquip = parseJson(character.special_equipment, []);
    const hasDeceiveHeaven = specialEquip.some(e => e === 'deceive_heaven');
    if (hasDeceiveHeaven) {
      success = true;
      // 标记欺天面已使用
      character.special_equipment = JSON.stringify(specialEquip.filter(e => e !== 'deceive_heaven'));
    }

    const elapsedDays = rand(1, 3);

    if (success || physicalAdmit) {
      const leader = db.prepare('SELECT id FROM xianxia_npcs WHERE faction = ? AND is_alive = 1 ORDER BY id LIMIT 1').get(sect);
      const affectionDelta = hasDeceiveHeaven ? -20 : 20;
      const reason = physicalAdmit ? '体修破格录取' : (hasDeceiveHeaven ? '欺天入门' : '拜入宗门');
      const extraSets = {};
      if (hasDeceiveHeaven) extraSets.special_equipment = character.special_equipment;

      return {
        deltas: { fame: 5 },
        sets: Object.keys(extraSets).length > 0 ? extraSets : undefined,
        npcEffects: leader ? [{ npcId: leader.id, delta: affectionDelta, reason }] : [],
        elapsedDays,
        resultText: hasDeceiveHeaven
          ? `${sect}的验灵碑不知为何放你进去了。但掌门的眼神带着审视——你能感觉到。`
          : physicalAdmit
          ? `${sect}的执事摇了摇头:"灵根不够。"但另一位长老捏了捏你的手臂——"这体魄，收。"（体修破格录取，名望 +5）`
          : `${sect}的入门测试持续了${elapsedDays}天。你的资质通过了验灵碑的检验，被录为外门弟子。（名望 +5）`,
        renderParams: { sect, success: true, score: Math.round(score), physicalAdmit, deceived: hasDeceiveHeaven },
        options: ['前往传功堂', '熟悉宗门环境', '拜见诸位师长'],
      };
    }

    return {
      deltas: {},
      elapsedDays,
      resultText: `${sect}的入门测试持续了${elapsedDays}天。验灵碑前，执事摇了摇头——你的资质，还入不了${sect}的法眼。`,
      renderParams: { sect, success: false, score: Math.round(score) },
      options: ['回去继续修炼再试', '打听其他宗门的门路', '离开此地'],
    };
  },
};
