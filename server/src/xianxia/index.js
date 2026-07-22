// 修仙模拟人生 — 服务端模块入口
// 提供角色 CRUD、世界状态、NPC 交互、突破结算、奇遇等 API

const { db } = require('../db');
const xianxiaLLM = require('./llm');
const breakthrough = require('./breakthrough');
const npcEngine = require('./npc');
const worldEvents = require('./events');

// ==================== 简单 per-user 频率限制（内存计数） ====================

const rateBuckets = new Map(); // key -> number[] (timestamps)

function rateAllow(key, max, windowMs) {
  const now = Date.now();
  const arr = (rateBuckets.get(key) || []).filter(t => now - t < windowMs);
  if (arr.length >= max) {
    rateBuckets.set(key, arr);
    return false;
  }
  arr.push(now);
  rateBuckets.set(key, arr);
  return true;
}

// 定期清理过期桶，避免内存缓慢增长
setInterval(() => {
  const now = Date.now();
  for (const [key, arr] of rateBuckets) {
    const kept = arr.filter(t => now - t < 15 * 60 * 1000);
    if (kept.length === 0) rateBuckets.delete(key);
    else rateBuckets.set(key, kept);
  }
}, 10 * 60 * 1000).unref();

// ==================== 每角色行动串行队列（防并发竞态） ====================

const actionQueues = new Map(); // characterId -> Promise

function enqueue(characterId, task) {
  const prev = actionQueues.get(characterId) || Promise.resolve();
  const next = prev.then(task, task);
  // 队列尾 promise 永不 reject，保证后续任务能继续
  actionQueues.set(characterId, next.catch(() => {}));
  return next;
}

// ==================== 计时器工具（统一 ISO 带 Z 格式读写） ====================

function getTimerRemaining(character) {
  if (!character.timer_end_at || !character.timer_type) return null;
  const end = new Date(character.timer_end_at); // 写入侧统一为 toISOString()，已带 Z
  if (isNaN(end.getTime())) return null;
  return Math.max(0, Math.ceil((end.getTime() - Date.now()) / 1000));
}

function timerActive(character) {
  const r = getTimerRemaining(character);
  return r !== null && r > 0;
}

// 角色详情对白名单字段（隐藏数值 fortune/气运 不出现在任何响应中）
const CHARACTER_PUBLIC_COLS = `id, name, gender, status, spirit_roots, special_body,
  birth_region, birth_background, birth_narrative, cultivation_paths,
  lifespan_remaining, health, qi_current, qi_max, divine_sense, dao_heart,
  comprehension, spirit_stones, fame, infamy, charm, pressure,
  alchemy_skill, crafting_skill, formation_skill, talisman_skill,
  body_status, current_location, game_age,
  timer_type, timer_end_at, timer_narrative, created_at, updated_at`;

// ==================== 角色管理 ====================

/** GET /api/xianxia/characters — 当前用户的所有角色列表 */
function listCharacters(req, res) {
  const characters = db.prepare(
    `SELECT id, name, gender, status, birth_region, birth_background,
            cultivation_paths, lifespan_remaining, current_location, game_age,
            timer_type, timer_end_at, created_at
     FROM xianxia_characters WHERE user_id = ? ORDER BY updated_at DESC`
  ).all(req.userId);

  // 为每个角色补充倒计时剩余秒数
  const result = characters.map(c => ({
    ...c,
    cultivation_paths: JSON.parse(c.cultivation_paths || '{}'),
    timer_remaining: getTimerRemaining(c)
  }));

  res.json({ characters: result });
}

/** POST /api/xianxia/characters — 创建新角色（进入出生流程） */
function createCharacter(req, res) {
  const { name, gender } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: '请输入角色名' });
  const safeName = name.trim().slice(0, 20);
  const safeGender = ['neutral', 'male', 'female'].includes(gender) ? gender : 'neutral';

  // 随机生成灵根
  const { roots: spiritRoots, specialBody } = generateSpiritRoots();
  // 随机选择出生区域和背景
  const birth = pickRandomBirth();

  const result = db.prepare(
    `INSERT INTO xianxia_characters (user_id, name, gender, spirit_roots, special_body, birth_region, birth_background)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(req.userId, safeName, safeGender, JSON.stringify(spiritRoots), specialBody, birth.region, birth.background);

  const characterId = result.lastInsertRowid;

  res.json({
    character: {
      id: characterId,
      name: safeName,
      gender: safeGender,
      spirit_roots: spiritRoots,
      special_body: specialBody,
      birth_region: birth.region,
      birth_background: birth.background
    }
  });
}

/** GET /api/xianxia/characters/:id — 获取角色完整详情（隐藏数值不下发） */
function getCharacter(req, res) {
  const character = db.prepare(
    `SELECT ${CHARACTER_PUBLIC_COLS} FROM xianxia_characters WHERE id = ? AND user_id = ?`
  ).get(req.params.id, req.userId);
  if (!character) return res.status(404).json({ error: '角色不存在' });

  const items = db.prepare('SELECT * FROM xianxia_items WHERE character_id = ?').all(character.id);
  // 好感度 affection 为隐藏数值，不下发；只给关系类型标签
  const relationships = db.prepare(
    `SELECT xr.id, xr.npc_id, xr.relation_types, xr.notes, xr.updated_at,
            xn.name as npc_name, xn.identity as npc_identity, xn.faction as npc_faction
     FROM xianxia_relationships xr
     JOIN xianxia_npcs xn ON xr.npc_id = xn.id
     WHERE xr.character_id = ?`
  ).all(character.id);

  res.json({
    ...character,
    spirit_roots: JSON.parse(character.spirit_roots || '{}'),
    cultivation_paths: JSON.parse(character.cultivation_paths || '{}'),
    special_body: character.special_body || null,
    body_status: character.body_status || null,
    timer_remaining: getTimerRemaining(character),
    items,
    relationships: relationships.map(r => ({
      ...r,
      relation_types: JSON.parse(r.relation_types || '[]')
    }))
  });
}

/** DELETE /api/xianxia/characters/:id — 删除角色及其全部人生数据 */
function deleteCharacter(req, res) {
  const character = db.prepare('SELECT id, status FROM xianxia_characters WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.userId);
  if (!character) return res.status(404).json({ error: '角色不存在' });

  // 取舍说明：删除视为「彻底抹除这一世」——包括已陨落/已飞升角色的传世与通关记录。
  // 各表虽有 ON DELETE CASCADE，仍在事务内显式逐表删除，双保险（FK 失效时也能删干净）。
  const deleteAll = db.transaction(() => {
    db.prepare('DELETE FROM xianxia_timeline WHERE character_id = ?').run(character.id);
    db.prepare('DELETE FROM xianxia_relationships WHERE character_id = ?').run(character.id);
    db.prepare('DELETE FROM xianxia_items WHERE character_id = ?').run(character.id);
    db.prepare('DELETE FROM xianxia_legacy WHERE character_id = ?').run(character.id);
    db.prepare('DELETE FROM xianxia_completed_runs WHERE character_id = ?').run(character.id);
    db.prepare('DELETE FROM xianxia_characters WHERE id = ? AND user_id = ?').run(character.id, req.userId);
  });
  deleteAll();

  res.json({ ok: true });
}

/** PATCH /api/xianxia/characters/:id — 更新角色状态（仅放行客户端可信字段） */
function updateCharacter(req, res) {
  const character = db.prepare('SELECT id FROM xianxia_characters WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.userId);
  if (!character) return res.status(404).json({ error: '角色不存在' });

  // 数值、境界、计时器只能由服务端游戏逻辑改写，客户端无权直接设置
  const allowedFields = ['current_location'];

  const updates = [];
  const values = [];
  for (const [key, value] of Object.entries(req.body)) {
    if (allowedFields.includes(key) && typeof value === 'string') {
      updates.push(`${key} = ?`);
      values.push(value.slice(0, 100));
    }
  }

  if (updates.length === 0) return res.json({ ok: true });

  updates.push("updated_at = datetime('now')");
  values.push(character.id);

  db.prepare(`UPDATE xianxia_characters SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  res.json({ ok: true });
}

// ==================== 时间线 ====================

/** GET /api/xianxia/characters/:id/timeline */
function getTimeline(req, res) {
  const character = db.prepare('SELECT id FROM xianxia_characters WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.userId);
  if (!character) return res.status(404).json({ error: '角色不存在' });

  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 30));
  const before = parseInt(req.query.before, 10);

  let events;
  if (Number.isFinite(before)) {
    events = db.prepare(
      'SELECT * FROM xianxia_timeline WHERE character_id = ? AND id < ? ORDER BY id DESC LIMIT ?'
    ).all(req.params.id, before, limit);
  } else {
    events = db.prepare(
      'SELECT * FROM xianxia_timeline WHERE character_id = ? ORDER BY id DESC LIMIT ?'
    ).all(req.params.id, limit);
  }

  res.json({ events: events.reverse() });
}

// ==================== 世界状态 ====================

/** GET /api/xianxia/world-state */
function getWorldState(req, res) {
  const rows = db.prepare('SELECT key, value FROM xianxia_world_state').all();
  const state = {};
  for (const row of rows) {
    try { state[row.key] = JSON.parse(row.value); }
    catch { state[row.key] = row.value; }
  }
  res.json({ world_state: state });
}

// ==================== NPC 查询 ====================

/** GET /api/xianxia/npcs */
function listNpcs(req, res) {
  const { location, faction } = req.query;
  let sql = 'SELECT id, name, identity, faction, location, personality_type, strength_level, is_fixed FROM xianxia_npcs WHERE is_alive = 1';
  const params = [];
  if (location) { sql += ' AND location = ?'; params.push(location); }
  if (faction) { sql += ' AND faction = ?'; params.push(faction); }
  const npcs = db.prepare(sql + ' ORDER BY id').all(...params);
  res.json({ npcs });
}

// ==================== 传世记录 ====================

/** GET /api/xianxia/legacy */
function getLegacy(req, res) {
  const records = db.prepare(
    `SELECT xl.*, xc.name as character_name
     FROM xianxia_legacy xl
     JOIN xianxia_characters xc ON xl.character_id = xc.id
     WHERE xc.user_id = ?
     ORDER BY xl.created_at DESC`
  ).all(req.userId);

  const completed = db.prepare(
    'SELECT * FROM xianxia_completed_runs WHERE character_id IN (SELECT id FROM xianxia_characters WHERE user_id = ?) ORDER BY created_at DESC'
  ).all(req.userId);

  res.json({ legacy: records, completed_runs: completed });
}

// ==================== LLM 集成 ====================

/** POST /api/xianxia/characters/:id/action — 处理玩家行动 */
async function processAction(req, res) {
  const characterId = parseInt(req.params.id, 10);
  const character = db.prepare('SELECT id, user_id, status FROM xianxia_characters WHERE id = ? AND user_id = ?')
    .get(characterId, req.userId);
  if (!character) return res.status(404).json({ error: '角色不存在' });
  if (character.status !== 'active') return res.status(400).json({ error: '该角色已陨落或飞升，无法继续行动' });

  const { action } = req.body;
  if (!action || !action.trim()) return res.status(400).json({ error: '请输入行动内容' });
  const safeAction = action.trim().slice(0, 500); // 输入截断，控制 token 成本

  // 频率限制：每用户每分钟最多 12 次 LLM 行动
  if (!rateAllow(`action:${req.userId}`, 12, 60 * 1000)) {
    return res.status(429).json({ error: '行动过于频繁，请稍候再试' });
  }

  try {
    const result = await enqueue(characterId, async () => {
      // 队列内重新读取，保证 check-then-act 串行化
      const fresh = db.prepare('SELECT * FROM xianxia_characters WHERE id = ?').get(characterId);
      if (!fresh || fresh.status !== 'active') throw new Error('角色状态已变更');

      // 倒计时锁：服务端强制校验
      if (timerActive(fresh)) {
        const err = new Error('locked');
        err.locked = true;
        err.remaining = getTimerRemaining(fresh);
        throw err;
      }

      // 计时器已到期：先结算（突破/炼制），再处理新行动
      let settled = null;
      if (fresh.timer_type && fresh.timer_end_at) {
        settled = await breakthrough.completeBreakthrough(characterId);
      }

      const r = await xianxiaLLM.processAction(characterId, safeAction);

      // 剧本通道：计时器已在事务内由服务端设置，直接透传给客户端
      if (r.timerSet) {
        r.timer = r.timerSet;
        delete r.timerSet;
      }

      // 自由通道：如果 LLM 通过结构化标记触发了倒计时，写入角色状态
      if (r.timerTriggered) {
        const endAt = new Date(Date.now() + r.timerTriggered.duration * 1000).toISOString();
        db.prepare(
          `UPDATE xianxia_characters SET timer_type = ?, timer_end_at = ?, timer_narrative = ?, updated_at = datetime('now') WHERE id = ?`
        ).run(r.timerTriggered.type, endAt, r.timerTriggered.narrative, characterId);
        r.timer = {
          type: r.timerTriggered.type,
          remaining: r.timerTriggered.duration,
          narrative: r.timerTriggered.narrative,
        };
      }
      delete r.timerTriggered;

      if (settled && settled.narrative) r.settled = settled.narrative;

      // NPC 好感度启发式：仅自由通道（剧本通道由剧本自身 npcEffects 处理）
      if (!r.scriptId) {
        try {
          const mentioned = db.prepare('SELECT * FROM xianxia_npcs WHERE is_alive = 1').all()
            .filter(n => n.name && (r.narrative.includes(n.name) || safeAction.includes(n.name)));
          if (mentioned.length > 0) {
            const deltas = npcEngine.analyzeAffectionChange(r.narrative, safeAction);
            for (const n of mentioned.slice(0, 3)) {
              for (const d of deltas.slice(0, 2)) {
                npcEngine.applyAffectionChange(characterId, n.id, d.delta, d.reason);
              }
            }
          }
        } catch (e) {
          console.error('NPC 好感度更新失败:', e.message);
        }
      }

      // 世界事件最小接入：小概率播种，新事件写入角色时间线
      try {
        if (Math.random() < 0.08) {
          const evts = worldEvents.tickWorldEvents();
          for (const evt of evts) {
            db.prepare(
              'INSERT INTO xianxia_timeline (character_id, game_time, event_type, narrative) VALUES (?, ?, ?, ?)'
            ).run(characterId, r.gameTime, 'world_event', `【${evt.title}】${evt.narrative}`);
          }
        }
      } catch (e) {
        console.error('世界事件推演失败:', e.message);
      }

      return r;
    });

    res.json(result);
  } catch (err) {
    if (err.locked) {
      return res.status(423).json({ error: '闭关或突破进行中，暂时无法行动', timer_remaining: err.remaining });
    }
    console.error('行动处理失败:', err.message);
    res.status(500).json({ error: '行动处理失败，请重试' });
  }
}

/** POST /api/xianxia/characters/:id/settle — 倒计时结束后结算突破/炼制 */
async function settleTimer(req, res) {
  const characterId = parseInt(req.params.id, 10);
  const character = db.prepare('SELECT id FROM xianxia_characters WHERE id = ? AND user_id = ?')
    .get(characterId, req.userId);
  if (!character) return res.status(404).json({ error: '角色不存在' });

  try {
    const result = await enqueue(characterId, async () => {
      const fresh = db.prepare('SELECT * FROM xianxia_characters WHERE id = ?').get(characterId);
      if (!fresh || !fresh.timer_type || !fresh.timer_end_at) return { settled: false };
      if (timerActive(fresh)) {
        const err = new Error('locked');
        err.locked = true;
        err.remaining = getTimerRemaining(fresh);
        throw err;
      }
      const r = await breakthrough.completeBreakthrough(characterId);
      return { settled: true, success: r ? !!r.success : null, narrative: r ? r.narrative : null };
    });
    res.json(result);
  } catch (err) {
    if (err.locked) {
      return res.status(423).json({ error: '计时尚未结束', timer_remaining: err.remaining });
    }
    console.error('结算失败:', err.message);
    res.status(500).json({ error: '结算失败，请重试' });
  }
}

/** POST /api/xianxia/characters/:id/birth-narrative — 生成出生阶段叙事 */
async function birthNarrative(req, res) {
  const character = db.prepare('SELECT id, name, gender, birth_region, birth_background, spirit_roots, special_body FROM xianxia_characters WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.userId);
  if (!character) return res.status(404).json({ error: '角色不存在' });

  const { stage, choice } = req.body;
  if (!stage) return res.status(400).json({ error: '请指定阶段' });

  // 频率限制：每用户每分钟最多 12 次出生叙事
  if (!rateAllow(`birth:${req.userId}`, 12, 60 * 1000)) {
    return res.status(429).json({ error: '请求过于频繁，请稍候再试' });
  }

  try {
    const narrative = await xianxiaLLM.generateBirthNarrative(
      { ...character, spirit_roots: JSON.parse(character.spirit_roots || '{}') },
      stage,
      typeof choice === 'string' ? choice.slice(0, 100) : undefined
    );

    // 保存到时间线 + 成人阶段由服务端写入年龄与初始位置（客户端无权 PATCH 数值）
    const finalizeBirth = db.transaction(() => {
      const gameTime = `${stage === 'birth' ? 0 : stage === 'awakening' ? 6 : stage === 'choice' ? 12 : 16}岁`;
      db.prepare(
        'INSERT INTO xianxia_timeline (character_id, game_time, event_type, narrative) VALUES (?, ?, ?, ?)'
      ).run(character.id, gameTime, 'birth_stage', narrative);
      if (stage === 'coming') {
        db.prepare(
          `UPDATE xianxia_characters SET game_age = 16, current_location = ?, updated_at = datetime('now') WHERE id = ?`
        ).run(`${character.birth_region}-家乡小镇`, character.id);
      }
    });
    finalizeBirth();

    res.json({ narrative, stage });
  } catch (err) {
    console.error('出生叙事生成失败:', err.message);
    res.status(500).json({ error: '叙事生成失败' });
  }
}

/** GET /api/xianxia/characters/:id/export — 导出人生叙事 MD */
async function exportMD(req, res) {
  const character = db.prepare('SELECT id FROM xianxia_characters WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.userId);
  if (!character) return res.status(404).json({ error: '角色不存在' });

  // 频率限制：每用户每 10 分钟最多 3 次导出（导出消耗 token 较多）
  if (!rateAllow(`export:${req.userId}`, 3, 10 * 60 * 1000)) {
    return res.status(429).json({ error: '导出过于频繁，请稍候再试' });
  }

  try {
    const md = await xianxiaLLM.generateExportMD(character.id);
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="xianxia-life-${character.id}.md"`);
    res.send(md);
  } catch (err) {
    console.error('MD 导出失败:', err.message);
    res.status(500).json({ error: '导出失败' });
  }
}

// ==================== 辅助函数 ====================

function generateSpiritRoots() {
  const elements = ['金', '木', '水', '火', '土'];
  const roots = {};
  // 随机 1-5 个灵根，各 0-100
  const count = weightedRandom([1,2,3,4,5], [5,30,40,20,5]);
  const selected = shuffleArray(elements).slice(0, count);
  for (const el of selected) {
    roots[el] = Math.floor(Math.random() * 70) + 30; // 30-100
  }
  // 变异灵根 5% 概率
  let specialBody = null;
  if (Math.random() < 0.05) {
    const variants = ['雷', '冰', '风', '暗', '光'];
    const variant = variants[Math.floor(Math.random() * variants.length)];
    roots[variant] = Math.floor(Math.random() * 40) + 60; // 60-100
  }
  // 特殊体质 3% 概率
  if (Math.random() < 0.03) {
    const bodies = ['纯阳之体', '九阴绝脉', '天生剑骨', '药灵体', '天煞孤星', '混沌道体'];
    specialBody = bodies[Math.floor(Math.random() * bodies.length)];
  }
  return { roots, specialBody };
}

function pickRandomBirth() {
  const births = [
    // 中州
    { region: '中州', background: '凡人农家', weight: 35 },
    { region: '中州', background: '小宗门弟子家庭', weight: 15 },
    { region: '中州', background: '散修城弃婴', weight: 5 },
    { region: '中州', background: '商会世家', weight: 5 },
    { region: '中州', background: '没落修仙世家', weight: 3 },
    // 北荒
    { region: '北荒', background: '猎户子女', weight: 8 },
    { region: '北荒', background: '铁骨门外围家庭', weight: 5 },
    { region: '北荒', background: '逃难者', weight: 3 },
    { region: '北荒', background: '极地隐修弟子', weight: 2 },
    // 南疆
    { region: '南疆', background: '采药人子女', weight: 8 },
    { region: '南疆', background: '蛊师家族后裔', weight: 4 },
    { region: '南疆', background: '雾中村幸存者子女', weight: 1 },
    // 东海
    { region: '东海', background: '渔村子女', weight: 7 },
    { region: '东海', background: '商船水手子女', weight: 5 },
    { region: '东海', background: '海盗子女', weight: 3 },
    { region: '东海', background: '碧水宫外围岛民', weight: 3 },
    // 西漠
    { region: '西漠', background: '凡人农户', weight: 7 },
    { region: '西漠', background: '王朝贵族', weight: 3 },
    { region: '西漠', background: '古矿村村民', weight: 3 },
    { region: '西漠', background: '商路驼队子女', weight: 5 },
  ];

  const totalWeight = births.reduce((s, b) => s + b.weight, 0);
  let rand = Math.random() * totalWeight;
  for (const b of births) {
    rand -= b.weight;
    if (rand <= 0) {
      // 极稀有特殊出身（额外 2%）
      if (Math.random() < 0.02) {
        const specials = ['轮回者', '天命异象'];
        return { region: b.region, background: specials[Math.floor(Math.random() * specials.length)] };
      }
      return { region: b.region, background: b.background };
    }
  }
  return { region: '中州', background: '凡人农家' };
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function weightedRandom(values, weights) {
  const total = weights.reduce((s, w) => s + w, 0);
  let rand = Math.random() * total;
  for (let i = 0; i < values.length; i++) {
    rand -= weights[i];
    if (rand <= 0) return values[i];
  }
  return values[0];
}

module.exports = {
  listCharacters, createCharacter, getCharacter, updateCharacter, deleteCharacter,
  getTimeline, getWorldState, listNpcs, getLegacy,
  processAction, settleTimer, birthNarrative, exportMD
};
