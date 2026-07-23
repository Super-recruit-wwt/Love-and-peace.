// 修仙模拟人生 — 纪元大事记
// 世界时钟随角色游戏年龄推进（16 岁开局 = 纪元第 1 年）。
// 每跨过一个纪元年，按概率生成一条世界大事；逢五之年必有一事。
// 大事不只是文案：势力关系张力、秘境状态会被真实改写并落库。

const { db } = require('../db');

/** 由角色年龄推导纪元年份（与 index.js 角色详情的 game_year 口径一致） */
function gameYearOf(character) {
  return Math.max(1, Math.floor((character.game_age || 16) - 15));
}

function readWorldState() {
  const rows = db.prepare('SELECT key, value FROM xianxia_world_state').all();
  const state = {};
  for (const row of rows) {
    try { state[row.key] = JSON.parse(row.value); }
    catch { state[row.key] = row.value; }
  }
  return state;
}

function writeKey(key, value) {
  db.prepare('INSERT OR REPLACE INTO xianxia_world_state (key, value) VALUES (?, ?)')
    .run(key, JSON.stringify(value));
}

// ==================== 大事生成器（纯函数，直接改写传入的 state） ====================

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** 势力关系消长：挑一对势力调整张力，按跨过阈值生成不同措辞 */
function genFactionDrift(state) {
  const relations = state.faction_relations || {};
  const pairs = Object.keys(relations);
  if (pairs.length === 0) return null;
  const pair = pairs[Math.floor(Math.random() * pairs.length)];
  const rel = relations[pair];
  if (!rel || typeof rel.tension !== 'number') return null;
  const [a, b] = pair.split('-');
  const old = rel.tension;
  const delta = Math.floor(Math.random() * 27) - 12; // -12 ~ +14
  rel.tension = clamp(old + delta, 0, 100);
  if (rel.tension === old) return null;
  if (old < 65 && rel.tension >= 65) {
    return { title: `${a}与${b}冲突升级`, text: `${a}与${b}的矛盾彻底公开化，边境已现刀兵。修真界人人自危，生怕被卷入这场对峙。` };
  }
  if (old >= 65 && rel.tension < 65) {
    return { title: `${a}与${b}暂时休战`, text: `缠斗多时的${a}与${b}终于各自收兵。是真心罢战还是积蓄力量，只有他们自己知道。` };
  }
  if (delta > 0) {
    return { title: `${a}与${b}摩擦渐起`, text: `${a}与${b}近来摩擦不断，弟子在山下已起了几次冲突，双方都还未撕破脸。` };
  }
  if (rel.tension <= 20 && old > 20) {
    return { title: `${a}与${b}冰释前嫌`, text: `${a}与${b}互派使者往来，旧怨渐消，两派弟子往来也多了起来。` };
  }
  return { title: `${a}与${b}关系缓和`, text: `${a}与${b}之间的火药味淡了几分，坊间的谈资又少了一桩。` };
}

/** 秘境变迁：休眠秘境现世 / 活跃秘境沉寂 */
function genRealmShift(state) {
  const realms = state.secret_realms || {};
  const names = Object.keys(realms);
  if (names.length === 0) return null;
  const name = names[Math.floor(Math.random() * names.length)];
  const realm = realms[name];
  if (!realm) return null;
  if (realm.status !== 'active') {
    realm.status = 'active';
    return { title: `${name}现世`, text: `沉寂多时的${name}（${realm.location || '未知之地'}）封印松动，灵力波动惊动了四方。各宗各派的探子已闻风而动。` };
  }
  realm.status = 'dormant';
  return { title: `${name}重归沉寂`, text: `热闹了一阵的${name}缓缓关闭，进去的人有的满载而归，有的再没出来。` };
}

/** 大能动向：固定 NPC 的传闻（纯文案，不改状态） */
const NPC_RUMORS = [
  n => ({ title: `${n.name}闭关`, text: `${n.faction}传出消息：${n.identity}${n.name}已闭死关，冲击更高境界。${n.faction}上下噤若寒蝉。` }),
  n => ({ title: `${n.name}开坛讲道`, text: `${n.name}在${n.location || '山门'}开坛讲道，四方修士蜂拥而至，有缘者闻道后瓶颈松动。` }),
  n => ({ title: `${n.name}收录门人`, text: `据说${n.identity}${n.name}新收了一名关门弟子，引得各派猜测纷纷——被大能看中的，会是什么样的人？` }),
  n => ({ title: `${n.name}云游归来`, text: `云游多年的${n.name}回到${n.faction}，带回一身未可知的风尘与几件引人遐想的物件。` }),
];

function genNpcRumor() {
  const npcs = db.prepare('SELECT name, identity, faction, location FROM xianxia_npcs WHERE is_fixed = 1 AND is_alive = 1').all();
  if (npcs.length === 0) return null;
  const npc = npcs[Math.floor(Math.random() * npcs.length)];
  const tpl = NPC_RUMORS[Math.floor(Math.random() * NPC_RUMORS.length)];
  return tpl(npc);
}

/** 天象异兆（纯文案） */
const OMENS = [
  { title: '紫气东来', text: '东天紫气浩荡三万里，经久不散。老一辈修士说，这是大世将启的征兆。' },
  { title: '星陨如雨', text: '一夜星陨如雨，坠于四方。据说捡到陨星碎片的人，炼器时如有神助。' },
  { title: '地龙翻身', text: '大地深处传来闷雷般的轰鸣，连绵数日。矿山塌了几座，也有人说在地缝深处看到了发光的东西。' },
  { title: '灵潮涨落', text: '天地间灵气忽浓忽淡，修炼事半功倍者众。有识之士却皱起眉头：灵潮异动，往往预示着什么。' },
  { title: '海市蜃楼', text: '东海之滨现出海市蜃楼，宫阙俨然，似有仙人往来。观者如潮，却无人能靠近半步。' },
];

function genOmen() {
  return OMENS[Math.floor(Math.random() * OMENS.length)];
}

/**
 * 为某个纪元年生成一条大事（纯函数；可能改写 state 的 faction_relations / secret_realms）。
 * 权重：势力消长 40% / 大能动向 25% / 秘境变迁 20% / 天象异兆 15%
 */
function generateYearEvent(state, year) {
  const roll = Math.random();
  let evt = null;
  if (roll < 0.40) evt = genFactionDrift(state);
  else if (roll < 0.65) evt = genNpcRumor();
  else if (roll < 0.85) evt = genRealmShift(state);
  else evt = genOmen();
  // 兜底：选中的生成器无料（如势力表为空）时退用天象
  if (!evt) evt = genOmen();
  return evt ? { year, title: evt.title, text: evt.text } : null;
}

// ==================== 推进入口 ====================

const YEAR_EVENT_CHANCE = 0.35; // 普通年份生成概率
const GUARANTEED_EVERY = 5;     // 逢五之年必有大事
const MAX_ENTRIES_PER_CALL = 5; // 单次最多补记条数，防跨年爆发
const CHRONICLE_KEEP = 50;      // 世界表中最多保留的大事记条数

/**
 * 推进纪元大事记（在角色时间流逝后调用）。
 * - 首次启用：快进到当前年，不补生成陈年旧事
 * - 每跨过一年按概率生成；逢五之年必生成；大事写入角色时间线（world_event）
 * 返回本次新生成的条目数组。
 */
function advanceChronicle(characterId, gameTimeStr) {
  const character = db.prepare('SELECT game_age FROM xianxia_characters WHERE id = ?').get(characterId);
  if (!character) return [];
  const year = gameYearOf(character);
  const state = readWorldState();
  const lastYear = Number(state.chronicle_year) || 0;

  if (lastYear === 0) {
    writeKey('chronicle_year', year);
    if (!Array.isArray(state.chronicle)) writeKey('chronicle', []);
    return [];
  }
  if (year <= lastYear) return [];

  const entries = [];
  for (let y = lastYear + 1; y <= year; y++) {
    const guaranteed = y % GUARANTEED_EVERY === 0;
    if (!guaranteed && Math.random() >= YEAR_EVENT_CHANCE) continue;
    const evt = generateYearEvent(state, y);
    if (evt) entries.push(evt);
    if (entries.length >= MAX_ENTRIES_PER_CALL) break;
  }

  writeKey('chronicle_year', year);
  if (entries.length === 0) return [];

  const chronicle = (Array.isArray(state.chronicle) ? state.chronicle : []).concat(entries).slice(-CHRONICLE_KEEP);
  writeKey('chronicle', chronicle);
  if (state.faction_relations) writeKey('faction_relations', state.faction_relations);
  if (state.secret_realms) writeKey('secret_realms', state.secret_realms);

  const insert = db.prepare(
    'INSERT INTO xianxia_timeline (character_id, game_time, event_type, narrative) VALUES (?, ?, ?, ?)'
  );
  for (const e of entries) {
    insert.run(characterId, gameTimeStr || '', 'world_event', `【纪元第${e.year}年 · ${e.title}】${e.text}`);
  }
  return entries;
}

module.exports = { gameYearOf, generateYearEvent, advanceChronicle };
