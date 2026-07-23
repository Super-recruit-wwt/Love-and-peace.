// 修仙模拟人生 — 世界状态初始化

const { db } = require('../db');

const DEFAULT_WORLD_STATE = {
  game_year: 1,
  era_name: '开天纪',
  active_events: [],
  faction_relations: {
    // 中州
    '太虚剑宗-浑天宗': { relation: 'competitive', tension: 30 },
    '太虚剑宗-金刚寺': { relation: 'allied', tension: 0 },
    '丹霞谷-天机阁': { relation: 'neutral', tension: 10 },
    '丹霞谷-万象商会': { relation: 'allied', tension: 0 },
    // 北荒
    '铁骨门-寒冰宗': { relation: 'neutral', tension: 15 },
    // 南疆
    '万毒教-蛊神宗': { relation: 'hostile', tension: 70 },
    '万毒教-青木宗': { relation: 'neutral', tension: 25 },
    // 东海
    '碧水宫-龙血殿': { relation: 'antagonistic', tension: 45 },
    '碧水宫-海妖一族': { relation: 'cold_peace', tension: 35 },
    // 西漠
    '大周-北朔': { relation: 'hostile', tension: 60 },
    '大周-西凉': { relation: 'neutral', tension: 20 },
    '搬山宗-白骨观': { relation: 'enemies', tension: 80 },
    // 跨区域
    '太虚剑宗-万毒教': { relation: 'enemies', tension: 55 },
    '浑天宗-血河宗': { relation: 'enemies', tension: 50 },
    '万象商会-暗香楼': { relation: 'neutral', tension: 15 },
  },
  secret_realms: {
    '深渊裂隙': { status: 'active', location: '北荒极深处', danger: 'extreme' },
    '海底古遗迹': { status: 'dormant', location: '东海深处', danger: 'high' },
    '雾中村': { status: 'active', location: '南疆密林', danger: 'unknown' },
  },
};

const FIXED_NPCS = [
  // 中州
  {
    name: '剑渊真人', identity: '太虚剑宗掌门', faction: '太虚剑宗', location: '中州-太虚山',
    personality_type: '严师', strength_level: '大乘后期',
    traits: { warmth: 0.2, assertiveness: 0.9, conscientiousness: 0.95, formality: 0.9, extraversion: 0.15, emotionalStability: 0.95, openness: 0.3, humor: 0.1, agreeableness: 0.3 }
  },
  {
    name: '元一道人', identity: '浑天宗掌门', faction: '浑天宗', location: '中州-浑天山',
    personality_type: '权谋者', strength_level: '大乘中期',
    traits: { warmth: 0.35, assertiveness: 0.8, conscientiousness: 0.85, formality: 0.7, extraversion: 0.6, emotionalStability: 0.9, openness: 0.75, humor: 0.5, agreeableness: 0.3 }
  },
  {
    name: '丹阳子', identity: '丹霞谷谷主', faction: '丹霞谷', location: '中州-丹霞谷',
    personality_type: '商人', strength_level: '炼虚圆满',
    traits: { warmth: 0.6, assertiveness: 0.6, conscientiousness: 0.85, formality: 0.5, extraversion: 0.65, emotionalStability: 0.85, openness: 0.5, humor: 0.7, agreeableness: 0.6 }
  },
  {
    name: '天机老人', identity: '天机阁阁主', faction: '天机阁', location: '中州-天机阁',
    personality_type: '隐世高人', strength_level: '炼虚后期',
    traits: { warmth: 0.5, assertiveness: 0.3, conscientiousness: 0.7, formality: 0.2, extraversion: 0.1, emotionalStability: 0.95, openness: 0.95, humor: 0.6, agreeableness: 0.5 }
  },
  {
    name: '渡厄禅师', identity: '金刚寺方丈', faction: '金刚寺', location: '中州-金刚寺',
    personality_type: '冷酷派', strength_level: '炼虚圆满',
    traits: { warmth: 0.4, assertiveness: 0.7, conscientiousness: 0.95, formality: 0.6, extraversion: 0.2, emotionalStability: 0.95, openness: 0.4, humor: 0.15, agreeableness: 0.5 }
  },
  {
    name: '兽王', identity: '万兽山山主', faction: '万兽山', location: '中州北境',
    personality_type: '痴人', strength_level: '炼虚中期',
    traits: { warmth: 0.4, assertiveness: 0.6, conscientiousness: 0.5, formality: 0.3, extraversion: 0.4, emotionalStability: 0.7, openness: 0.3, humor: 0.3, agreeableness: 0.4 }
  },
  // 东海
  {
    name: '水月仙子', identity: '碧水宫宫主', faction: '碧水宫', location: '东海-碧水宫',
    personality_type: '冷酷派', strength_level: '炼虚中期',
    traits: { warmth: 0.3, assertiveness: 0.75, conscientiousness: 0.8, formality: 0.85, extraversion: 0.25, emotionalStability: 0.9, openness: 0.5, humor: 0.1, agreeableness: 0.35 }
  },
  // 西漠
  {
    name: '搬山老祖', identity: '搬山宗创始人', faction: '搬山宗', location: '西漠-搬山',
    personality_type: '隐世高人', strength_level: '炼虚初期',
    traits: { warmth: 0.6, assertiveness: 0.7, conscientiousness: 0.6, formality: 0.2, extraversion: 0.45, emotionalStability: 0.9, openness: 0.6, humor: 0.7, agreeableness: 0.6 }
  },
  // 北荒
  {
    name: '铁无情', identity: '铁骨门门主', faction: '铁骨门', location: '北荒-铁骨门',
    personality_type: '冷酷派', strength_level: '炼虚中期',
    traits: { warmth: 0.15, assertiveness: 0.9, conscientiousness: 0.9, formality: 0.7, extraversion: 0.2, emotionalStability: 0.95, openness: 0.2, humor: 0.05, agreeableness: 0.25 }
  },
  {
    name: '霜寒仙子', identity: '寒冰宗宗主', faction: '寒冰宗', location: '北荒-寒冰宗',
    personality_type: '冷酷派', strength_level: '炼虚后期',
    traits: { warmth: 0.1, assertiveness: 0.7, conscientiousness: 0.9, formality: 0.85, extraversion: 0.05, emotionalStability: 0.95, openness: 0.3, humor: 0.05, agreeableness: 0.2 }
  },
  {
    name: '血冥老祖', identity: '血河宗宗主', faction: '血河宗', location: '北荒-血河宗',
    personality_type: '权谋者', strength_level: '炼虚中期',
    traits: { warmth: 0.05, assertiveness: 0.95, conscientiousness: 0.6, formality: 0.5, extraversion: 0.3, emotionalStability: 0.8, openness: 0.4, humor: 0.2, agreeableness: 0.05 }
  },
  // 南疆
  {
    name: '青木老人', identity: '青木宗宗主', faction: '青木宗', location: '南疆-青木宗',
    personality_type: '隐世高人', strength_level: '炼虚初期',
    traits: { warmth: 0.7, assertiveness: 0.4, conscientiousness: 0.8, formality: 0.4, extraversion: 0.3, emotionalStability: 0.9, openness: 0.7, humor: 0.6, agreeableness: 0.7 }
  },
  {
    name: '万毒老母', identity: '万毒教教主', faction: '万毒教', location: '南疆-万毒教',
    personality_type: '冷酷派', strength_level: '炼虚后期',
    traits: { warmth: 0.05, assertiveness: 0.9, conscientiousness: 0.7, formality: 0.6, extraversion: 0.25, emotionalStability: 0.85, openness: 0.5, humor: 0.3, agreeableness: 0.05 }
  },
  {
    name: '蛊婆', identity: '蛊神宗宗主', faction: '蛊神宗', location: '南疆-蛊神宗',
    personality_type: '痴人', strength_level: '炼虚中期',
    traits: { warmth: 0.2, assertiveness: 0.6, conscientiousness: 0.5, formality: 0.3, extraversion: 0.2, emotionalStability: 0.7, openness: 0.8, humor: 0.4, agreeableness: 0.15 }
  },
  // 西漠（邪）
  {
    name: '白骨夫人', identity: '白骨观观主', faction: '白骨观', location: '西漠-白骨观',
    personality_type: '权谋者', strength_level: '炼虚中期',
    traits: { warmth: 0.1, assertiveness: 0.85, conscientiousness: 0.75, formality: 0.7, extraversion: 0.35, emotionalStability: 0.9, openness: 0.5, humor: 0.4, agreeableness: 0.1 }
  },
];

function initWorldState() {
  // 检查是否已初始化
  const existing = db.prepare('SELECT COUNT(*) as cnt FROM xianxia_world_state').get();
  if (existing.cnt > 0) return;

  const insert = db.prepare('INSERT INTO xianxia_world_state (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(DEFAULT_WORLD_STATE)) {
    insert.run(key, JSON.stringify(value));
  }
}

function seedFixedNpcs() {
  // 按名补种：新增固定 NPC 能进入旧存档，已存在的不动（保留运行期状态）
  const insert = db.prepare(
    `INSERT INTO xianxia_npcs (name, identity, faction, location, personality_type, strength_level, personality_traits, is_fixed)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
  );
  const existsStmt = db.prepare('SELECT id FROM xianxia_npcs WHERE name = ? AND is_fixed = 1');
  let added = 0;
  for (const npc of FIXED_NPCS) {
    if (existsStmt.get(npc.name)) continue;
    insert.run(npc.name, npc.identity, npc.faction, npc.location, npc.personality_type, npc.strength_level, JSON.stringify(npc.traits));
    added++;
  }
  if (added > 0) console.log(`[world] ✓ 补种 ${added} 位固定 NPC`);
}

function seedAll() {
  initWorldState();
  seedFixedNpcs();
}

module.exports = { seedAll, FIXED_NPCS, DEFAULT_WORLD_STATE };
