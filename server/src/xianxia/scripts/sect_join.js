// 剧本：拜入宗门 — 入门测试（灵根/悟性判定）→ 成功/失败
const { db } = require('../../db');
const { avgRoot, regionOf, rand } = require('./utils');

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
    const score = avgRoot(character) * 0.6 + (character.comprehension || 50) * 0.4;
    const success = score >= 55 || Math.random() < score / 120;
    const elapsedDays = rand(1, 3);

    if (success) {
      // 与该宗掌门 NPC 建立初始好感（若存在）
      const leader = db.prepare('SELECT id FROM xianxia_npcs WHERE faction = ? AND is_alive = 1 ORDER BY id LIMIT 1').get(sect);
      return {
        deltas: { fame: 5 },
        npcEffects: leader ? [{ npcId: leader.id, delta: 20, reason: '拜入宗门' }] : [],
        elapsedDays,
        resultText: `${sect}的入门测试持续了${elapsedDays}天。你的资质通过了验灵碑的检验，被录为外门弟子。（名望 +5）`,
        renderParams: { sect, success: true, score: Math.round(score) },
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
