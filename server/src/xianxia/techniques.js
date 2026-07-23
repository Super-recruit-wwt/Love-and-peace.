// 功法系统核心模块
// learned_techniques 存储结构（JSON 数组）：
//   [{ "name": "吐纳基础", "depth": 0, "main": true }]
//   depth: 0-4 → 初窥/小成/大成/圆满/自创变式（领悟深度，预留进阶体系）
//   main:  主修心法标记，全列表至多一个（每人只能主修一部）
// 功法模板存于 xianxia_items（character_id IS NULL AND item_type='technique'），
// effect 为规则 JSON；metadata = { type: 'heart', faction, req }。

const { db } = require('../db');
const { parseJson, qiMaxForStage, cultivationTier } = require('./scripts/utils');

const DEPTH_LABELS = ['初窥', '小成', '大成', '圆满', '自创变式'];

// 气海基准：凡品基准心法《吐纳基础》的 qi_max=150 ≡ 倍率 1.0，
// 其余功法的气海效果换算为相对倍率（如 太虚引气术 250 → ×1.67）
const BASE_QI_MAX = 150;

// ==================== 领悟深度体系 ====================

// 各品级深度经验阈值（累计值）：[小成, 大成, 圆满, 自创变式]
// depth 从 0（初窥）起，总经验达到 thresholds[depth] 即升一档
const DEPTH_THRESHOLDS = {
  '凡品': [50, 120, 250, 500],
  '灵品': [100, 250, 500, 1000],
  '宝品': [150, 380, 750, 1500],
  '玄品': [200, 500, 1000, 2000],
  '圣品': [300, 750, 1500, 3000],
  // 诡品不攒经验：深度随异化度被动提升（接触即异化，非主动修炼）
  '诡品': null,
};

// 诡品功法深度 ← 异化度：≥20 小成 / ≥40 大成 / ≥60 圆满 / ≥80 自创变式
function strangeDepthOf(character) {
  const c = (character && character.strange_corruption) || 0;
  if (c >= 80) return 4;
  if (c >= 60) return 3;
  if (c >= 40) return 2;
  if (c >= 20) return 1;
  return 0;
}

// 效果解锁分组：初窥只生效基础项；小成解锁战斗/路线加成；大成解锁特殊机制
const BASE_EFFECT_KEYS = ['efficiency', 'qi_max', 'essence_per_break', 'qi_per_break', 'spirit_per_break', 'learn_speed',
  // 术法/身法/秘术的基础实战项与施展项——学了就能用，深度放大数值
  'attack', 'defense', 'speed', 'dodge', 'cost', 'escape', 'heal', 'spirit_stones',
  'rob_item', 'random_material', 'power_buff_pct', 'breakthrough_spirit', 'corruption'];
const COMBAT_EFFECT_KEYS = ['combat_bonus', 'evil_bonus', 'life_steal', 'water_bonus', 'ice_bonus',
  'cold_power', 'beast_power', 'gu_bonus', 'sword_power', 'pet_battle', 'poison_craft', 'no_sect_bonus',
  'burn', 'freeze', 'slow', 'stun', 'pierce'];

// 圆满/自创变式对已解锁数值效果的整体放大
const DEPTH_POWER_MULT = { 3: 1.1, 4: 1.25 };

// ==================== 功法模板查询（带缓存） ====================

let templateCache = null;

function loadTemplates() {
  const rows = db.prepare(
    "SELECT name, grade, description, effect, metadata FROM xianxia_items WHERE character_id IS NULL AND item_type = 'technique'"
  ).all();
  const map = new Map();
  for (const row of rows) {
    map.set(row.name, {
      name: row.name,
      grade: row.grade || '凡品',
      acquire: row.description || '',
      effect: parseJson(row.effect, {}),
      ...(() => {
        const meta = parseJson(row.metadata, {});
        return { type: meta.type || 'heart', faction: meta.faction || null, req: meta.req || {}, stat_bias: meta.stat_bias || null };
      })(),
    });
  }
  return map;
}

function allTemplates() {
  if (!templateCache) templateCache = loadTemplates();
  return templateCache;
}

/** 按名称取功法模板，不存在返回 null */
function getTemplate(name) {
  return allTemplates().get(name) || null;
}

/** 种子数据刷新后调用，使缓存失效 */
function invalidateTemplateCache() {
  templateCache = null;
}

/** 某宗派的入门心法（灵品），用于拜入宗门时授予 */
function entryTechniqueOfFaction(faction) {
  for (const t of allTemplates().values()) {
    if (t.faction === faction && t.grade === '灵品' && t.type === 'heart') return t;
  }
  return null;
}

/** 全部功法模板列表 */
function listTemplates() {
  return [...allTemplates().values()];
}

/** 某宗派的入门杂学（凡/灵品术法与身法），拜入宗门时一并授予 */
function factionArts(faction) {
  return listTemplates().filter(t =>
    t.faction === faction && ['spell', 'movement'].includes(t.type) && ['凡品', '灵品'].includes(t.grade));
}

/**
 * 角色是否满足功法模板的修习门槛：
 * - req.cultivation：如 '炼气期' → 仙道大境界层级 ≥ 对应层级
 * - req.roots：灵根列表，拥有其中任一（值>0）即可
 * - req.essence / qi / spirit：三维最低值
 * - req.evil / req.corruption 不在此校验（evil 用于黑市池过滤，corruption 在施展时判定）
 */
function meetsReq(character, tpl) {
  const req = (tpl && tpl.req) || {};
  if (req.cultivation) {
    const realms = ['炼气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体', '大乘', '渡劫'];
    const need = realms.findIndex(r => String(req.cultivation).includes(r)) + 1;
    if (need > 0 && cultivationTier(character) < need) return false;
  }
  if (Array.isArray(req.roots) && req.roots.length > 0) {
    const roots = parseJson(character && character.spirit_roots, {});
    const hasAny = req.roots.some(r => Number(roots[r]) > 0);
    if (!hasAny) return false;
  }
  for (const stat of ['essence', 'qi', 'spirit']) {
    if (req[stat] != null && (Number(character && character[stat]) || 0) < Number(req[stat])) return false;
  }
  return true;
}

/** 深度提升/换功法后按当前境界与主修倍率重算气海上限 */
function recalcQiMax(character, learnedList) {
  return effectiveQiMax({ ...character, learned_techniques: JSON.stringify(learnedList) });
}

/** 随机抽取一部未学功法（坊市残页/探索残卷用）：按品级权重，默认排除邪修功法；残卷自学须满足修习门槛 */
function randomUnlearnedArt(character, {
  types = ['spell', 'movement', 'secret'],
  grades = ['凡品', '灵品', '宝品'],
  gradeWeights = [0.5, 0.35, 0.15],
  excludeEvil = true,
  onlyEvil = false,
} = {}) {
  const learned = new Set(getLearned(character).map(e => e.name));
  const pool = listTemplates().filter(t =>
    types.includes(t.type) && grades.includes(t.grade) && !learned.has(t.name)
    && (onlyEvil ? !!(t.req && t.req.evil) : (!excludeEvil || !(t.req && t.req.evil)))
    && meetsReq(character, t));
  if (pool.length === 0) return null;
  const byGrade = grades
    .map((g, i) => ({ w: gradeWeights[i] || 0.1, items: pool.filter(t => t.grade === g) }))
    .filter(x => x.items.length > 0);
  const total = byGrade.reduce((s, x) => s + x.w, 0);
  let r = Math.random() * total;
  for (const x of byGrade) {
    r -= x.w;
    if (r <= 0) return x.items[Math.floor(Math.random() * x.items.length)];
  }
  return pool[0];
}

// ==================== 已学功法解析 ====================

/** 解析 learned_techniques，兼容旧格式（字符串数组）与新格式（对象数组） */
function getLearned(character) {
  const raw = parseJson(character && character.learned_techniques, []);
  if (!Array.isArray(raw)) return [];
  return raw
    .map(e => {
      if (typeof e === 'string') return { name: e, depth: 0, exp: 0, main: false };
      if (e && typeof e === 'object' && e.name) {
        return { name: e.name, depth: Number(e.depth) || 0, exp: Number(e.exp) || 0, main: !!e.main, stat_gained: Number(e.stat_gained) || 0 };
      }
      return null;
    })
    .filter(Boolean);
}

/** 词条的有效深度：诡品随异化度被动提升，其余用存储的 depth */
function effectiveDepth(character, entry) {
  const tpl = getTemplate(entry.name);
  if (tpl && tpl.grade === '诡品') return strangeDepthOf(character);
  return Math.min(4, entry.depth || 0);
}

/** 词条的功法类型（无模板按心法处理，兼容旧数据） */
function typeOfEntry(entry) {
  const tpl = getTemplate(entry.name);
  return (tpl && tpl.type) || 'heart';
}

/** 是否心法类词条（无模板按心法处理，兼容旧数据） */
function isHeartEntry(entry) {
  return typeOfEntry(entry) === 'heart';
}

/** 某类型的主修词条：带 main 标记者优先，缺省回退该类型第一部（兼容旧数据） */
function getMainOfType(character, type) {
  const list = getLearned(character);
  const ofType = list.filter(e => typeOfEntry(e) === type);
  if (ofType.length === 0) return null;
  return ofType.find(e => e.main) || ofType[0];
}

/** 主修心法词条（修炼/效率用气） */
function pickMainEntry(character) {
  return getMainOfType(character, 'heart');
}

/** 主修心法（含模板效果与有效深度）；未修心法返回 null */
function getMainTechnique(character) {
  const entry = pickMainEntry(character);
  if (!entry) return null;
  const tpl = getTemplate(entry.name);
  const depth = effectiveDepth(character, entry);
  return {
    name: entry.name,
    depth,
    exp: entry.exp || 0,
    depthLabel: DEPTH_LABELS[Math.min(depth, DEPTH_LABELS.length - 1)],
    grade: tpl ? tpl.grade : '凡品',
    effect: tpl ? tpl.effect : {},
    faction: tpl ? tpl.faction : null,
  };
}

// ==================== 数值倍率（按深度逐级解锁） ====================

/**
 * 某词条当前生效的效果集（按有效深度逐级解锁）：
 * - 初窥：仅基础项（心法的修炼项；术法/身法/秘术的实战与施展项）
 * - 小成：+ 战斗与路线加成（战斗加成/吸血/灼烧/破甲等）
 * - 大成：+ 特殊机制（毒免/破防/灵宠栏位等）
 * - 圆满：全部解锁且数值 ×1.1；自创变式 ×1.25
 */
function unlockedEffectForEntry(character, entry) {
  const tpl = getTemplate(entry.name);
  if (!tpl || !tpl.effect) return {};
  const depth = effectiveDepth(character, entry);
  const out = {};
  for (const [k, v] of Object.entries(tpl.effect)) {
    const tier = BASE_EFFECT_KEYS.includes(k) ? 0 : COMBAT_EFFECT_KEYS.includes(k) ? 1 : 2;
    if (depth < tier) continue;
    out[k] = v;
  }
  const mult = DEPTH_POWER_MULT[depth] || 1;
  if (mult !== 1) {
    for (const k of Object.keys(out)) {
      if (typeof out[k] === 'number') out[k] = Math.round(out[k] * mult * 1000) / 1000;
    }
  }
  return out;
}

/** 主修心法当前生效的效果集 */
function unlockedEffect(character) {
  const entry = pickMainEntry(character);
  if (!entry) return {};
  return unlockedEffectForEntry(character, entry);
}

/** 修炼效率倍率（按深度解锁后的 effect.efficiency），无功法/无字段返回 1 */
function efficiencyMult(character) {
  const eff = Number(unlockedEffect(character).efficiency);
  return Number.isFinite(eff) && eff > 0 ? eff : 1;
}

/** 气海上限倍率（按深度解锁后的 effect.qi_max 相对 150 基准），无字段返回 1 */
function qiMaxMult(character) {
  const qm = Number(unlockedEffect(character).qi_max);
  return Number.isFinite(qm) && qm > 0 ? qm / BASE_QI_MAX : 1;
}

/** 当前仙道境界（未入道按炼气初期） */
function currentXianStage(character) {
  const paths = parseJson(character && character.cultivation_paths, {});
  return paths.xiandao || '炼气初期';
}

/** 功法修正后的气海上限：境界基数 × 功法倍率 */
function effectiveQiMax(character) {
  return Math.round(qiMaxForStage(currentXianStage(character)) * qiMaxMult(character));
}

// ==================== 功法三元成长（精/气/神） ====================
// 规则：每部功法随熟练度（深度经验）滋养三元——品级越高，可滋养总量（cap）越高；
// 滋养随修炼进度持续累积，修至大成时满额，不再需要突破大境界。
// 属性独占：每部功法只滋养其偏向的一元（stat_bias：essence/qi/spirit），不偏的不加。
// 总量不叠加：每一元分别取"偏向该元的功法中"滋养最高的一部生效，而非诸功法总和。
// 诡品无品级规则、无默认滋养；其显式负值 *_per_break（如精-8）仍挂在突破上作为代价。
const STAT_GAIN_BY_GRADE = {
  '凡品': { cap: 30 },
  '灵品': { cap: 60 },
  '宝品': { cap: 120 },
  '玄品': { cap: 200 },
  '圣品': { cap: 400 },
};
const STAT_BREAK_KEYS = [['essence_per_break', 'essence'], ['qi_per_break', 'qi'], ['spirit_per_break', 'spirit']];
const STAT_BIAS_LABELS = { essence: '精', qi: '气', spirit: '神' };

/** 功法滋养的偏向属性：模板 stat_bias，缺省按 'qi'（气修为主流）；诡品返回 null（不滋养） */
function biasOfEntry(entry) {
  const tpl = getTemplate(entry.name);
  if (!tpl || tpl.grade === '诡品') return null;
  return tpl.stat_bias || 'qi';
}

/**
 * 熟练度驱动的三元滋养目标（纯函数）：目标池 = cap × min(1, exp / 大成门槛)。
 * 修至大成（depth 2 门槛）时滋养尽出；诡品/无模板返回 0。
 */
function depthStatTarget(entry, tpl) {
  const rule = tpl ? STAT_GAIN_BY_GRADE[tpl.grade] : null;
  if (!rule) return 0;
  const thresholds = DEPTH_THRESHOLDS[tpl.grade] || DEPTH_THRESHOLDS['凡品'];
  const fullAt = thresholds[1] || 1;
  return Math.round(rule.cap * Math.min(1, (Number(entry.exp) || 0) / fullAt));
}

/**
 * 结算功法滋养的三元入账（写库）：比较 before/after 两份 learned_techniques 快照，
 * 属性独占——每部功法只按其偏向（stat_bias）计入对应一元；
 * 每一元分别取偏向功法中 stat_gained 的最大值，差额各自入账（clamp 999）。
 * 全部差额 <= 0 时不动库，返回 null；否则返回 { essence?, qi?, spirit? }（仅含正差额）。
 */
function applyDepthStatGrants(characterId, beforeJson, afterJson) {
  const before = parseJson(beforeJson, []);
  const after = parseJson(afterJson, []);
  if (!after.length) return null;
  const maxOf = (list) => {
    const m = { essence: 0, qi: 0, spirit: 0 };
    for (const e of list) {
      const v = Number(e.stat_gained) || 0;
      if (v <= 0) continue;
      const b = biasOfEntry(e);
      if (b) m[b] = Math.max(m[b], v);
    }
    return m;
  };
  const m0 = maxOf(before);
  const m1 = maxOf(after);
  const deltas = {};
  for (const s of ['essence', 'qi', 'spirit']) {
    const d = m1[s] - m0[s];
    if (d > 0) deltas[s] = d;
  }
  if (Object.keys(deltas).length === 0) return null;
  const sets = Object.keys(deltas).map(s => `${s} = MIN(999, ${s} + ?)`).join(', ');
  db.prepare(`UPDATE xianxia_characters SET ${sets}, updated_at = datetime('now') WHERE id = ?`)
    .run(...Object.values(deltas), characterId);
  return deltas;
}

/**
 * 大境界突破时的三元调整（纯函数）——现在只保留诡品显式负值代价（如虚海心经 精-8），
 * 正向滋养已全部改由熟练度驱动（addDepthExp → stat_gained → applyDepthStatGrants）。
 * 返回 { gains, list, capped }：gains 仅含负值（无代价时为 null）；list 原样返回；capped 恒 false。
 */
function breakthroughStatGains(character) {
  const list = getLearned(character);
  const negSum = {};
  for (const entry of list) {
    const tpl = getTemplate(entry.name);
    if (!tpl) continue;
    const effect = unlockedEffectForEntry(character, entry);
    for (const [key, stat] of STAT_BREAK_KEYS) {
      const v = Number(effect[key]);
      if (Number.isFinite(v) && v < 0) {
        negSum[stat] = (negSum[stat] || 0) + Math.round(v);
      }
    }
  }
  const gains = Object.keys(negSum).length > 0 ? negSum : null;
  return { gains, list, capped: false };
}

// ==================== 深度经验 ====================

/**
 * 为已学功法累积深度经验（纯函数，调用方负责落库）。
 * - 诡品不吃经验（随异化度自动提升），未学/无模板返回 gained=0
 * - capDepth：本次来源允许提升到的上限（如师长指点 凡/灵品≤圆满 其余≤大成）
 * 返回 { list, gained, levelUps: [升至的深度...] }
 */
function addDepthExp(character, name, amount, { capDepth } = {}) {
  const list = getLearned(character);
  const entry = list.find(e => e.name === name);
  const tpl = entry && getTemplate(name);
  if (!entry || !tpl || tpl.grade === '诡品') return { list, gained: 0, levelUps: [] };

  const thresholds = DEPTH_THRESHOLDS[tpl.grade] || DEPTH_THRESHOLDS['凡品'];
  const maxDepth = Math.min(4, capDepth != null ? capDepth : 4);
  const gain = Math.max(0, Math.round(amount));
  entry.exp = (entry.exp || 0) + gain;

  const levelUps = [];
  while (entry.depth < maxDepth && entry.exp >= thresholds[entry.depth]) {
    entry.depth++;
    levelUps.push(entry.depth);
  }
  // 已达来源上限（或满级）：经验封顶在下一门槛前，避免溢出浪费的错觉
  if (entry.depth >= maxDepth) {
    const cap = thresholds[Math.min(entry.depth, 3)];
    if (cap != null) entry.exp = Math.min(entry.exp, cap);
  }
  // 熟练度（深度经验）驱动三元滋养：随修炼进度持续累积，修至大成时满额；只增不减。
  const target = depthStatTarget(entry, tpl);
  entry.stat_gained = Math.max(Number(entry.stat_gained) || 0, target);
  return { list, gained: gain, levelUps };
}

/** 功法当前深度的下一档经验门槛（满级/诡品/无模板返回 null） */
function nextThreshold(character, entry) {
  const tpl = getTemplate(entry.name);
  if (!tpl || tpl.grade === '诡品') return null;
  const depth = Math.min(4, entry.depth || 0);
  if (depth >= 4) return null;
  const thresholds = DEPTH_THRESHOLDS[tpl.grade] || DEPTH_THRESHOLDS['凡品'];
  return thresholds[depth];
}

/**
 * 批量深度经验（纯函数，调用方负责落库）——"触类旁通"规则：
 * 做某类事时，与之相关的所有功法都积累经验，主修/指定功法积累更多。
 * - type：限定功法类型（null = 全部已学功法）
 * - boostName：重点功法（如主修），吃 base × boostMult；其余吃 base × otherMult
 * - 诡品跳过（随异化度被动提升）
 * 返回 { list, gains: [{ name, gained, levelUps }] }
 */
function gainDepthExp(character, baseAmount, { type = null, boostName = null, boostMult = 1, otherMult = 0.3 } = {}) {
  let cur = character;
  let list = getLearned(character);
  const gains = [];
  for (const entry of list) {
    const tpl = getTemplate(entry.name);
    if (!tpl || tpl.grade === '诡品') continue;
    if (type && typeOfEntry(entry) !== type) continue;
    const mult = entry.name === boostName ? boostMult : otherMult;
    if (mult <= 0) continue;
    const r = addDepthExp(cur, entry.name, baseAmount * mult);
    if (r.gained > 0) {
      cur = { ...cur, learned_techniques: JSON.stringify(r.list) };
      list = r.list;
      gains.push({ name: entry.name, gained: r.gained, levelUps: r.levelUps });
    }
  }
  return { list, gains };
}

// ==================== 学习 / 转修（纯函数，调用方负责落库） ====================

/**
 * 学习功法：返回 { list, learned, becameMain, reason }
 * - 已学过：learned=false，list 不变
 * - 修习门槛（req）：默认校验；宗门传功/诡道自现等授予场景传 bypassReq 跳过
 * - main 标记按类型独立：每个类型（心法/术法/身法/秘术）至多一个主修；
 *   makeMain 缺省策略：该类型尚无主修时自动成为主修
 */
function learnTechnique(character, name, { makeMain, bypassReq } = {}) {
  const list = getLearned(character);
  if (list.some(e => e.name === name)) {
    return { list, learned: false, becameMain: false };
  }
  const tpl = getTemplate(name);
  if (!bypassReq && tpl && !meetsReq(character, tpl)) {
    return { list, learned: false, becameMain: false, reason: 'req_unmet' };
  }
  const tType = (tpl && tpl.type) || 'heart';
  const hasTypeMain = list.some(e => e.main && typeOfEntry(e) === tType);
  const asMain = makeMain !== undefined ? makeMain : !hasTypeMain;
  if (asMain) list.forEach(e => { if (typeOfEntry(e) === tType) e.main = false; });
  list.push({ name, depth: 0, exp: 0, main: asMain });
  return { list, learned: true, becameMain: asMain };
}

/**
 * 设置某功法为其类型的主修：name 须已学；只清同类型的 main 标记，不影响其他类型的主修。
 * 返回 { list, switched, reason, type }；未学过/已是主修时 switched=false。
 */
function switchMainTechnique(character, name) {
  const list = getLearned(character);
  const target = list.find(e => e.name === name);
  if (!target) return { list, switched: false, reason: 'not_learned' };
  if (target.main) return { list, switched: false, reason: 'already_main' };
  const tType = typeOfEntry(target);
  list.forEach(e => {
    if (e.name === name) e.main = true;
    else if (typeOfEntry(e) === tType) e.main = false;
  });
  return { list, switched: true, type: tType };
}

// ==================== 术法 / 身法 / 秘术 查询 ====================

/** 已学的某类功法（带按深度解锁后的生效效果）：type ∈ spell/movement/secret/strange_art */
function learnedArts(character, type) {
  return getLearned(character)
    .map(e => {
      const tpl = getTemplate(e.name);
      if (!tpl || tpl.type !== type) return null;
      return {
        name: e.name,
        grade: tpl.grade,
        depth: effectiveDepth(character, e),
        faction: tpl.faction || null,
        req: tpl.req || {},
        effect: unlockedEffectForEntry(character, e),
      };
    })
    .filter(Boolean);
}

/** 切磋战力聚合：术法攻击总和、防御总和、身法闪避取最高 */
function combatArts(character) {
  let attack = 0, defense = 0, dodge = 0;
  for (const art of learnedArts(character, 'spell')) {
    attack += Number(art.effect.attack) || 0;
    defense += Number(art.effect.defense) || 0;
  }
  for (const art of learnedArts(character, 'movement')) {
    dodge = Math.max(dodge, Number(art.effect.dodge) || 0);
  }
  return { attack, defense, dodge: Math.min(0.5, dodge) };
}

/** 旅行速度：已学身法中 speed 最高者（无则 1），附功法名供叙事 */
function movementSpeed(character) {
  let speed = 1, name = null;
  for (const art of learnedArts(character, 'movement')) {
    const s = Number(art.effect.speed) || 1;
    if (s > speed) { speed = s; name = art.name; }
  }
  return { speed, name };
}

// ==================== 客户端展示 ====================

/** 角色详情 API 用：已学功法 + 模板信息 + 深度进度（效果为按深度解锁后的生效集） */
function enrichForClient(character) {
  const list = getLearned(character);
  // 每类型的展示主修：有 main 标记用标记；无标记回退该类型第一部（兼容旧数据）
  const typeMains = {};
  for (const e of list) {
    const t = typeOfEntry(e);
    if (e.main) typeMains[t] = e.name;
  }
  for (const e of list) {
    const t = typeOfEntry(e);
    if (typeMains[t] == null) typeMains[t] = e.name;
  }
  return list.map(e => {
    const tpl = getTemplate(e.name);
    const depth = effectiveDepth(character, e);
    const rawEffect = tpl ? tpl.effect : {};
    const unlocked = tpl ? unlockedEffectForEntry(character, e) : {};
    const lockedKeys = Object.keys(rawEffect).filter(k => !(k in unlocked));
    return {
      name: e.name,
      type: tpl ? tpl.type : 'heart',
      depth,
      depth_label: DEPTH_LABELS[Math.min(depth, DEPTH_LABELS.length - 1)],
      exp: e.exp || 0,
      next_exp: nextThreshold(character, e),
      main: typeMains[typeOfEntry(e)] === e.name,
      grade: tpl ? tpl.grade : '凡品',
      faction: tpl ? tpl.faction : null,
      acquire: tpl ? tpl.acquire : '',
      effect: unlocked,
      locked_count: lockedKeys.length,
      stat_gained: e.stat_gained || 0,
      stat_cap: (STAT_GAIN_BY_GRADE[tpl ? tpl.grade : '凡品'] || {}).cap ?? null,
      stat_bias: tpl && tpl.grade !== '诡品' ? (tpl.stat_bias || 'qi') : null,
    };
  });
}

module.exports = {
  DEPTH_LABELS,
  DEPTH_THRESHOLDS,
  STAT_GAIN_BY_GRADE,
  BASE_QI_MAX,
  getTemplate,
  entryTechniqueOfFaction,
  listTemplates,
  factionArts,
  randomUnlearnedArt,
  invalidateTemplateCache,
  getLearned,
  getMainTechnique,
  getMainOfType,
  gainDepthExp,
  meetsReq,
  recalcQiMax,
  unlockedEffect,
  unlockedEffectForEntry,
  efficiencyMult,
  qiMaxMult,
  effectiveQiMax,
  breakthroughStatGains,
  applyDepthStatGrants,
  depthStatTarget,
  biasOfEntry,
  STAT_BIAS_LABELS,
  addDepthExp,
  nextThreshold,
  learnTechnique,
  switchMainTechnique,
  learnedArts,
  combatArts,
  movementSpeed,
  enrichForClient,
};
