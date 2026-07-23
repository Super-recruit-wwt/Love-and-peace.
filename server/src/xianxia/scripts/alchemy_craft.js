// 剧本：炼丹 — 精气神修正 + 指定丹方（含突破丹）+ 材料消耗 + 技能门槛
const { db } = require('../../db');
const { rand } = require('./utils');
const techniques = require('../techniques');
const PILLS = require('../seeds/pills.json');

// 从行动文本识别目标丹药（如"炼制筑基丹"）；未识别返回 null（通用炼丹）
function matchPill(actionText) {
  let best = null;
  for (const p of PILLS) {
    if (actionText.includes(p.name) && (!best || p.name.length > best.name.length)) best = p;
  }
  return best;
}

module.exports = {
  id: 'alchemy_craft',

  match(actionText) {
    if (!/炼丹|开炉|炼制丹药|炼药|炼一炉|炼枚|炼颗|炼制.{1,6}丹/.test(actionText)) return null;
    return { pill: matchPill(actionText) };
  },

  resolve(character, { pill }) {
    const skill = character.alchemy_skill || 0;
    const spiritVal = character.spirit || 30;
    const essence = character.essence || 40;
    const qiVal = character.qi || 40;

    // 匠艺触类旁通：炼丹时秘术类功法积累深度经验（主修秘术 ×1.5）
    const craftTechniqueExp = () => {
      const secMain = techniques.getMainOfType(character, 'secret');
      const r = techniques.gainDepthExp(character, 8, {
        type: 'secret', boostName: secMain && secMain.name, boostMult: 1.5, otherMult: 1,
      });
      if (r.gains.length === 0) return {};
      const out = { learned_techniques: JSON.stringify(r.list) };
      const ups = r.gains.filter(g => g.levelUps.length > 0);
      if (ups.length > 0) {
        out.levelUpText = ` 炉前火候与${ups.map(g => `《${g.name}》`).join('、')}的关窍隐隐相通，领悟更进一层。`;
      }
      return out;
    };
    const craftExp = craftTechniqueExp();
    const craftSets = craftExp.learned_techniques ? { learned_techniques: craftExp.learned_techniques } : {};

    // ===== 指定丹方路径（筑基丹/结金丹等突破丹与常用丹） =====
    if (pill) {
      // 技能门槛
      if (skill < pill.skill) {
        return {
          deltas: {}, elapsedDays: 0.5,
          resultText: `你翻出${pill.name}的丹方细细研读，却发现其中火候变化远超你现在的造诣——炼制${pill.name}至少需要炼丹术 ${pill.skill} 点，而你只有 ${skill} 点。贸然开炉只会白白糟蹋药材。`,
          renderParams: { outcome: 'skill_gate', pill: pill.name, need: pill.skill, skill },
          options: ['炼些普通丹药练手', '请教炼丹师长', '先去忙别的'],
        };
      }

      // 材料检查（按名称逐味核对）
      const lacks = [];
      const consumeIds = [];
      for (const m of pill.materials || []) {
        const rows = db.prepare(
          "SELECT id FROM xianxia_items WHERE character_id = ? AND item_type = 'material' AND name = ? ORDER BY id LIMIT ?"
        ).all(character.id, m.name, m.qty);
        if (rows.length < m.qty) lacks.push(`${m.name}×${m.qty - rows.length}`);
        else consumeIds.push(...rows.map(r => r.id));
      }
      if (lacks.length > 0) {
        const needText = (pill.materials || []).map(m => `${m.name}×${m.qty}`).join('、');
        return {
          deltas: {}, elapsedDays: 0.5,
          resultText: `你铺开${pill.name}的丹方：需${needText}。清点行囊，还缺${lacks.join('、')}。材料不齐，开炉无益。`,
          renderParams: { outcome: 'material_lack', pill: pill.name, lacks },
          options: ['去采集材料', '去坊市购买材料', '先去忙别的'],
        };
      }

      // 成功率 = 0.4 + 技能/200 + 气/300 + 0.1（丹方明确，保底加成）
      const successRate = Math.min(0.95, 0.4 + skill / 200 + qiVal / 300 + 0.1);
      const baseMinutes = rand(3, 8);
      const alcAvgMod = (Math.max(0.3, 1 - essence / 300) + Math.max(0.3, 1 - qiVal / 300) + Math.max(0.3, 1 - spiritVal / 300)) / 3;
      const minutes = Math.min(15, Math.max(0.25, Math.round(baseMinutes * alcAvgMod * 10) / 10));

      const staminaCost = Math.round(5 * (1 - essence / 200));
      const deltas = {};
      if (staminaCost > 0 && essence < 120) deltas.health = -staminaCost;

      const qualityBoost = spiritVal >= 80 && Math.random() < 0.3;
      const needText = (pill.materials || []).map(m => `${m.name}×${m.qty}`).join('、');

      return {
        deltas,
        removeItemIds: consumeIds, // 开炉投料，成败皆耗
        sets: {
          pending_craft: JSON.stringify({
            name: pill.name, grade: pill.grade, effect: pill.effect,
            successRate, qualityBoost,
          }),
          ...craftSets,
        },
        elapsedDays: 1,
        timer: { type: 'crafting', minutes, narrative: `${pill.name}炼制中……（成丹把握约 ${Math.round(successRate * 100)}%）` },
        resultText: `你按丹方投入${needText}，开炉炼制${pill.name}。这一炉成丹把握约 ${Math.round(successRate * 100)}%，需静心守候火候。${qualityBoost ? ' 你对火候的掌控比平时更加精准——这一炉丹的品质恐怕会超出预期。' : ''}${craftExp.levelUpText || ''}`,
        renderParams: { outcome: 'crafting_pill', pill: pill.name, successRate: Math.round(successRate * 100), qualityBoost },
        options: [],
      };
    }

    // ===== 通用炼丹路径（未指定丹方，维持原流程） =====
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
      sets: Object.keys(craftSets).length > 0 ? craftSets : undefined,
      elapsedDays: 1,
      timer: { type: 'crafting', minutes, narrative: `炉火已起，丹药炼制中……（成丹把握约 ${Math.round(successRate * 100)}%）` },
      resultText: `你备齐炉火与药材，开炉炼丹。这一炉成丹把握约 ${Math.round(successRate * 100)}%，需静心守候火候。${qualityText}（想炼特定丹药？直接说"炼制筑基丹"这样的丹名即可。）${craftExp.levelUpText || ''}`,
      renderParams: { successRate: Math.round(successRate * 100), hasMaterial, qualityBoost },
      options: [],
    };
  },
};
