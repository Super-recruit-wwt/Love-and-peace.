// 剧本：开炉炼丹 — 成功率存档待结算，接 crafting 计时锁
const { db } = require('../../db');
const { rand } = require('./utils');

module.exports = {
  id: 'alchemy_craft',

  match(actionText) {
    if (!/炼丹|开炉|炼制丹药|炼药/.test(actionText)) return null;
    return {};
  },

  resolve(character) {
    const skill = character.alchemy_skill || 0;
    const hasMaterial = db.prepare(
      "SELECT COUNT(*) c FROM xianxia_items WHERE character_id = ? AND item_type = 'material'"
    ).get(character.id).c > 0;
    // 成功率存档（v1：结算在 crafting 计时锁到期时由 breakthrough.js 统一完成）
    const successRate = Math.min(0.95, 0.4 + skill / 200 + (hasMaterial ? 0.1 : 0));
    const minutes = rand(5, 10);

    return {
      deltas: {},
      elapsedDays: 1, // 游戏内开炉耗时一日
      timer: { type: 'crafting', minutes, narrative: `炉火已起，丹药炼制中……（成丹把握约 ${Math.round(successRate * 100)}%）` },
      resultText: `你备齐炉火与药材，开炉炼丹。这一炉成丹把握约 ${Math.round(successRate * 100)}%，需静心守候火候。`,
      renderParams: { successRate: Math.round(successRate * 100), hasMaterial },
      options: [],
    };
  },
};
