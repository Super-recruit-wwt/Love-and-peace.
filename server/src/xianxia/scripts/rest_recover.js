// 剧本：休整疗伤 — 确定性回血（休整每天+5；服药消耗一份丹药/药草追加药效）
const { db } = require('../../db');
const { parseDurationDays, parseJson, rand } = require('./utils');

module.exports = {
  id: 'rest_recover',

  match(actionText) {
    if (!/休整|休息|疗伤|养伤|静养|调养|恢复|睡一觉|歇脚|吃药|服药|服用|疗伤药/.test(actionText)) return null;
    if (/突破|冲击/.test(actionText)) return null; // 突破类走 breakthrough_attempt
    const days = Math.min(7, parseDurationDays(actionText, 1));
    return { days };
  },

  resolve(character, { days }, actionText) {
    const baseHeal = Math.round(days * 5);
    const wantsMedicine = /药|丹|服|吃/.test(actionText || '');

    // 静养≥3天：突破/走火留下的旧伤尽愈
    const injuryCleared = days >= 3 && /受创|翻涌|走火入魔|损耗|重伤/.test(character.body_status || '');
    const healSets = injuryCleared ? { body_status: '恢复康健' } : undefined;
    const healText = injuryCleared ? ' 连日的静养将旧伤彻底抚平，气血重归通畅——旧伤尽愈。' : '';

    // 服药：消耗背包中一份有治疗效果的丹药或药草
    if (wantsMedicine) {
      const meds = db.prepare(
        `SELECT id, name, item_type, effect, raw_effect FROM xianxia_items
         WHERE character_id = ? AND (item_type = 'pill' OR item_type = 'material') ORDER BY id LIMIT 20`
      ).all(character.id);
      let used = null, medHeal = 0;
      for (const m of meds) {
        const eff = m.item_type === 'pill' ? parseJson(m.effect, {}) : parseJson(m.raw_effect, {});
        if (typeof eff.health === 'number' && eff.health > 0) { used = m; medHeal = eff.health; break; }
      }
      if (used) {
        const heal = medHeal + Math.round(days * 2);
        return {
          deltas: { health: heal },
          sets: healSets,
          removeItemIds: [used.id],
          elapsedDays: days,
          resultText: `你服下${used.name}，药力化开，一股暖流自丹田散入四肢百骸。静养${days}天，伤势大为好转。（生命 +${heal}）${healText}`,
          renderParams: { outcome: 'medicine', medicine: used.name, heal },
          options: ['继续修炼', '探索四周', '前往坊市'],
        };
      }
      return {
        deltas: { health: baseHeal },
        sets: healSets,
        elapsedDays: days,
        resultText: `你翻遍行囊也没找出半粒丹药，只好安心静养。${days}天下来，伤势也好了不少。（生命 +${baseHeal}）${healText}`,
        renderParams: { outcome: 'rest_no_medicine', heal: baseHeal },
        options: ['去坊市买些丹药', '继续修炼', '探索四周'],
      };
    }

    // 纯休整：每天 +5
    return {
      deltas: { health: baseHeal },
      sets: healSets,
      elapsedDays: days,
      resultText: `你放下诸事，安心休整了${days}天。气血渐复，精神也饱满了许多。（生命 +${baseHeal}）${healText}`,
      renderParams: { outcome: 'rest', heal: baseHeal },
      options: ['继续修炼', '探索四周', '前往坊市'],
    };
  },
};
