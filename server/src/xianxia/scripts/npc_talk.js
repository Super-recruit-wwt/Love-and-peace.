// 剧本：与 NPC 交谈 — 固定 delta 规则，接 npc.js 好感度引擎
const { db } = require('../../db');
const { regionOf } = require('./utils');

module.exports = {
  id: 'npc_talk',

  match(actionText, character) {
    if (!/交谈|聊天|请教|打听|拜访|搭话|闲谈|攀谈|求见|问候/.test(actionText)) return null;

    // 优先找文本中具名的存活 NPC；否则找同区域 NPC
    const all = db.prepare('SELECT * FROM xianxia_npcs WHERE is_alive = 1').all();
    let npc = all.find(n => n.name && actionText.includes(n.name));
    if (!npc) {
      const region = regionOf(character);
      const locals = all.filter(n => (n.location || '').startsWith(region));
      if (locals.length === 0) return null; // 附近没有可交谈的 NPC → 走自由叙事
      npc = locals[Math.floor(Math.random() * locals.length)];
    }
    return { npc };
  },

  resolve(character, { npc }, actionText) {
    // 固定 delta 规则（不再靠 LLM 推断数值）
    let delta = 3;
    let tone = '闲聊';
    if (/请教|求教|指点|赐教/.test(actionText)) { delta = 6; tone = '虚心请教'; }
    if (/质问|责骂|威胁|逼问/.test(actionText)) { delta = -6; tone = '言语不善'; }

    return {
      deltas: {},
      elapsedDays: 0.1,
      npcEffects: [{ npcId: npc.id, delta, reason: tone }],
      resultText: `你与${npc.identity}${npc.name}一番${tone}。${delta >= 0 ? '对方态度尚可，相谈甚欢。' : '对方脸色沉了下来，话不投机。'}`,
      renderParams: { npcName: npc.name, npcIdentity: npc.identity, tone, positive: delta >= 0 },
      options: ['继续攀谈', '向他打听消息', '告辞离开'],
    };
  },
};
