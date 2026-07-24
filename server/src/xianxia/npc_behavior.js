// NPC 半主动行为引擎
// 每次 processAction 完成后 8% 概率触发

const { db } = require('../db');

const BEHAVIOR_TEMPLATES = {
  blood_enemy_hunt: {
    condition: (rel, character) => rel.affection <= -50,
    weight: 3,
    narrativeTemplate: (npc, character) =>
      `你在街上走着，忽然脊背一凉——一个熟悉的身影从巷口闪过，你认得那双眼睛。${npc.name}找上门来了。`,
    effects: { relationDelta: -5, reason: '寻仇' },
    options: ['应战', '躲避', '试图交涉'],
  },
  enemy_hunt: {
    condition: (rel) => rel.affection <= -50,
    weight: 2,
    narrativeTemplate: (npc) => `${npc.name}出现在你面前。没什么好说的——你们之间的胜负还没分。`,
    effects: { relationDelta: -5 },
    options: ['应战', '躲避', '试图交涉'],
  },
  master_letter: {
    condition: (rel) => rel.relation_types.includes('master') && rel.affection >= 20,
    weight: 2,
    narrativeTemplate: (npc) => `一只传讯灵鹤落在你的肩上，腿上绑着一封短信。是${npc.name}的字迹——「近来可好？修行可有长进？」`,
    effects: { deltas: { dao_heart: 3, qi: 2 }, relationDelta: 0 },
    options: ['回信问候', '汇报修为进展', '暂且不回'],
  },
  friend_visit: {
    condition: (rel) => rel.relation_types.includes('close_friend') && rel.affection >= 60,
    weight: 1,
    narrativeTemplate: (npc) => `你听到窗外有脚步声，然后是敲门声——是${npc.name}，当初那个跟你一起闯过迷雾森林的家伙。他笑着歪着头看你：「你还活着。好事。」`,
    effects: { deltas: { dao_heart: 3, qi: 3 }, relationDelta: 2 },
    options: ['邀他共饮', '听他讲故事', '向他打听消息'],
  },
  lover_miss: {
    condition: (rel) => rel.relation_types.includes('lover') && rel.affection >= 40,
    weight: 2,
    narrativeTemplate: (npc) => `你已经很久没回去了。那天晚上你在梦里听到了${npc.name}的声音——「你在哪里？」醒来时你发现你已经站在门外，不知道什么时候走出去的。`,
    effects: { relationDelta: -5, reason: '久未相见' },
    options: ['立即回去', '寄信解释', '继续前行'],
  },
  lover_leave: {
    condition: (rel) => rel.relation_types.includes('lover') && rel.affection <= -20,
    weight: 1,
    narrativeTemplate: (npc) => `一封信安静地躺在你的行囊里。是${npc.name}的字迹。「我知道你不可能跟现在的我在一起。但我还是想告诉你——我恨你。」`,
    effects: { relationDelta: -40, newType: 'enemy', reason: '道侣断义' },
    options: ['追回去解释', '接受她的选择', '继续前行'],
  },
  debtor_repay: {
    condition: (rel) => rel.relation_types.includes('debtor') && rel.affection >= 30,
    weight: 1,
    narrativeTemplate: (npc) => `${npc.name}找到了你——「上次的事还没谢你。这个你收下。」`,
    effects: { deltas: { spirit_stones: 50 }, relationDelta: 5 },
    options: ['推辞不受', '收下道谢', '请他帮忙另一件事'],
  },
  creditor_ask: {
    condition: (rel) => rel.relation_types.includes('creditor') && rel.affection >= 30,
    weight: 1,
    narrativeTemplate: (npc) => `${npc.name}找到你：「当年那件事——我需要你兑现了。」`,
    effects: {},
    options: ['答应他的请求', '婉拒', '讨价还价'],
  },
};

// 全局防重复记录：Map<characterId, Map<npcId, Set<behaviorKey>>>
// 5 分钟后自动清除单个条目；1000 次触发后全量清理死亡角色
const recentBehaviors = new Map();
let behaviorCounter = 0;

/** 惰性清理：删除已不存在的角色条目 + 清理单角色内超 5 条的行为记录 */
function lazyCleanup(characterId) {
  behaviorCounter++;
  // 全量清理：每 1000 次触发一次
  if (behaviorCounter >= 1000) {
    behaviorCounter = 0;
    for (const [cid] of recentBehaviors) {
      const exists = db.prepare('SELECT 1 FROM xianxia_characters WHERE id = ?').get(cid);
      if (!exists) recentBehaviors.delete(cid);
    }
    const maxSize = 500;
    if (recentBehaviors.size > maxSize) {
      const keys = [...recentBehaviors.keys()].slice(0, recentBehaviors.size - maxSize);
      for (const k of keys) recentBehaviors.delete(k);
    }
  }
  // 单角色内清理：保持行为记录 ≤ 5 条
  const npcMap = recentBehaviors.get(characterId);
  if (npcMap && npcMap.size > 5) {
    const keys = [...npcMap.keys()].slice(0, npcMap.size - 5);
    for (const k of keys) npcMap.delete(k);
    if (npcMap.size === 0) recentBehaviors.delete(characterId);
  }
}

function triggerNpcBehavior(characterId) {
  if (Math.random() > 0.08) return { triggered: false };

  // 获取角色
  const character = db.prepare('SELECT * FROM xianxia_characters WHERE id = ?').get(characterId);
  if (!character || character.status !== 'active') return { triggered: false };

  // 获取NPC关系
  const rels = db.prepare(
    `SELECT xr.*, xn.name, xn.identity, xn.faction, xn.personality_traits
     FROM xianxia_relationships xr
     JOIN xianxia_npcs xn ON xr.npc_id = xn.id
     WHERE xr.character_id = ? AND xn.is_alive = 1`
  ).all(characterId);

  if (rels.length === 0) return { triggered: false };

  // 加权随机选NPC
  const weighted = [];
  for (const rel of rels) {
    const types = JSON.parse(rel.relation_types || '[]');
    for (const [key, tmpl] of Object.entries(BEHAVIOR_TEMPLATES)) {
      if (tmpl.condition({ ...rel, relation_types: types }, character)) {
        weighted.push({ rel, types, tmpl, key, weight: tmpl.weight });
      }
    }
  }

  if (weighted.length === 0) return { triggered: false };

  // 加权随机选
  const totalW = weighted.reduce((s, w) => s + w.weight, 0);
  let rand = Math.random() * totalW;
  let chosen = null;
  for (const w of weighted) {
    rand -= w.weight;
    if (rand <= 0) { chosen = w; break; }
  }
  if (!chosen) chosen = weighted[weighted.length - 1];

  // 防重复：5 分钟内同一 NPC 同一行为不重复触发
  const npcMap = recentBehaviors.get(characterId);
  if (npcMap) {
    const behaviorSet = npcMap.get(chosen.rel.npc_id);
    if (behaviorSet && behaviorSet.has(chosen.key)) return { triggered: false };
  }

  const npc = { name: chosen.rel.name, identity: chosen.rel.identity, faction: chosen.rel.faction };
  const narrative = chosen.tmpl.narrativeTemplate(npc, character);

  // 应用好感度变化
  const npcEffects = [];
  if (chosen.tmpl.effects.relationDelta) {
    npcEffects.push({
      npcId: chosen.rel.npc_id,
      delta: chosen.tmpl.effects.relationDelta,
      reason: chosen.tmpl.effects.reason || chosen.key,
    });
  }

  // 应用属性变化
  const deltas = chosen.tmpl.effects.deltas || {};

  // 记录防重复（5 分钟后清除）
  if (!recentBehaviors.has(characterId)) recentBehaviors.set(characterId, new Map());
  const cm = recentBehaviors.get(characterId);
  if (!cm.has(chosen.rel.npc_id)) cm.set(chosen.rel.npc_id, new Set());
  cm.get(chosen.rel.npc_id).add(chosen.key);
  setTimeout(() => {
    const cm2 = recentBehaviors.get(characterId);
    if (cm2) {
      const s = cm2.get(chosen.rel.npc_id);
      if (s) { s.delete(chosen.key); if (s.size === 0) cm2.delete(chosen.rel.npc_id); }
      if (cm2.size === 0) recentBehaviors.delete(characterId);
    }
  }, 300000);

  lazyCleanup(characterId);

  return {
    triggered: true,
    narrative,
    npcEffects,
    deltas,
    options: chosen.tmpl.options || [],
    behaviorType: chosen.key,
    npcName: npc.name,
  };
}

module.exports = { triggerNpcBehavior };
