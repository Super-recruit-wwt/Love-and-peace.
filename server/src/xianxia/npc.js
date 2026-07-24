// NPC 交互引擎

const { db } = require('../db');

// 关系类型集合
const RELATION_TYPES = [
  'stranger', 'acquaintance', 'friend', 'close_friend',
  'master', 'disciple', 'lover', 'rival',
  'enemy', 'blood_enemy', 'debtor', 'creditor',
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
 * 根据叙事内容分析对 NPC 好感度的影响。
 * 改进：使用词边界匹配 + 否定句排除，减少误判。
 */
function analyzeAffectionChange(narrative, userInput) {
  const deltas = [];
  const text = userInput + ' ' + narrative;

  // 正向行为：pattern 中 (?<![不没别]) 排除否定前缀，"帮" → 匹配 "帮助" 但不匹配 "不帮"
  const positiveRules = [
    { pattern: /帮(助|忙|衬|手)/u, delta: 10, reason: '给予帮助' },
    { pattern: /救(了|助|下|回|援)/u, delta: 15, reason: '施以援手' },
    { pattern: /赠(送|予|礼)|送(礼|给)/u, delta: 10, reason: '赠送礼物' },
    { pattern: /感?谢|致谢|感激/u, delta: 5, reason: '表达感激' },
    { pattern: /拜访|问候|看望|探望/u, delta: 3, reason: '主动探望' },
    { pattern: /道歉|赔礼|认错|请罪/u, delta: 8, reason: '诚恳道歉' },
    { pattern: /保(护|住|佑)|(舍身|以身).{0,3}(护|挡)/u, delta: 20, reason: '舍身保护' },
    { pattern: /坦(白|诚)|如(实|数)相告/u, delta: 12, reason: '坦诚相待' },
  ];

  // 负面行为
  const negativeRules = [
    { pattern: /欺(骗|瞒|诈)|撒谎/u, delta: -15, reason: '欺骗' },
    { pattern: /背(叛|弃)|出卖/u, delta: -30, reason: '背叛' },
    { pattern: /偷袭|暗算|(?<![不没])背后/u, delta: -25, reason: '偷袭暗算' },
    { pattern: /辱骂|嘲弄|讥笑|讽刺|挖苦/u, delta: -10, reason: '言语侮辱' },
    { pattern: /偷(窃|盗|取|走)|(?<![随意])盗(取|走)/u, delta: -20, reason: '偷窃' },
    { pattern: /毁约|食言|翻脸/u, delta: -18, reason: '背信弃义' },
    { pattern: /威胁|(威)?逼(迫)?/u, delta: -12, reason: '威胁胁迫' },
  ];

  for (const { pattern, delta, reason } of positiveRules) {
    // 检查是否被否定词修饰（"没帮"、"不帮"、"别帮" → 不计入正面向）
    const match = text.match(pattern);
    if (match) {
      const before = text.slice(Math.max(0, match.index - 3), match.index);
      if (!/[不没别未无]/.test(before)) deltas.push({ delta, reason });
    }
  }

  for (const { pattern, delta, reason } of negativeRules) {
    if (pattern.test(text)) deltas.push({ delta, reason });
  }

  // 限制单次分析最多 3 条变化，优先绝对值大的
  deltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return deltas.slice(0, 3);
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

  // 移除旧的基于好感度的状态标签
  types = types.filter(t => !['stranger', 'acquaintance', 'friend', 'close_friend'].includes(t));

  // 根据好感度添加新标签
  if (affection >= 80) types.push('close_friend');
  else if (affection >= 40) types.push('friend');
  else if (affection >= 10) types.push('acquaintance');
  else types.push('stranger');

  if (affection <= -80) types.push('blood_enemy');
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
