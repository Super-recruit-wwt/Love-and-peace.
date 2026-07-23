// 悟性成长体系 —— 与三元平行："一切成长有出处、单源有限"
// 途径：
//   1. 功法深造顿悟：每部功法首次修至 大成+1 / 圆满+1 / 自创变式+2（深度只升不降，天然幂等）
//   2. 神魂滋养：神达到 60/120/200/300 各 +2（里程碑入库，防秘术耗神跌落后再涨反复领取）
//   3. 破境顿悟：大境界 +2（breakthrough.js 以 bonus 传入）、小境界 +1（breakthrough_attempt 直接入 deltas）
//   4. 悟道类机缘事件（fortune_events.json 已有的 comprehension 词条，不经此模块）
const { db } = require('../db');
const { parseJson } = require('./scripts/utils');

const DEPTH_INSIGHT = { 2: 1, 3: 1, 4: 2 }; // 按深度档位：大成/圆满/自创变式
const SPIRIT_MILESTONES = [60, 120, 200, 300];
const SPIRIT_INSIGHT = 2;

/**
 * 功法深造顿悟（纯函数）：比较 before/after 两份 learned_techniques 快照，
 * 对每部功法新跨过的深度档位累加悟性。深度单调不减，重复结算同一快照不会重复给。
 */
function depthInsightDelta(beforeJson, afterJson) {
  const before = parseJson(beforeJson, []);
  const after = parseJson(afterJson, []);
  const beforeDepth = {};
  for (const e of before) beforeDepth[e.name] = e.depth || 0;
  let delta = 0;
  for (const e of after) {
    const b = beforeDepth[e.name] || 0;
    for (let d = b + 1; d <= (e.depth || 0); d++) delta += DEPTH_INSIGHT[d] || 0;
  }
  return delta;
}

/**
 * 神魂里程碑（纯函数）：返回 { delta, claimed }。
 * spirit 达到未领取的档位即给悟性；claimed 为合并后的里程碑列表（调用方负责落库）。
 */
function spiritMilestoneDelta(milestonesJson, spirit) {
  const claimed = parseJson(milestonesJson, []);
  const newOnes = SPIRIT_MILESTONES.filter(m => (spirit || 0) >= m && !claimed.includes(m));
  return { delta: newOnes.length * SPIRIT_INSIGHT, claimed: claimed.concat(newOnes) };
}

/**
 * 悟性统一结算（写库）：功法深造 + 神魂里程碑 + 额外 bonus（大境界突破 +2）。
 * 读库取最新 spirit/comprehension，总额 <= 0 不动库返回 null；
 * 否则一次性入账（clamp 100）并落库里程碑，返回 { total, depthDelta, spiritDelta, bonus }。
 */
function settleComprehension(characterId, { beforeLearned, afterLearned, bonus = 0 } = {}) {
  const c = db.prepare('SELECT comprehension, spirit, insight_milestones FROM xianxia_characters WHERE id = ?').get(characterId);
  if (!c) return null;
  const depthDelta = (beforeLearned !== undefined && afterLearned !== undefined)
    ? depthInsightDelta(beforeLearned, afterLearned)
    : 0;
  const sp = spiritMilestoneDelta(c.insight_milestones, c.spirit || 0);
  const total = depthDelta + sp.delta + (bonus || 0);
  if (total <= 0) return null;
  db.prepare("UPDATE xianxia_characters SET comprehension = MIN(100, COALESCE(comprehension, 50) + ?), insight_milestones = ?, updated_at = datetime('now') WHERE id = ?")
    .run(total, JSON.stringify(sp.claimed), characterId);
  return { total, depthDelta, spiritDelta: sp.delta, bonus: bonus || 0 };
}

module.exports = {
  DEPTH_INSIGHT,
  SPIRIT_MILESTONES,
  SPIRIT_INSIGHT,
  depthInsightDelta,
  spiritMilestoneDelta,
  settleComprehension,
};
