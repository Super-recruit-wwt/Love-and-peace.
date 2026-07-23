// 修仙模拟人生 — 传讯玉符
// 玩家与 NPC 双向文字聊天、NPC 主动来讯、NPC 赠礼（功法/装备/丹药）领取

const { db } = require('../db');
const npcEngine = require('./npc');
const xianxiaLLM = require('./llm');

// 关系类型中文标签（供 prompt 与前端展示参考）
const REL_TYPE_LABELS = {
  stranger: '陌生人', acquaintance: '熟人', friend: '朋友', close_friend: '挚友',
  master: '师父', disciple: '徒弟', lover: '道侣', rival: '竞争者',
  enemy: '仇敌', blood_enemy: '血仇', debtor: '欠情者', creditor: '施恩者',
};

const GIFT_GRADES = ['凡品', '灵品', '宝品']; // 圣品/玄品/诡品不进入赠礼池
const GIFT_RELATIONS_HIGH = ['master', 'close_friend', 'lover']; // 回礼 12%
const GIFT_RELATIONS_ALL = ['master', 'close_friend', 'lover', 'friend']; // 主动来讯附礼 15%

// ==================== 会话与消息基础操作 ====================

function getOrCreateThread(characterId, npcId) {
  const existing = db.prepare(
    'SELECT * FROM xianxia_jade_threads WHERE character_id = ? AND npc_id = ?'
  ).get(characterId, npcId);
  if (existing) return existing;
  const r = db.prepare(
    'INSERT INTO xianxia_jade_threads (character_id, npc_id) VALUES (?, ?)'
  ).run(characterId, npcId);
  return db.prepare('SELECT * FROM xianxia_jade_threads WHERE id = ?').get(r.lastInsertRowid);
}

/** 写入一条消息并更新会话；incUnread=true 时玩家未读 +1（仅 NPC 主动来讯用） */
function addMessage(threadId, sender, content, itemPayload, incUnread) {
  const r = db.prepare(
    'INSERT INTO xianxia_jade_messages (thread_id, sender, content, item_payload) VALUES (?, ?, ?, ?)'
  ).run(threadId, sender, content, itemPayload || null);
  db.prepare(
    "UPDATE xianxia_jade_threads SET last_message_at = datetime('now'), unread_player = unread_player + ? WHERE id = ?"
  ).run(incUnread ? 1 : 0, threadId);
  return db.prepare('SELECT * FROM xianxia_jade_messages WHERE id = ?').get(r.lastInsertRowid);
}

function parsePayload(raw) {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

// ==================== 会话列表 / 消息查询 ====================

function listThreads(characterId) {
  const rows = db.prepare(
    `SELECT t.id AS threadId, t.npc_id AS npcId, t.last_message_at AS lastMessageAt,
            t.unread_player AS unreadPlayer,
            xn.name AS npcName, xn.identity AS npcIdentity, xn.faction AS npcFaction,
            xr.relation_types AS relationTypes,
            (SELECT content FROM xianxia_jade_messages m WHERE m.thread_id = t.id ORDER BY m.id DESC LIMIT 1) AS lastMessage
     FROM xianxia_jade_threads t
     JOIN xianxia_npcs xn ON t.npc_id = xn.id
     LEFT JOIN xianxia_relationships xr ON xr.character_id = t.character_id AND xr.npc_id = t.npc_id
     WHERE t.character_id = ?
     ORDER BY t.last_message_at DESC`
  ).all(characterId);
  // affection 为隐藏数值，不下发；relation_types 解析为数组
  return rows.map(r => ({
    threadId: r.threadId,
    npcId: r.npcId,
    npcName: r.npcName,
    npcIdentity: r.npcIdentity,
    npcFaction: r.npcFaction,
    relationTypes: parsePayload(r.relationTypes) || [],
    lastMessage: r.lastMessage || '',
    lastMessageAt: r.lastMessageAt,
    unreadPlayer: r.unreadPlayer || 0,
  }));
}

function getMessages(characterId, npcId, limit = 50) {
  const thread = db.prepare(
    'SELECT * FROM xianxia_jade_threads WHERE character_id = ? AND npc_id = ?'
  ).get(characterId, npcId);
  if (!thread) return null;

  const lim = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
  const rows = db.prepare(
    'SELECT * FROM xianxia_jade_messages WHERE thread_id = ? ORDER BY id DESC LIMIT ?'
  ).all(thread.id, lim).reverse();

  // 打开会话即清零未读
  db.prepare('UPDATE xianxia_jade_threads SET unread_player = 0 WHERE id = ?').run(thread.id);

  const npc = db.prepare('SELECT id, name, identity, faction FROM xianxia_npcs WHERE id = ?').get(npcId);
  return {
    thread: {
      threadId: thread.id,
      npcId,
      npcName: npc ? npc.name : '',
      npcIdentity: npc ? npc.identity : '',
      npcFaction: npc ? npc.faction : '',
    },
    messages: rows.map(m => ({
      id: m.id,
      sender: m.sender,
      content: m.content,
      item_payload: parsePayload(m.item_payload),
      created_at: m.created_at,
    })),
  };
}

// ==================== 礼物池 ====================

/** 按 NPC 阵营从全局模板池挑选赠礼：30% 功法 / 40% 丹药 / 30% 材料或法宝。opts.forceType 可指定类型（测试用） */
function pickGift(npc, opts = {}) {
  const gradeIn = GIFT_GRADES.map(g => `'${g}'`).join(',');
  const roll = Math.random();
  let rows = [];
  if (opts.forceType === 'technique' || (!opts.forceType && roll < 0.30)) {
    rows = db.prepare(
      `SELECT * FROM xianxia_items WHERE character_id IS NULL AND item_type = 'technique' AND grade IN (${gradeIn})`
    ).all();
    // 优先与 NPC 同阵营的功法（faction 存于 metadata JSON）
    if (npc && npc.faction) {
      const same = rows.filter(r => {
        try { return JSON.parse(r.metadata || '{}').faction === npc.faction; } catch { return false; }
      });
      if (same.length > 0) rows = same;
    }
  } else if (opts.forceType === 'pill' || (!opts.forceType && roll < 0.70)) {
    rows = db.prepare(
      `SELECT * FROM xianxia_items WHERE character_id IS NULL AND item_type = 'pill' AND grade IN (${gradeIn})`
    ).all();
  } else {
    rows = db.prepare(
      `SELECT * FROM xianxia_items WHERE character_id IS NULL AND item_type IN ('material','treasure') AND grade IN (${gradeIn})`
    ).all();
  }
  if (rows.length === 0) return null;
  const t = rows[Math.floor(Math.random() * rows.length)];
  return {
    name: t.name,
    item_type: t.item_type,
    grade: t.grade || '凡品',
    description: t.description || null,
    effect: t.effect || null,
    metadata: t.metadata || null,
    claimed: false,
  };
}

// ==================== 兜底文案 ====================

const REPLY_FALLBACKS = {
  friendly: ['嗯，我知道了。', '此事容我想想，改日再叙。', '你既有心，我记下了。'],
  hostile: ['哼，少说废话。', '你我之间，没什么好谈的。'],
  neutral: ['嗯。', '我知道了。', '改日再叙。'],
};

function fallbackReply(relation, gift) {
  const types = (relation && relation.relation_types) || [];
  let pool = REPLY_FALLBACKS.neutral;
  if (types.some(t => ['enemy', 'blood_enemy'].includes(t))) pool = REPLY_FALLBACKS.hostile;
  else if (types.some(t => GIFT_RELATIONS_ALL.includes(t))) pool = REPLY_FALLBACKS.friendly;
  let text = pool[Math.floor(Math.random() * pool.length)];
  if (gift) text += `顺道予你「${gift.name}」，聊表心意。`;
  return text;
}

const PROACTIVE_FALLBACKS = {
  master: ['近来功课可有懈怠？为师改日要考校你一番。', '修行之事，不可一日荒废。切记切记。'],
  close_friend: ['许久不见，可还安好？改日一同去坊市逛逛如何？', '近日得了一坛好酒，忽然想起你了。'],
  friend: ['道友近来可好？有空一叙。', '许久未通音讯，特来问候一声。'],
  lover: ['多日不见，甚是思念。你何时归来？', '夜深忽梦君，醒来只想问你一声：一切可好？'],
  enemy: ['别以为躲着就没事了，你我之账，迟早要算。'],
  blood_enemy: ['血仇未报，寝食难安。你等着。'],
  neutral: ['道友近来可好？', '许久未见，特来问候。'],
};

function fallbackProactive(npc, relation, gift) {
  const types = (relation && relation.relation_types) || [];
  let pool = PROACTIVE_FALLBACKS.neutral;
  for (const key of ['master', 'close_friend', 'friend', 'lover', 'blood_enemy', 'enemy']) {
    if (types.includes(key)) { pool = PROACTIVE_FALLBACKS[key]; break; }
  }
  let text = pool[Math.floor(Math.random() * pool.length)];
  if (gift) text += `对了，这「${gift.name}」你且收下，或有用处。`;
  return text;
}

// ==================== LLM 生成 ====================

function relationLabels(relation) {
  const types = (relation && relation.relation_types) || [];
  return types.map(t => REL_TYPE_LABELS[t] || t).join('、') || '泛泛之交';
}

function npcPersonaBlock(npc, relation) {
  let traits = '';
  try {
    const p = JSON.parse(npc.personality_traits || '{}');
    const parts = Object.entries(p).map(([k, v]) => `${k}:${v}`);
    if (parts.length) traits = parts.join('，');
  } catch { /* 忽略脏数据 */ }
  return npcEngine.getNpcBehaviorPrompt(npc, relation) +
    `\n[性格类型: ${npc.personality_type || '未知'}]${traits ? `\n[性格特质: ${traits}]` : ''}`;
}

const CHAT_RULES = `规则：
- 你就是这个 NPC，以第一人称、符合其身份与性格的口吻回复
- 简短 1-3 句，像真人传讯对话，不要旁白、不要动作描写、不要引号包裹整段
- 符合修仙世界背景，不透露任何系统数值、好感度或游戏规则
- 当前关系：{REL}`;

/** 生成 NPC 对玩家消息的回复；失败/无 key 时走兜底文案 */
async function generateNpcReply(npc, relation, history, playerContent, gift) {
  try {
    const openai = xianxiaLLM.getClient();
    const system = '你是修仙世界「苍玄界」中的一名修士，正通过传讯玉符与一位道友文字交谈。\n\n' +
      npcPersonaBlock(npc, relation) + '\n\n' +
      CHAT_RULES.replace('{REL}', relationLabels(relation)) +
      (gift ? `\n- 你决定随这次传讯赠予对方「${gift.name}」（${gift.grade}），请在回复中自然地提及所赠之物，但不要描述具体数值效果。` : '');
    const messages = [{ role: 'system', content: system }];
    for (const m of history.slice(-10)) {
      messages.push({ role: m.sender === 'player' ? 'user' : 'assistant', content: m.content });
    }
    const response = await openai.chat.completions.create({
      model: xianxiaLLM.MODEL,
      messages,
      temperature: 0.8,
      max_tokens: 200,
    });
    const text = (response.choices[0].message.content || '').trim();
    if (text) return text;
    return fallbackReply(relation, gift);
  } catch (err) {
    return fallbackReply(relation, gift);
  }
}

/** 生成 NPC 主动来讯的开场消息；失败/无 key 时走兜底文案 */
async function generateProactiveContent(npc, relation, gift) {
  try {
    const openai = xianxiaLLM.getClient();
    const system = '你是修仙世界「苍玄界」中的一名修士，正通过传讯玉符主动联系一位道友。\n\n' +
      npcPersonaBlock(npc, relation) + '\n\n' +
      CHAT_RULES.replace('{REL}', relationLabels(relation)) +
      '\n- 由你主动发起话题：问候、求助、分享见闻或提及近况，任选其一，自然即可' +
      (gift ? `\n- 你决定随讯赠予对方「${gift.name}」（${gift.grade}），请在话语中自然地提及，但不要描述具体数值效果。` : '');
    const response = await openai.chat.completions.create({
      model: xianxiaLLM.MODEL,
      messages: [{ role: 'system', content: system }, { role: 'user', content: '（你主动发起传讯）' }],
      temperature: 0.85,
      max_tokens: 200,
    });
    const text = (response.choices[0].message.content || '').trim();
    if (text) return text;
    return fallbackProactive(npc, relation, gift);
  } catch (err) {
    return fallbackProactive(npc, relation, gift);
  }
}

// ==================== 对外主流程 ====================

/** 玩家发送消息 → NPC 回复（可能附礼）。返回 { reply, gift? } 或 { error, status } */
async function sendPlayerMessage(characterId, npcId, content, opts = {}) {
  const npc = db.prepare('SELECT * FROM xianxia_npcs WHERE id = ?').get(npcId);
  if (!npc) return { error: '对方不存在', status: 404 };
  if (!npc.is_alive) return { error: '对方已陨落，玉符再无回应', status: 400 };

  const relation = npcEngine.getOrCreateRelation(characterId, npcId);
  const thread = getOrCreateThread(characterId, npcId);
  addMessage(thread.id, 'player', content, null, false);

  const history = db.prepare(
    'SELECT sender, content FROM xianxia_jade_messages WHERE thread_id = ? ORDER BY id DESC LIMIT 10'
  ).all(thread.id).reverse();

  // 回礼概率：师父/挚友/道侣 12%，朋友 6%，其余不给
  const types = relation.relation_types || [];
  let giftChance = 0;
  if (types.some(t => GIFT_RELATIONS_HIGH.includes(t))) giftChance = 0.12;
  else if (types.includes('friend')) giftChance = 0.06;
  const gift = (opts.forceGift || Math.random() < giftChance) ? pickGift(npc, opts) : null;

  const replyText = await generateNpcReply(npc, relation, history, content, gift);
  const replyMsg = addMessage(thread.id, 'npc', replyText, gift ? JSON.stringify(gift) : null, false);

  return {
    reply: {
      id: replyMsg.id,
      sender: 'npc',
      content: replyText,
      item_payload: gift,
      created_at: replyMsg.created_at,
    },
    gift: gift || undefined,
  };
}

/**
 * NPC 主动来讯：默认 10% 概率触发（opts.force 必中）。
 * 15% 概率附赠礼物（opts.forceGift 必附，限亲密/友好关系）。
 * 附礼时写时间线 jade_gift；不附礼不写（避免刷屏）。
 */
async function maybeProactiveMessage(character, opts = {}) {
  if (!character || character.status !== 'active') return { triggered: false };
  const chance = opts.force ? 1 : (opts.chance !== undefined ? opts.chance : 0.10);
  if (Math.random() >= chance) return { triggered: false };

  const rels = db.prepare(
    `SELECT xr.npc_id FROM xianxia_relationships xr
     JOIN xianxia_npcs xn ON xr.npc_id = xn.id
     WHERE xr.character_id = ? AND xn.is_alive = 1`
  ).all(character.id);
  if (rels.length === 0) return { triggered: false };

  const npcId = rels[Math.floor(Math.random() * rels.length)].npc_id;
  const npc = db.prepare('SELECT * FROM xianxia_npcs WHERE id = ?').get(npcId);
  if (!npc) return { triggered: false };

  const relation = npcEngine.getOrCreateRelation(character.id, npcId);
  const types = relation.relation_types || [];
  const giftEligible = types.some(t => GIFT_RELATIONS_ALL.includes(t));
  const gift = (giftEligible && (opts.forceGift || Math.random() < 0.15)) ? pickGift(npc) : null;

  const content = await generateProactiveContent(npc, relation, gift);
  const thread = getOrCreateThread(character.id, npcId);
  addMessage(thread.id, 'npc', content, gift ? JSON.stringify(gift) : null, true);

  if (gift) {
    const gameTime = xianxiaLLM.formatGameAge(character.game_age);
    db.prepare(
      'INSERT INTO xianxia_timeline (character_id, game_time, event_type, narrative, rewards) VALUES (?, ?, ?, ?, ?)'
    ).run(character.id, gameTime, 'jade_gift',
      `${npc.name}通过传讯玉符赠你「${gift.name}」（${gift.grade}），记得去玉符中领取。`,
      JSON.stringify([{ text: `获得 ${gift.name}`, tone: 'gain' }]));
  }

  return { triggered: true, npcId, npcName: npc.name, content, gift: gift || undefined };
}

/** 领取赠礼：校验归属与未领取 → 物品入库 → 标记 claimed → 写时间线 */
/** 礼物入背包：功法为秘籍物品（使用后方可参悟习得），其余按原样入库 */
function insertGiftItem(characterId, payload) {
  db.prepare(
    `INSERT INTO xianxia_items (character_id, name, item_type, grade, description, slot, attack, defense, effect, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(characterId, payload.name, payload.item_type || 'misc', payload.grade || '凡品',
    payload.description || null, null, null, null, payload.effect || null,
    payload.metadata || null);
}

function claimGift(characterId, messageId) {
  const msg = db.prepare(
    `SELECT m.*, t.character_id FROM xianxia_jade_messages m
     JOIN xianxia_jade_threads t ON m.thread_id = t.id
     WHERE m.id = ?`
  ).get(messageId);
  if (!msg || msg.character_id !== characterId) return { error: '消息不存在', status: 404 };
  const payload = parsePayload(msg.item_payload);
  if (!payload) return { error: '该消息没有附带赠礼', status: 400 };

  // 已领取的功法礼物：历史修复通道——
  // 秘籍在行囊→提示去参悟；已习得→确认习得；两头都没有（旧版误吞）→补发秘籍
  if (payload.claimed) {
    if (payload.item_type !== 'technique') return { error: '赠礼已领取', status: 400 };
    const row = db.prepare('SELECT learned_techniques FROM xianxia_characters WHERE id = ?').get(characterId);
    const learnedList = JSON.parse((row && row.learned_techniques) || '[]');
    if (learnedList.some(e => e && e.name === payload.name)) {
      return { ok: true, itemName: payload.name, learned: true, repaired: true };
    }
    const stray = db.prepare(
      "SELECT id FROM xianxia_items WHERE character_id = ? AND name = ? AND item_type = 'technique'"
    ).get(characterId, payload.name);
    if (stray) return { error: '赠礼已领取——秘籍已在你的行囊中，使用即可参悟', status: 400 };
    insertGiftItem(characterId, payload);
    return { ok: true, itemName: payload.name, repaired: true };
  }

  // 未领取：礼物入背包（功法秘籍需在行囊中使用后方可习得）
  insertGiftItem(characterId, payload);

  payload.claimed = true;
  db.prepare('UPDATE xianxia_jade_messages SET item_payload = ? WHERE id = ?')
    .run(JSON.stringify(payload), messageId);

  const character = db.prepare('SELECT game_age FROM xianxia_characters WHERE id = ?').get(characterId);
  const gameTime = xianxiaLLM.formatGameAge(character ? character.game_age : 0);
  const isTechnique = payload.item_type === 'technique';
  const gainText = isTechnique ? `获得《${payload.name}》秘籍` : `获得 ${payload.name}`;
  const narrative = isTechnique
    ? `你从传讯玉符中领取了功法秘籍《${payload.name}》（${payload.grade}）——已放入行囊，参悟（使用）后方可习得。`
    : `你从传讯玉符中领取了「${payload.name}」（${payload.grade}）。`;
  db.prepare(
    'INSERT INTO xianxia_timeline (character_id, game_time, event_type, narrative, rewards) VALUES (?, ?, ?, ?, ?)'
  ).run(characterId, gameTime, 'jade_gift', narrative,
    JSON.stringify([{ text: gainText, tone: 'gain' }]));

  return { ok: true, itemName: payload.name };
}

module.exports = {
  REL_TYPE_LABELS,
  getOrCreateThread,
  listThreads,
  getMessages,
  sendPlayerMessage,
  maybeProactiveMessage,
  claimGift,
  pickGift,
};
