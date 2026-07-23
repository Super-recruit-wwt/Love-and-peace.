// 修仙模拟人生 — 突破与时间锁引擎

const { db } = require('../db');
const { formatGameAge } = require('./llm');
const { qiMaxForStage, prevXianStageWithinRealm, bigRealmOf, cultivationTier, parseJson } = require('./scripts/utils');

const ri = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

// 目标大境界 → 对应突破丹药（背包中自动服下一枚，提升成功率并护体）
const BREAKTHROUGH_PILLS = {
  '筑基': '筑基丹', '金丹': '结金丹', '元婴': '化婴丹',
  '化神': '渡劫丹', '炼虚': '渡劫丹', '合体': '渡劫丹', '大乘': '渡劫丹', '渡劫': '渡劫丹',
};

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

    // 诡道突破：更新异化度
    if (results.corruptionDelta) {
      db.prepare(
        "UPDATE xianxia_characters SET strange_corruption = MAX(0, strange_corruption + ?), updated_at = datetime('now') WHERE id = ?"
      ).run(results.corruptionDelta, characterId);
    }

    // 失败附带属性变化（如走火入魔：道心/神 -10，clamp 0-100）
    for (const [key, delta] of Object.entries(results.deltas || {})) {
      if (!delta) continue;
      db.prepare(
        `UPDATE xianxia_characters SET ${key} = MAX(0, MIN(100, ${key} + ?)), updated_at = datetime('now') WHERE id = ?`
      ).run(delta, characterId);
    }

    // 修为上限随境界成长（突破成功升上限 / 重伤跌落降上限，当前修为不超过新上限）
    if (results.newQiMax) {
      db.prepare(
        "UPDATE xianxia_characters SET qi_max = ?, qi_current = MIN(qi_current, ?), updated_at = datetime('now') WHERE id = ?"
      ).run(results.newQiMax, results.newQiMax, characterId);
    }

    // 记录到时间线（带后续行动选项，供前端"当下可行"衔接）
    const gameTime = formatGameAge(character.game_age);

    // 陨落：角色死亡 + 传世记录 + 死亡时间线
    if (results.died) {
      const finalCultivation = Object.values(JSON.parse(character.cultivation_paths || '{}'))
        .filter(Boolean).join('、') || '未入道门';
      db.prepare("UPDATE xianxia_characters SET status = 'dead', health = 0, updated_at = datetime('now') WHERE id = ?")
        .run(characterId);
      db.prepare(
        'INSERT INTO xianxia_legacy (character_id, death_cause, death_narrative, final_cultivation, final_age, legacy_type) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(characterId, '突破陨落', results.narrative, finalCultivation, Math.floor(character.game_age || 0), 'breakthrough_death');
      db.prepare(
        'INSERT INTO xianxia_timeline (character_id, game_time, event_type, narrative) VALUES (?, ?, ?, ?)'
      ).run(characterId, gameTime, 'death', results.narrative);
    }

    const settleOptions = results.died
      ? null
      : results.success
        ? ['继续修炼', '外出历练一番', '前往坊市']
        : ['静养休整', '继续修炼稳固', '外出走走'];
    db.prepare(
      'INSERT INTO xianxia_timeline (character_id, game_time, event_type, narrative, options) VALUES (?, ?, ?, ?, ?)'
    ).run(characterId, gameTime, 'breakthrough', results.narrative, settleOptions ? JSON.stringify(settleOptions) : null);
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
  const essence = character.essence || 40;
  const spiritVal = character.spirit || 30;
  const qiVal = character.qi || 40;

  // 诡道突破：神替代道心
  if (timerType === 'strange_breakthrough') {
    let baseRate = Math.min(1, (spiritVal + qiVal) / 200);
    if (health < 50) baseRate *= 0.6;
    if (health < 30) baseRate *= 0.4;
    const roll = Math.random();
    const strangeStages = ['初触','共生','同化','深渊','化诡','噬主','规则掌控'];

    if (roll < baseRate * 0.85) {
      return {
        success: true,
        narrative: '你感到体内的东西在收缩——不是在退缩，是在积蓄力量。但那也是你的力量。你抓住了它。你们之间的界限又模糊了几分。',
        newCultivation: advanceCultivation(cultivation, timerType),
        healthChange: -15,
        bodyStatus: '异化加深，但尚在可控范围',
        corruptionDelta: 3,
      };
    } else if (roll < baseRate) {
      return {
        success: true,
        narrative: '你几乎成功了。但最后关头它动了——不是挣扎，是轻声说了一句话。你松手了。修为上去了，但它也上去了。',
        newCultivation: advanceCultivation(cultivation, timerType),
        healthChange: -35,
        bodyStatus: '异化明显加速，需尽快压制',
        corruptionDelta: 5,
      };
    } else {
      return {
        success: false,
        narrative: '你试图压制它。它笑了——不是你耳朵听到的笑，是你的骨头里传来的。你失败了。你知道你很弱。',
        healthChange: -45,
        bodyStatus: '体内失控，异化程度大幅上升',
        corruptionDelta: 10,
      };
    }
  }

  // 仙道突破
  let baseRate = Math.min(1, daoHeart / 100);
  // 精低→降成功率
  if (essence < 50) baseRate *= 0.85;
  if (essence < 30) baseRate *= 0.7;
  // 神低→心魔
  if (spiritVal < 30) baseRate *= 0.5;
  // 气低→灵力不济
  if (qiVal < 30) baseRate *= 0.8;
  if (qiVal < 20) baseRate *= 0.6;
  // 健康修正
  if (health < 50) baseRate *= 0.7;
  if (health < 30) baseRate *= 0.5;

  const roll = Math.random();

  // 叙事必须跟随真实境界变动：先算出 from → to，再按是否跨大境界生成文案
  const fromStage = cultivation.xiandao || '炼气初期';
  const toStage = nextXianDaoStage(fromStage);
  const toBig = bigRealmOf(toStage);
  const crossBigRealm = toBig !== bigRealmOf(fromStage);

  // 突破丹药：按目标大境界自动服下一枚对应丹药（提升成功率，并护体压低走火/重伤概率）
  let pillUsed = null;
  const pillName = BREAKTHROUGH_PILLS[toBig];
  if (pillName && character.id) {
    const pill = db.prepare(
      "SELECT id, name, effect FROM xianxia_items WHERE character_id = ? AND name = ? AND item_type = 'pill' ORDER BY id LIMIT 1"
    ).get(character.id, pillName);
    if (pill) {
      const eff = parseJson(pill.effect, {});
      const bonus = typeof eff.breakthrough_bonus === 'number' ? eff.breakthrough_bonus : (pillName === '渡劫丹' ? 0.2 : 0.15);
      db.prepare('DELETE FROM xianxia_items WHERE id = ?').run(pill.id);
      pillUsed = pillName;
      baseRate = Math.min(0.95, baseRate + bonus);
    }
  }
  const pillPrefix = pillUsed
    ? `你预先服下一枚${pillUsed}，药力化作暖流沉入丹田，护住心脉，灵力运转愈发圆融。`
    : '';

  if (roll < baseRate * 0.85) {
    // 成功
    const narrative = crossBigRealm
      ? `${pillPrefix}丹田之中灵力轰然冲开那道无形壁障——${fromStage}的桎梏就此跨过，你正式踏入${toStage}。你长出一口气，感受到体内涌动的、前所未有的力量。`
      : `${pillPrefix}壁障在灵力的持续冲击下悄然碎裂。你缓缓睁眼，气息比闭关前凝实了几分——你已从${fromStage}迈入${toStage}。`;
    return {
      success: true,
      narrative,
      newCultivation: advanceCultivation(cultivation, timerType),
      newLifespan: character.lifespan_remaining + 50 + Math.floor(Math.random() * 100),
      newQiMax: qiMaxForStage(toStage),
      healthChange: -10,
      bodyStatus: '轻微损耗，需要静养数日',
    };
  } else if (roll < baseRate) {
    // 部分成功（境界提升但带伤）
    return {
      success: true,
      narrative: `${pillPrefix}突破几乎失败——最后关头灵力稍有不继，你勉强在${toStage}站稳了脚跟，但经脉隐隐作痛。未来一段时间，你需要静养恢复。`,
      newCultivation: advanceCultivation(cultivation, timerType),
      newQiMax: qiMaxForStage(toStage),
      healthChange: -40,
      bodyStatus: '经脉受损，一月内不可动用全力',
    };
  }

  // ===== 失败：三档风险（轻伤 / 重伤 / 走火入魔）+ 陨落 =====
  const failReason = daoHeart < 50 ? '道心不足'
    : health < 60 ? '带伤硬闯'
    : spiritVal < 40 ? '神识不稳'
    : '时运未至';

  // 陨落：渡劫天险，或带重伤硬闯
  const deathP = (toBig === '渡劫' ? 0.08 : 0) + (health < 30 ? 0.05 : 0);
  if (deathP > 0 && Math.random() < deathP) {
    return {
      success: false,
      died: true,
      narrative: `${pillPrefix}你倾尽毕生修为冲击${toStage}——壁障之后传来的反噬远超想象，灵力逆冲心脉，周身经脉寸寸崩断。你的意识在一声轰鸣中散去，这一世的求道之路，到此为止。（${failReason}）`,
      healthChange: -100,
    };
  }

  const tier = cultivationTier(character);
  const tierRoll = Math.random();

  // 走火入魔：境界越高风险越大；丹药护体减半，神足者心魔难侵
  let devilP = Math.min(0.3, 0.05 + tier * 0.03);
  if (pillUsed) devilP *= 0.5;
  if (spiritVal >= 60) devilP *= 0.7;
  if (tierRoll < devilP) {
    return {
      success: false,
      failTier: '走火入魔',
      narrative: `${pillPrefix}冲击${toStage}的关头，灵力骤然失控——逆行的真气搅乱识海，你走火入魔了。道心受创，神识涣散，需长久静养方能平复。（${failReason}，走火入魔：道心 -10，神 -10）`,
      healthChange: -ri(25, 35),
      deltas: { dao_heart: -10, spirit: -10 },
      bodyStatus: '走火入魔：道心受损，神识涣散，修炼效率大减，需静养良久',
    };
  }

  // 重伤：跌落一个小境界（已是初期则修为散逸）；丹药护体、精足者概率降低
  let heavyP = 0.35;
  if (pillUsed) heavyP *= 0.6;
  if (essence >= 60) heavyP *= 0.8;
  if (tierRoll < devilP + heavyP) {
    const prevStage = prevXianStageWithinRealm(fromStage);
    return {
      success: false,
      failTier: '重伤',
      narrative: pillPrefix + (prevStage
        ? `壁障的反噬如山洪倒灌，你喷出一口鲜血，体内灵力如潮水般退散——境界竟从${fromStage}跌落回${prevStage}。（${failReason}，重伤）`
        : `壁障的反噬如山洪倒灌，你喷出一口鲜血，修为散逸大半，境界摇摇欲坠，险些跌落。（${failReason}，重伤）`),
      healthChange: -ri(40, 50),
      bodyStatus: '重伤：经脉寸断般剧痛，需静养多日方可恢复',
      newCultivation: prevStage ? { ...cultivation, xiandao: prevStage } : null,
      newQiMax: prevStage ? qiMaxForStage(prevStage) : null,
    };
  }

  // 轻伤（默认档）
  return {
    success: false,
    failTier: '轻伤',
    narrative: `${pillPrefix}你拼尽全力冲击${toStage}的壁障，灵力却在最后关头轰然溃散。一口逆血涌上喉头，经脉受创——境界仍停留在${fromStage}。好在伤势不重，仙路不会因为一次失败就关闭。（${failReason}，轻伤）`,
    healthChange: -ri(20, 30),
    bodyStatus: '经脉受创：修炼效率减半，静养数日可愈',
  };
}

/**
 * 推进修炼境界
 */
function advanceCultivation(cultivation, timerType) {
  const newCultivation = { ...cultivation };

  if (timerType === 'breakthrough') {
    newCultivation.xiandao = nextXianDaoStage(cultivation.xiandao);
  } else if (timerType === 'strange_breakthrough') {
    newCultivation.strange = nextStrangeStage(cultivation.strange);
  }

  return newCultivation;
}

const STRANGE_STAGES = ['初触', '共生', '同化', '深渊', '化诡', '噬主', '规则掌控'];

function nextStrangeStage(current) {
  if (!current) return '初触';
  const idx = STRANGE_STAGES.indexOf(current);
  if (idx >= 0 && idx < STRANGE_STAGES.length - 1) return STRANGE_STAGES[idx + 1];
  return current;
}

function nextXianDaoStage(current) {
  if (!current) return '炼气初期';
  const stages = ['炼气初期', '炼气中期', '炼气后期', '炼气圆满',
    '筑基初期', '筑基中期', '筑基后期', '筑基圆满',
    '金丹初期', '金丹中期', '金丹后期', '金丹圆满',
    '元婴初期', '元婴中期', '元婴后期', '元婴圆满',
    '化神初期', '化神中期', '化神后期', '化神圆满',
    '炼虚初期', '炼虚中期', '炼虚后期', '炼虚圆满',
    '合体初期', '合体中期', '合体后期', '合体圆满',
    '大乘初期', '大乘中期', '大乘后期', '大乘圆满',
    '渡劫初期', '渡劫中期', '渡劫后期', '渡劫圆满',
    '飞升'];
  const idx = stages.indexOf(current);
  if (idx >= 0 && idx < stages.length - 1) return stages[idx + 1];
  return current;
}

module.exports = { startBreakthrough, checkExpiredTimers, completeBreakthrough, resolveBreakthroughResult };

