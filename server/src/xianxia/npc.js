// 修仙模拟人生 — NPC 交互引擎

const { db } = require('../db');

// 关系类型集合
const RELATION_TYPES = [
  'stranger',    // 陌生人
  'acquaintance', // 熟人
  'friend',      // 朋友
  'close_friend', // 挚友
  'master',      // 师父
  'disciple',    // 徒弟
  'lover',       // 道侣
  'rival',       // 竞争者
  'enemy',       // 仇敌
  'blood_enemy', // 血仇
  'debtor',      // 欠情者（对方欠你）
  'creditor',    // 施恩者（你欠对方）
];

/**
 * 获取或创建角色与 NPC 的关系
 */
function getOrCreateRelation(characterId, npcId) {
  const existing = db.prepare(
    'SELECT * FROM xianxia_relationships WHERE character_id = ? AND npc_id = ?'
  ).get(characterId, npcId);

  if (existing) return {
    ...existing,
    relation_types: JSON.parse(existing.relation_types || '[]'),
  };

  db.prepare(
    'INSERT INTO xianxia_relationships (character_id, npc_id, affection, relation_types) VALUES (?, ?, 0, ?)'
  ).run(characterId, npcId, JSON.stringify(['stranger']));

  return { character_id: characterId, npc_id: npcId, affection: 0, relation_types: ['stranger'], notes: null };
}

/**
 * 根据叙事内容调整 NPC 好感度
 * 返回变化量和原因描述
 */
function analyzeAffectionChange(narrative, userInput) {
  const deltas = [];
  const text = (userInput + ' ' + narrative).toLowerCase();

  // 正面行为
  const positivePhrases = [
    { pattern: /帮助|救助|救了|援手|施以援手/, delta: 15, reason: '施以援手' },
    { pattern: /赠送|送礼|赠予|相赠/, delta: 10, reason: '赠送礼物' },
    { pattern: /道谢|感谢|感激|致谢/, delta: 5, reason: '表达感激' },
    { pattern: /拜访|问候|看望|探访/, delta: 3, reason: '主动探望' },
    { pattern: /道歉|赔礼|认错|请罪/, delta: 8, reason: '诚恳道歉' },
    { pattern: /保护|守护|护住|挡在/, delta: 20, reason: '舍身保护' },
    { pattern: /坦白|承认|如实相告|说出真相/, delta: 12, reason: '坦诚相待' },
  ];

  // 负面行为
  const negativePhrases = [
    { pattern: /欺骗|撒谎|瞒|编造|假话/, delta: -15, reason: '欺骗' },
    { pattern: /背叛|出卖|告密|出卖了你/, delta: -30, reason: '背叛' },
    { pattern: /偷袭|暗算|背后下手|暗中/, delta: -25, reason: '偷袭暗算' },
    { pattern: /辱骂|嘲弄|讥笑|讽刺|挖苦/, delta: -10, reason: '言语侮辱' },
    { pattern: /偷|窃|盗|顺手牵羊/, delta: -20, reason: '偷窃' },
    { pattern: /毁约|食言|翻脸|翻脸不认/, delta: -18, reason: '背信弃义' },
    { pattern: /威胁|胁迫|逼|要挟/, delta: -12, reason: '威胁胁迫' },
  ];

  for (const { pattern, delta, reason } of positivePhrases) {
    if (pattern.test(text)) deltas.push({ delta, reason });
  }

  for (const { pattern, delta, reason } of negativePhrases) {
    if (pattern.test(text)) deltas.push({ delta, reason });
  }

  return deltas;
}

/**
 * 对特定 NPC 应用好感度变化
 */
function applyAffectionChange(characterId, npcId, delta, reason) {
  const rel = getOrCreateRelation(characterId, npcId);
  const newAffection = Math.max(-100, Math.min(100, rel.affection + delta));

  db.prepare(
    "UPDATE xianxia_relationships SET affection = ?, updated_at = datetime('now') WHERE character_id = ? AND npc_id = ?"
  ).run(newAffection, characterId, npcId);

  // 自动更新关系类型标签
  updateRelationTypes(characterId, npcId, newAffection, rel.relation_types);

  return { previous: rel.affection, current: newAffection, delta, reason };
}

/**
 * 根据好感度自动调整关系类型
 */
function updateRelationTypes(characterId, npcId, affection, existingTypes) {
  let types = [...existingTypes];

  // 移除旧的状态标签
  types = types.filter(t => !['stranger', 'acquaintance', 'friend', 'close_friend'].includes(t));

  // 根据好感度添加新标签
  if (affection >= 80) types.push('close_friend');
  else if (affection >= 40) types.push('friend');
  else if (affection >= 10) types.push('acquaintance');
  else if (affection <= -80) types = types.filter(t => t !== 'enemy'); // 变成血仇
  else if (affection <= -50) types.push('enemy');

  // 去重
  types = [...new Set(types)];

  db.prepare(
    "UPDATE xianxia_relationships SET relation_types = ?, updated_at = datetime('now') WHERE character_id = ? AND npc_id = ?"
  ).run(JSON.stringify(types), characterId, npcId);
}

/**
 * NPC 行为描述生成提示
 */
function getNpcBehaviorPrompt(npc, relation) {
  const affection = relation.affection;
  const types = relation.relation_types;
  const personality = JSON.parse(npc.personality_traits || '{}');

  let attStr = '';
  if (affection >= 70) attStr = `${npc.name}对你十分友善，言谈间有温度。`;
  else if (affection >= 30) attStr = `${npc.name}对你态度友善。`;
  else if (affection >= -10) attStr = `${npc.name}对你态度中立。`;
  else if (affection >= -40) attStr = `${npc.name}对你态度冷淡，话不多。`;
  else if (affection >= -70) attStr = `${npc.name}对你明显有敌意，言辞不善。`;
  else attStr = `${npc.name}对你不共戴天，随时可能动手。`;

  let typeStr = '';
  if (types.includes('master')) typeStr = '你们之间是师徒关系。';
  if (types.includes('disciple')) typeStr = '你们之间是师徒关系（你是师父）。';
  if (types.includes('lover')) typeStr = '你们之间是道侣关系。';
  if (types.includes('blood_enemy')) typeStr = '你们之间有血海深仇。';
  if (types.includes('enemy')) typeStr = '你们是仇敌。';
  if (types.includes('rival')) typeStr = '你们是竞争对手。';
  if (types.includes('debtor')) typeStr = `${npc.name}欠你一份人情。`;
  if (types.includes('creditor')) typeStr = `你欠${npc.name}一份人情。`;

  const persStr = [];
  if (personality.warmth >= 0.7) persStr.push('性格温暖');
  else if (personality.warmth <= 0.3) persStr.push('性格冷淡');
  if (personality.formality >= 0.7) persStr.push('说话很正式');

  return `[NPC: ${npc.name}, ${npc.identity}, ${npc.faction}]\n` +
    `[态度: ${attStr}]${typeStr ? `\n[关系: ${typeStr}]` : ''}${persStr.length > 0 ? `\n[性格: ${persStr.join('、')}]` : ''}`;
}

module.exports = {
  RELATION_TYPES,
  getOrCreateRelation,
  analyzeAffectionChange,
  applyAffectionChange,
  getNpcBehaviorPrompt,
};
