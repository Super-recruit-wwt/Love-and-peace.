// 修仙模拟人生 — 突破与时间锁引擎

const { db } = require('../db');
const { formatGameAge } = require('./llm');

/**
 * 启动突破倒计时
 */
function startBreakthrough(characterId, type, durationSeconds, narrative) {
  const endAt = new Date(Date.now() + durationSeconds * 1000).toISOString();
  db.prepare(
    `UPDATE xianxia_characters SET timer_type = ?, timer_end_at = ?, timer_narrative = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(type, endAt, narrative, characterId);
}

/**
 * 检查是否有到期的计时器（时间统一为 ISO 带 Z 格式）
 */
function checkExpiredTimers(characterId) {
  const character = db.prepare('SELECT * FROM xianxia_characters WHERE id = ?').get(characterId);
  if (!character || !character.timer_end_at) return null;

  const now = new Date();
  const end = new Date(character.timer_end_at);
  if (!isNaN(end.getTime()) && now >= end) return character;
  return null;
}

/**
 * 完成突破 —— 生成突破结果的叙事
 */
async function completeBreakthrough(characterId) {
  const character = db.prepare('SELECT * FROM xianxia_characters WHERE id = ?').get(characterId);
  if (!character) return null;

  const timerType = character.timer_type;

  // 炼制类计时：简单完成，不推进修炼境界
  if (timerType === 'crafting') {
    const narrative = '炉火渐熄，炼制完成。这些时日的心血凝结成了眼前的作品，成败得失，只有上手才知。';
    const finishCrafting = db.transaction(() => {
      db.prepare(
        "UPDATE xianxia_characters SET timer_type = NULL, timer_end_at = NULL, timer_narrative = NULL, updated_at = datetime('now') WHERE id = ?"
      ).run(characterId);
      db.prepare(
        'INSERT INTO xianxia_timeline (character_id, game_time, event_type, narrative) VALUES (?, ?, ?, ?)'
      ).run(characterId, formatGameAge(character.game_age), 'crafting_done', narrative);
    });
    finishCrafting();
    return { success: true, narrative };
  }

  // 根据当前状态判定突破结果
  const results = resolveBreakthroughResult(character, timerType);

  // 清除计时器 + 更新角色属性 + 记录时间线（事务保证原子性）
  const finishBreakthrough = db.transaction(() => {
    db.prepare(
      "UPDATE xianxia_characters SET timer_type = NULL, timer_end_at = NULL, timer_narrative = NULL, updated_at = datetime('now') WHERE id = ?"
    ).run(characterId);

    if (results.newCultivation) {
      db.prepare(
        "UPDATE xianxia_characters SET cultivation_paths = ?, lifespan_remaining = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(JSON.stringify(results.newCultivation), results.newLifespan || character.lifespan_remaining, characterId);
    }

    if (results.healthChange) {
      db.prepare(
        "UPDATE xianxia_characters SET health = MAX(0, MIN(100, health + ?)), updated_at = datetime('now') WHERE id = ?"
      ).run(results.healthChange, characterId);
    }

    if (results.bodyStatus) {
      db.prepare(
        "UPDATE xianxia_characters SET body_status = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(results.bodyStatus, characterId);
    }

    // 记录到时间线
    const gameTime = formatGameAge(character.game_age);
    db.prepare(
      'INSERT INTO xianxia_timeline (character_id, game_time, event_type, narrative) VALUES (?, ?, ?, ?)'
    ).run(characterId, gameTime, 'breakthrough', results.narrative);
  });
  finishBreakthrough();

  return results;
}

/**
 * 根据角色状态判定突破结果
 */
function resolveBreakthroughResult(character, timerType) {
  const cultivation = JSON.parse(character.cultivation_paths || '{}');
  const daoHeart = character.dao_heart || 50;
  const health = character.health || 100;

  // 基础成功率：道心 / 100
  let baseRate = daoHeart / 100;

  // 如果角色健康较低，降低成功率
  if (health < 50) baseRate *= 0.7;
  if (health < 30) baseRate *= 0.5;

  // 随机判定
  const roll = Math.random();

  const narrativeTemplates = {
    success: [
      '金丹终于凝结成形，在丹田中缓缓旋转。你长出一口气，感受到体内涌动的力量——从炼气到筑基，你走过了比大多数人都远的路。',
      '天雷散去，元婴初成。你低头看着自己新生的小小虚影——那是另一个你，比现在的你更纯粹、更强大。你微微一笑：路还很长，但这是坚实的一步。',
    ],
    partial: [
      '突破几乎成功，但在最后关头灵力稍有不继。你勉强稳固了境界，但经脉隐隐作痛——未来一段时间，你需要静养恢复。',
      '天劫虽过，但一道残余的雷劲留在了你的经脉里。修为是上去了，但这道暗伤……不知何时才能痊愈。',
    ],
    failure: [
      '灵气在丹田中失控般地翻涌，最终轰然溃散。你一口鲜血喷出，修为不进反退。修仙之路，从来不会因为一次失败就关闭——但你确实需要从头来过。',
      '天雷劈下，金丹应声而碎。修为大幅倒退，你的身体也受了重创。好在命还在——只要命还在，修仙之路就还有明天。',
    ],
  };

  if (roll < baseRate * 0.85) {
    // 成功
    const template = narrativeTemplates.success[Math.floor(Math.random() * narrativeTemplates.success.length)];
    return {
      success: true,
      narrative: template,
      newCultivation: advanceCultivation(cultivation, timerType),
      newLifespan: character.lifespan_remaining + 50 + Math.floor(Math.random() * 100),
      healthChange: -10,
      bodyStatus: '轻微损耗，需要静养数日',
    };
  } else if (roll < baseRate) {
    // 部分成功（境界稳固但带伤）
    const template = narrativeTemplates.partial[Math.floor(Math.random() * narrativeTemplates.partial.length)];
    return {
      success: true,
      narrative: template,
      newCultivation: advanceCultivation(cultivation, timerType),
      healthChange: -40,
      bodyStatus: '经脉受损，一月内不可动用全力',
    };
  } else {
    // 失败
    const template = narrativeTemplates.failure[Math.floor(Math.random() * narrativeTemplates.failure.length)];
    return {
      success: false,
      narrative: template,
      healthChange: -60,
      bodyStatus: '境界倒退，身受重创',
    };
  }
}

/**
 * 推进修炼境界
 */
function advanceCultivation(cultivation, timerType) {
  const newCultivation = { ...cultivation };

  // timer_type 契约统一为 'breakthrough'（与 llm.js 的 [TIMER:breakthrough:分钟] 标记一致）
  if (timerType === 'breakthrough') {
    newCultivation.xiandao = nextXianDaoStage(cultivation.xiandao);
  }

  return newCultivation;
}

function nextXianDaoStage(current) {
  if (!current) return '炼气初期';
  const stages = ['炼气初期', '炼气中期', '炼气后期', '炼气圆满',
    '筑基初期', '筑基中期', '筑基后期', '筑基圆满',
    '金丹初期', '金丹中期', '金丹后期', '金丹圆满'];
  const idx = stages.indexOf(current);
  if (idx >= 0 && idx < stages.length - 1) return stages[idx + 1];
  return current;
}

module.exports = { startBreakthrough, checkExpiredTimers, completeBreakthrough, resolveBreakthroughResult };
