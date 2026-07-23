// 修仙模拟人生 — 服务端模块入口
// 提供角色 CRUD、世界状态、NPC 交互、突破结算、奇遇等 API

const { db } = require('../db');
const xianxiaLLM = require('./llm');
const breakthrough = require('./breakthrough');
const npcEngine = require('./npc');
const worldEvents = require('./events');
const npcBehavior = require('./npc_behavior');
const { optionsForLocation, withBreakthroughOption, buffsFromPillEffect, parseJson } = require('./scripts/utils');
const techniques = require('./techniques');

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
  essence, qi, spirit, active_buffs,
  strange_corruption, discovered_locations, special_equipment, learned_techniques,
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
    `INSERT INTO xianxia_characters (user_id, name, gender, spirit_roots, special_body, birth_region, birth_background, learned_techniques)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(req.userId, safeName, safeGender, JSON.stringify(spiritRoots), specialBody, birth.region, birth.background,
    JSON.stringify([{ name: '吐纳基础', depth: 0, main: true }])); // 出生自带基准心法

  const characterId = result.lastInsertRowid;

  // 初始地点发现：出生区域 + 当前所在区域的地点立即可前往（避免新玩家旅行死锁）
  try {
    const newChar = db.prepare('SELECT current_location FROM xianxia_characters WHERE id = ?').get(characterId);
    const currentRegion = ((newChar && newChar.current_location) || '中州-无名小镇').split('-')[0];
    const initial = new Set(REGION_LOCATIONS[birth.region] || []);
    for (const loc of REGION_LOCATIONS[currentRegion] || []) initial.add(loc);
    if (initial.size > 0) {
      db.prepare("UPDATE xianxia_characters SET discovered_locations = ? WHERE id = ?")
        .run(JSON.stringify([...initial]), characterId);
    }
  } catch (e) { console.error('初始地点发现失败:', e.message); }

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
    discovered_locations: JSON.parse(character.discovered_locations || '[]'),
    special_equipment: JSON.parse(character.special_equipment || '[]'),
    learned_techniques: techniques.enrichForClient(character),
    special_body: character.special_body || null,
    body_status: character.body_status || null,
    active_buffs: JSON.parse(character.active_buffs || '[]'),
    timer_remaining: getTimerRemaining(character),
    // 地点情境化选项：前端 suggestions 的兜底来源（行动返回的 options 优先）
    location_options: withBreakthroughOption(character, optionsForLocation(character)),
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
  actionQueues.delete(character.id);
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

      // 防御性合并：两条路径不会同时出现，但如果同时出现则 timerSet 优先
      if (r.timerSet && r.timerTriggered) {
        delete r.timerTriggered;
      }

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

      // 推进游戏时间
      if (r.gameTime != null) {
        const ageNum = parseFloat(r.gameTime) || 0;
        if (ageNum > 0) {
          db.prepare('UPDATE xianxia_characters SET game_age = MAX(game_age, ?), updated_at = datetime(\'now\') WHERE id = ?')
            .run(ageNum, characterId);
        }
      }

      if (settled && settled.narrative) r.settled = settled.narrative;

      // NPC 好感度启发式：仅自由通道（剧本通道由剧本自身 npcEffects 处理）
      if (!r.scriptId) {
        try {
          const mentioned = db.prepare('SELECT * FROM xianxia_npcs WHERE is_alive = 1').all()
            .filter(n => n.name && (r.narrative.includes(n.name) || safeAction.includes(n.name)));
          if (mentioned.length > 0) {
            const deltas = npcEngine.analyzeAffectionChange(r.narrative, safeAction);
            // 按绝对值排序，优先应用影响最大的变化
            deltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
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

      // NPC 半主动行为：8% 概率触发
      try {
        const nb = npcBehavior.triggerNpcBehavior(characterId);
        if (nb.triggered) {
          // 应用属性收益（带边界 clamp），并生成收益摘要写入时间线 rewards
          const NB_BOUNDS = { health: [0, 100], dao_heart: [0, 100], qi_current: [0, 99999], qi: [0, 999], essence: [0, 999], spirit: [0, 999], spirit_stones: [0, 999999] };
          const NB_LABELS = { health: '生命', dao_heart: '道心', qi_current: '灵力', qi: '气', essence: '精', spirit: '神', spirit_stones: '灵石' };
          const rewards = [];
          const charNow = db.prepare('SELECT * FROM xianxia_characters WHERE id = ?').get(characterId);
          for (const [key, delta] of Object.entries(nb.deltas || {})) {
            if (typeof delta !== 'number' || delta === 0) continue;
            const bounds = NB_BOUNDS[key] || [0, 999999];
            const cur = charNow && typeof charNow[key] === 'number' ? charNow[key] : 0;
            const val = Math.min(bounds[1], Math.max(bounds[0], cur + delta));
            db.prepare(`UPDATE xianxia_characters SET ${key} = ?, updated_at = datetime('now') WHERE id = ?`).run(val, characterId);
            rewards.push({ text: `${NB_LABELS[key] || key} ${delta > 0 ? '+' : ''}${delta}`, tone: delta > 0 ? 'gain' : 'loss' });
          }
          for (const e of nb.npcEffects || []) {
            try { npcEngine.applyAffectionChange(characterId, e.npcId, e.delta, e.reason); } catch {}
          }
          db.prepare(
            'INSERT INTO xianxia_timeline (character_id, game_time, event_type, narrative, rewards) VALUES (?, ?, ?, ?, ?)'
          ).run(characterId, r.gameTime || '', 'npc_behavior', nb.narrative,
            rewards.length > 0 ? JSON.stringify(rewards) : null);
          r.npc_behavior = nb;
        }
      } catch (e) {
        console.error('NPC 行为触发失败:', e.message);
      }

      // 死亡判定：只认数值与显式状态，不扫描叙事文本（叙事措辞不可作为判死依据）
      // 判死条件：显式 statusChanged，或行动结算后生命归零
      try {
        const freshChar = db.prepare('SELECT * FROM xianxia_characters WHERE id = ?').get(characterId);
        const diedByWounds = freshChar && freshChar.status === 'active' && (freshChar.health || 0) <= 0;
        if ((r.statusChanged === 'dead' || diedByWounds) && freshChar && freshChar.status === 'active') {
          const deathNarrative = diedByWounds
            ? '伤势过重，回天乏术。这一世的路走到了尽头，求道者倒在了征途之上。'
            : (r.deathNarrative || '在修仙途中陨落。');
          const cultivation = JSON.parse(freshChar.cultivation_paths || '{}');
          const finalCultivation = Object.values(cultivation).filter(Boolean).join('、') || '未入道门';
          db.prepare("UPDATE xianxia_characters SET status = 'dead', updated_at = datetime('now') WHERE id = ?")
            .run(characterId);
          db.prepare(
            'INSERT INTO xianxia_legacy (character_id, death_cause, death_narrative, final_cultivation, final_age, legacy_type) VALUES (?, ?, ?, ?, ?, ?)'
          ).run(characterId, diedByWounds ? '伤重不治' : (r.deathCause || '在修仙途中陨落'),
            deathNarrative, finalCultivation, Math.floor(freshChar.game_age || 0), 'battle_death');
          r.died = true;
          r.deathNarrative = deathNarrative;
        }
      } catch (e) { console.error('死亡记录写入失败:', e.message); }

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

// ==================== 物品使用 API ====================

/** POST /api/xianxia/characters/:id/use-item — 使用背包中的物品 */
async function useItem(req, res) {
  const character = db.prepare('SELECT * FROM xianxia_characters WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.userId);
  if (!character) return res.status(404).json({ error: '角色不存在' });

  const { itemId } = req.body;
  if (!itemId) return res.status(400).json({ error: '请指定物品' });

  const item = db.prepare('SELECT * FROM xianxia_items WHERE id = ? AND character_id = ?')
    .get(itemId, character.id);
  if (!item) return res.status(404).json({ error: '物品不存在或不属于此角色' });

  const type = item.item_type;
  const effect = JSON.parse(item.effect || '{}');
  const rawEffect = JSON.parse(item.raw_effect || '{}');

  // 永久三元丹：含精/气/神正词条且无 duration 的丹药，每种限服三次（计数存 pill_usage）
  const isStatPill = type === 'pill' && !effect.duration
    && ['essence', 'qi', 'spirit'].some(k => typeof effect[k] === 'number' && effect[k] > 0);
  if (isStatPill) {
    const usage = parseJson(character.pill_usage, {});
    if ((usage[item.name] || 0) >= 3) {
      return res.status(400).json({ error: `你服用${item.name}已逾三枚，此丹药性于你再无裨益，还是留给有缘人吧。` });
    }
  }
  const deltas = {};
  let newBuffs = null; // duration 类丹药 → 写入 active_buffs 而非即时改数值

  if (type === 'pill' || (type === 'material' && Object.keys(rawEffect).length > 0)) {
    const e = type === 'pill' ? effect : rawEffect;
    const buffsToAdd = buffsFromPillEffect(e);
    if (buffsToAdd) {
      const existing = parseJson(character.active_buffs, []);
      newBuffs = existing.concat(buffsToAdd);
    } else {
      for (const [key, val] of Object.entries(e)) {
        if (typeof val === 'number') {
          const colMap = { health: 'health', qi_current: 'qi_current', qi_max: 'qi_max', essence: 'essence', qi: 'qi', spirit: 'spirit', lifespan: 'lifespan_remaining', health_regen: 'health' };
          const col = colMap[key] || key;
          if (['health', 'qi_current', 'qi_max', 'essence', 'spirit', 'lifespan_remaining', 'dao_heart', 'comprehension', 'divine_sense', 'fame', 'infamy', 'alchemy_skill', 'crafting_skill', 'formation_skill', 'talisman_skill', 'spirit_stones', 'qi'].includes(col)) {
            deltas[col] = (deltas[col] || 0) + val;
          }
        }
      }
    }
  }

  if (type === 'talisman') {
    for (const [key, val] of Object.entries(effect)) {
      if (typeof val === 'number') {
        const colMap = { health: 'health', qi_current: 'qi_current', qi_max: 'qi_max', essence: 'essence', qi: 'qi', spirit: 'spirit', defense: 'health', attack: 'charm' };
        const col = colMap[key] || key;
        if (['health', 'qi_current', 'qi_max', 'essence', 'spirit', 'lifespan_remaining', 'dao_heart', 'comprehension', 'divine_sense', 'fame', 'infamy', 'alchemy_skill', 'crafting_skill', 'formation_skill', 'talisman_skill', 'spirit_stones'].includes(col)) {
          deltas[col] = (deltas[col] || 0) + val;
        }
      }
    }
  }

  // 应用数值（带上限 clamp：生命≤100、道心/悟性≤100、qi_current≤qi_max、三元≤999）
  const USE_BOUNDS = {
    health: 100, dao_heart: 100, comprehension: 100,
    alchemy_skill: 100, crafting_skill: 100, formation_skill: 100, talisman_skill: 100,
    essence: 999, qi: 999, spirit: 999,
    qi_max: Infinity, lifespan_remaining: Infinity, divine_sense: Infinity,
    fame: Infinity, infamy: Infinity, spirit_stones: Infinity, qi_current: Infinity,
  };
  const applyUse = db.transaction(() => {
    const fresh = db.prepare('SELECT * FROM xianxia_characters WHERE id = ?').get(character.id);
    for (const [key, delta] of Object.entries(deltas)) {
      if (delta === 0) continue;
      const cap = key === 'qi_current' ? (fresh.qi_max > 0 ? fresh.qi_max : Infinity) : (USE_BOUNDS[key] ?? Infinity);
      const cur = typeof fresh[key] === 'number' ? fresh[key] : 0;
      const val = Math.min(cap, Math.max(0, cur + delta));
      db.prepare('UPDATE xianxia_characters SET ' + key + ' = ?, updated_at = datetime(\'now\') WHERE id = ?')
        .run(val, character.id);
    }
    if (isStatPill) {
      const usage = parseJson(character.pill_usage, {});
      usage[item.name] = (usage[item.name] || 0) + 1;
      db.prepare("UPDATE xianxia_characters SET pill_usage = ?, updated_at = datetime('now') WHERE id = ?")
        .run(JSON.stringify(usage), character.id);
    }
    if (newBuffs) {
      db.prepare("UPDATE xianxia_characters SET active_buffs = ?, updated_at = datetime('now') WHERE id = ?")
        .run(JSON.stringify(newBuffs), character.id);
    }
    if (item.quantity > 1) {
      db.prepare('UPDATE xianxia_items SET quantity = quantity - 1 WHERE id = ?').run(item.id);
    } else {
      db.prepare('DELETE FROM xianxia_items WHERE id = ?').run(item.id);
    }
  });
  applyUse();

  const updated = db.prepare('SELECT * FROM xianxia_characters WHERE id = ?').get(character.id);

  res.json({ deltas, character: updated });
}

// ==================== 地点探索与旅行 ====================

/** 所有已知地点的完整列表（用于判断玩家可发现的地点池） */
var ALL_LOCATIONS = [
  '太虚剑宗', '浑天宗', '丹霞谷', '天机阁', '万兽山', '金刚寺',
  '万象商会总会', '云来城', '铁骨门', '寒冰宗', '血河宗', '深渊裂隙',
  '万毒教', '蛊神宗', '青木宗', '雾中村',
  '碧水宫', '龙血殿', '黑水港', '海底古遗迹', '虚海',
  '搬山宗', '白骨观', '大周王朝', '北朔王朝', '西凉王朝'
];

/** 区域-地点映射，用于自动发现同区域地点 */
var REGION_LOCATIONS = {
  '中州': ['太虚剑宗', '浑天宗', '丹霞谷', '天机阁', '万兽山', '金刚寺', '万象商会总会', '云来城'],
  '北荒': ['铁骨门', '寒冰宗', '血河宗', '深渊裂隙'],
  '南疆': ['万毒教', '蛊神宗', '青木宗', '雾中村'],
  '东海': ['碧水宫', '龙血殿', '黑水港', '海底古遗迹', '虚海'],
  '西漠': ['搬山宗', '白骨观', '大周王朝', '北朔王朝', '西凉王朝'],
};

/** 为角色发现新地点（在已有区域附近自动发现邻近地点） */
function discoverLocations(characterId) {
  var char = db.prepare('SELECT discovered_locations, current_location FROM xianxia_characters WHERE id = ?').get(characterId);
  if (!char) return [];

  var discovered = JSON.parse(char.discovered_locations || '[]');
  var currentRegion = char.current_location ? char.current_location.split('-')[0] : null;
  var newlyDiscovered = [];

  // 1. 如果当前区域有未发现的地点，发现它们
  if (currentRegion && REGION_LOCATIONS[currentRegion]) {
    for (var loc of REGION_LOCATIONS[currentRegion]) {
      if (!discovered.includes(loc)) {
        discovered.push(loc);
        newlyDiscovered.push(loc);
      }
    }
  }

  // 2. 额外发现 1-2 个随机地点（模拟传闻）
  var allKnownLocations = [];
  for (var region of Object.keys(REGION_LOCATIONS)) {
    allKnownLocations = allKnownLocations.concat(REGION_LOCATIONS[region]);
  }
  var notDiscovered = allKnownLocations.filter(function(l) { return !discovered.includes(l); });
  if (notDiscovered.length > 0) {
    var extraCount = Math.min(Math.floor(Math.random() * 3), notDiscovered.length);
    for (var i = 0; i < extraCount; i++) {
      var randIdx = Math.floor(Math.random() * notDiscovered.length);
      discovered.push(notDiscovered[randIdx]);
      newlyDiscovered.push(notDiscovered[randIdx]);
      notDiscovered.splice(randIdx, 1);
    }
  }

  db.prepare("UPDATE xianxia_characters SET discovered_locations = ?, updated_at = datetime('now') WHERE id = ?")
    .run(JSON.stringify(discovered), characterId);

  return newlyDiscovered;
}

/** GET /api/xianxia/characters/:id/discover-locations — 手动刷新已发现地点 */
function refreshDiscoveredLocations(req, res) {
  // 先校验属主，再执行发现（发现会写库，不能越权改写他人角色）
  var owned = db.prepare('SELECT id FROM xianxia_characters WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!owned) return res.status(404).json({ error: '角色不存在' });
  var newlyDiscovered = discoverLocations(req.params.id);
  var char = db.prepare('SELECT discovered_locations FROM xianxia_characters WHERE id = ?').get(req.params.id);
  var discovered = char ? JSON.parse(char.discovered_locations || '[]') : [];
  res.json({ discovered_locations: discovered, newly_discovered: newlyDiscovered });
}

/** POST /api/xianxia/characters/:id/travel — 旅行到指定地点 */
async function travelTo(req, res) {
  var characterId = parseInt(req.params.id, 10);
  var character = db.prepare('SELECT id, user_id, status, current_location, game_age FROM xianxia_characters WHERE id = ? AND user_id = ?')
    .get(characterId, req.userId);
  if (!character) return res.status(404).json({ error: '角色不存在' });
  if (character.status !== 'active') return res.status(400).json({ error: '该角色已陨落或飞升' });

  var { location } = req.body;
  if (!location || typeof location !== 'string') return res.status(400).json({ error: '请指定目的地' });
  location = location.trim().slice(0, 100);

  // 检查目的地是否已发现
  var discovered = JSON.parse(db.prepare('SELECT discovered_locations FROM xianxia_characters WHERE id = ?').get(characterId).discovered_locations || '[]');
  if (!discovered.includes(location)) return res.status(400).json({ error: '你还不知道这个地方在哪里，无法前往' });

  // 频率限制
  if (!rateAllow('travel:' + req.userId, 5, 60 * 1000)) {
    return res.status(429).json({ error: '旅行过于频繁，请稍候再试' });
  }

  // 找到目的地所属区域
  var targetRegion = null;
  for (var region of Object.keys(REGION_LOCATIONS)) {
    if (REGION_LOCATIONS[region].includes(location)) { targetRegion = region; break; }
  }
  if (!targetRegion) targetRegion = '中州';

  var currentRegion = character.current_location ? character.current_location.split('-')[0] : '中州';
  var isSameRegion = targetRegion === currentRegion;

  try {
    // 使用 LLM 生成旅行叙事
    var narrative = await xianxiaLLM.generateTravelNarrative(
      character.current_location || '未知',
      targetRegion + '-' + location,
      isSameRegion
    );

    // 更新角色位置 + 推进时间
    var travelDays = isSameRegion ? (Math.random() * 3 + 1) : (Math.random() * 10 + 5);
    var newGameAge = (parseFloat(character.game_age) || 0) + travelDays / 365;

    db.prepare("UPDATE xianxia_characters SET current_location = ?, game_age = ?, updated_at = datetime('now') WHERE id = ?")
      .run(targetRegion + '-' + location, newGameAge, characterId);

    // 记录时间线
    db.prepare(
      'INSERT INTO xianxia_timeline (character_id, game_time, event_type, narrative) VALUES (?, ?, ?, ?)'
    ).run(characterId, xianxiaLLM.formatGameAge(newGameAge), 'travel', narrative);

    // 到达新地点后自动发现同区域地点
    var newlyDiscovered = discoverLocations(characterId);

    // 地点情境化选项（含修为满时的突破置顶）
    var freshChar = db.prepare('SELECT current_location, qi_current, qi_max FROM xianxia_characters WHERE id = ?').get(characterId);
    var locationOptions = withBreakthroughOption(freshChar, optionsForLocation(freshChar));

    res.json({
      narrative: narrative,
      current_location: targetRegion + '-' + location,
      game_age: newGameAge,
      timer: null,
      options: locationOptions,
      discovered_locations: JSON.parse(db.prepare('SELECT discovered_locations FROM xianxia_characters WHERE id = ?').get(characterId).discovered_locations || '[]'),
      newly_discovered: newlyDiscovered.length > 0 ? newlyDiscovered : undefined
    });
  } catch (err) {
    console.error('旅行失败:', err.message);
    res.status(500).json({ error: '旅行失败，请重试' });
  }
}

// ==================== 物品信息查询 ====================

/** GET /api/xianxia/items/:id/knowledge — 获取物品详情（含玩家已知效果和隐藏效果） */
function getItemKnowledge(req, res) {
  var itemId = parseInt(req.params.id, 10);
  var item = db.prepare('SELECT * FROM xianxia_items WHERE id = ?').get(itemId);
  if (!item) return res.status(404).json({ error: '物品不存在' });
  // 属主校验：种子模板（character_id 为 NULL）与他人背包物品一律 404
  if (item.character_id == null) return res.status(404).json({ error: '物品不存在' });
  var owner = db.prepare('SELECT id FROM xianxia_characters WHERE id = ? AND user_id = ?').get(item.character_id, req.userId);
  if (!owner) return res.status(404).json({ error: '物品不存在' });

  var effect = JSON.parse(item.effect || '{}');
  var rawEffect = JSON.parse(item.raw_effect || '{}');
  var rawSideEffect = JSON.parse(item.raw_side_effect || '{}');

  // 玩家已知效果：effect 字段（炼丹产物可见效果）
  var knownEffects = [];
  for (var [key, val] of Object.entries(effect)) {
    var labels = { health: '恢复生命', qi_current: '恢复灵力', qi_max: '提升气海', essence: '增强体魄', spirit: '增强神识', lifespan: '增加寿元', dao_heart: '提升道心', comprehension: '提升悟性', divine_sense: '提升神识' };
    knownEffects.push((labels[key] || key) + (typeof val === 'number' && val > 0 ? ' +' + val : ' ' + val));
  }
  if (knownEffects.length === 0) knownEffects.push('效果未知');

  // 隐藏效果：raw_side_effect（玩家需通过实验或他人告知才能发现）
  var hiddenEffects = [];
  for (var [key, val] of Object.entries(rawSideEffect)) {
    var labels = { health: '生命反噬', qi_current: '灵力紊乱', essence: '体魄衰退', spirit: '神识损伤', strange_corruption: '异化度增加' };
    hiddenEffects.push((labels[key] || key) + (typeof val === 'number' && val > 0 ? ' +' + val : ' ' + val));
  }
  // raw_effect（生服材料的效果）
  var rawKnown = [];
  for (var [key, val] of Object.entries(rawEffect)) {
    var labels = { health: '恢复生命', qi_current: '恢复灵力', essence: '增强体魄', spirit: '增强神识' };
    rawKnown.push((labels[key] || key) + (typeof val === 'number' && val > 0 ? ' +' + val : ' ' + val));
  }

  res.json({
    id: item.id,
    name: item.name,
    item_type: item.item_type,
    grade: item.grade || '凡品',
    known_effects: knownEffects,
    raw_effects: rawKnown.length > 0 ? rawKnown : undefined,
    hidden_effects: hiddenEffects.length > 0 ? hiddenEffects : undefined,
    quantity: item.quantity || 1,
    description: item.description || item.name
  });
}

// ==================== 物品堆叠工具 ====================

/** 合并角色背包中相同名称/类型/品级的物品（减少冗余行） */
function mergeDuplicateItems(characterId) {
  var duplicates = db.prepare(
    'SELECT name, item_type, grade, COUNT(*) as cnt, SUM(quantity) as total, MIN(id) as keep_id FROM xianxia_items WHERE character_id = ? GROUP BY name, item_type, grade HAVING cnt > 1'
  ).all(characterId);

  var merged = 0;
  for (var dup of duplicates) {
    // 删除重复行（保留 ID 最小的那行）
    var rowsToDelete = db.prepare(
      'SELECT id FROM xianxia_items WHERE character_id = ? AND name = ? AND item_type = ? AND grade = ? AND id != ?'
    ).all(characterId, dup.name, dup.item_type, dup.grade, dup.keep_id);

    for (var row of rowsToDelete) {
      db.prepare('DELETE FROM xianxia_items WHERE id = ?').run(row.id);
    }

    // 更新保留行的 quantity 为总和
    db.prepare('UPDATE xianxia_items SET quantity = ? WHERE id = ?').run(dup.total, dup.keep_id);
    merged += rowsToDelete.length;
  }
  return merged;
}


/** POST /api/xianxia/characters/:id/equip — 装备物品 */
function equipItem(req, res) {
  var character = db.prepare('SELECT id, user_id, status FROM xianxia_characters WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.userId);
  if (!character) return res.status(404).json({ error: '角色不存在' });

  var itemId = parseInt(req.body.itemId, 10);
  var item = db.prepare('SELECT * FROM xianxia_items WHERE id = ? AND character_id = ?')
    .get(itemId, character.id);
  if (!item) return res.status(404).json({ error: '物品不存在或不属于此角色' });
  // 可装备判定：类型为装备四件套，或物品自带槽位（兼容旧数据 treasure 带 slot 的情况）
  if (!['weapon', 'armor', 'accessory', 'artifact'].includes(item.item_type) && !item.slot) {
    return res.status(400).json({ error: '该类型物品无法装备' });
  }
  if (item.is_equipped) return res.status(400).json({ error: '该物品已装备' });

  // 同槽位先卸下现有装备
  var slot = item.slot || item.item_type;
  var existing = db.prepare('SELECT id FROM xianxia_items WHERE character_id = ? AND is_equipped = 1 AND (slot = ? OR (slot IS NULL AND item_type = ?))')
    .get(character.id, slot, item.item_type);
  if (existing) {
    db.prepare('UPDATE xianxia_items SET is_equipped = 0 WHERE id = ?').run(existing.id);
  }

  db.prepare('UPDATE xianxia_items SET is_equipped = 1 WHERE id = ?').run(item.id);
  res.json({ success: true, message: '装备成功' });
}

/** POST /api/xianxia/characters/:id/unequip — 卸下物品 */
function unequipItem(req, res) {
  var character = db.prepare('SELECT id FROM xianxia_characters WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.userId);
  if (!character) return res.status(404).json({ error: '角色不存在' });

  var itemId = parseInt(req.body.itemId, 10);
  var item = db.prepare('SELECT * FROM xianxia_items WHERE id = ? AND character_id = ?')
    .get(itemId, character.id);
  if (!item) return res.status(404).json({ error: '物品不存在或不属于此角色' });
  if (!item.is_equipped) return res.status(400).json({ error: '该物品未装备' });

  db.prepare('UPDATE xianxia_items SET is_equipped = 0 WHERE id = ?').run(item.id);
  res.json({ success: true, message: '已卸下' });
}

/** POST /api/xianxia/characters/:id/technique-main — 设置某功法为其类型的主修（每类型各一个） */
function setTechniqueMain(req, res) {
  const character = db.prepare('SELECT * FROM xianxia_characters WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.userId);
  if (!character) return res.status(404).json({ error: '角色不存在' });

  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: '请指定功法' });

  const { list, switched, reason, type } = techniques.switchMainTechnique(character, name);
  if (!switched) {
    return res.status(400).json({ error: reason === 'not_learned' ? '尚未习得该功法' : '该功法已是主修' });
  }

  const setsMap = { learned_techniques: JSON.stringify(list) };
  // 换主修心法：按新倍率重算气海上限，超出部分散逸
  if (type === 'heart') {
    const newQiMax = techniques.recalcQiMax(character, list);
    setsMap.qi_max = newQiMax;
    if ((character.qi_current || 0) > newQiMax) setsMap.qi_current = newQiMax;
  }
  const cols = Object.keys(setsMap).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE xianxia_characters SET ${cols}, updated_at = datetime('now') WHERE id = ?`)
    .run(...Object.values(setsMap), character.id);

  const updated = db.prepare('SELECT * FROM xianxia_characters WHERE id = ?').get(character.id);
  res.json({ success: true, type, learned_techniques: techniques.enrichForClient(updated) });
}

module.exports = {
  listCharacters, createCharacter, getCharacter, updateCharacter, deleteCharacter,
  getTimeline, getWorldState, listNpcs, getLegacy,
  processAction, settleTimer, birthNarrative, exportMD,
  useItem,
  travelTo,
  refreshDiscoveredLocations,
  getItemKnowledge,
  equipItem,
  unequipItem,
  setTechniqueMain,
  mergeDuplicateItems
};
