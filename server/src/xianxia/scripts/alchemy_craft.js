// 剧本：炼丹 — 精气神修正
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
    const spiritVal = character.spirit || 30;
    const essence = character.essence || 40;
    const qiVal = character.qi || 40;
    const hasMaterial = db.prepare(
      "SELECT COUNT(*) c FROM xianxia_items WHERE character_id = ? AND item_type = 'material'"
    ).get(character.id).c > 0;

    // 成功率 = 0.4 + 技能/200 + 气/300 + 料材加成0.1
    const successRate = Math.min(0.95, 0.4 + skill / 200 + qiVal / 300 + (hasMaterial ? 0.1 : 0));
    // 炼丹时间：基础3-8分钟，受精气神影响缩短
    const baseMinutes = rand(3, 8);
    const alcAvgMod = (Math.max(0.3, 1 - essence / 300) + Math.max(0.3, 1 - (character.qi || 40) / 300) + Math.max(0.3, 1 - spiritVal / 300)) / 3;
    const minutes = Math.min(15, Math.max(0.25, Math.round(baseMinutes * alcAvgMod * 10) / 10));

    // 精低→炼丹体力消耗
    const staminaCost = Math.round(5 * (1 - essence / 200));
    const deltas = {};
    if (staminaCost > 0 && essence < 120) deltas.health = -staminaCost;

    // 神高→品质提升概率
    const qualityBoost = spiritVal >= 80 && Math.random() < 0.3;
    const qualityText = qualityBoost ? ' 你对火候的掌控比平时更加精准——这一炉丹的品质恐怕会超出预期。' : '';

    return {
      deltas,
      elapsedDays: 1,
      timer: { type: 'crafting', minutes, narrative: `炉火已起，丹药炼制中……（成丹把握约 ${Math.round(successRate * 100)}%）` },
      resultText: `你备齐炉火与药材，开炉炼丹。这一炉成丹把握约 ${Math.round(successRate * 100)}%，需静心守候火候。${qualityText}`,
      renderParams: { successRate: Math.round(successRate * 100), hasMaterial, qualityBoost },
      options: [],
    };
  },
};
