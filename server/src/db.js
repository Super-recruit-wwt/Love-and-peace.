const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'love-and-peace.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function init() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      nickname TEXT NOT NULL,
      email_verified INTEGER DEFAULT 0,
      theme TEXT DEFAULT 'light',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS characters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      gender TEXT DEFAULT 'neutral',
      preset_id TEXT,
      personality_config TEXT,
      system_prompt TEXT NOT NULL,
      avatar_color TEXT DEFAULT '#6366f1',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Emotional state per character (persistent across sessions)
    CREATE TABLE IF NOT EXISTS emotional_state (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      character_id INTEGER UNIQUE NOT NULL,
      mood TEXT DEFAULT 'calm',
      energy REAL DEFAULT 70,
      stress REAL DEFAULT 20,
      confidence REAL DEFAULT 60,
      social_battery REAL DEFAULT 80,
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      character_id INTEGER NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
    );

    -- Perspective-biased memory summaries (compressed conversation history)
    CREATE TABLE IF NOT EXISTS condensed_memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      character_id INTEGER NOT NULL,
      summary TEXT NOT NULL,
      salience REAL DEFAULT 0.5,
      emotional_tone TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
    );

    -- Immutable ground-truth log for debugging memory drift
    CREATE TABLE IF NOT EXISTS ground_truth_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      character_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      exchange_index INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
    );

    -- 验证/重置 token：type = 'verify' | 'reset'；过期后由应用层清理
    CREATE TABLE IF NOT EXISTS verification_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('verify', 'reset')),
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- ============ 板块二「众声」多主体 AI 圆桌讨论 ============

    -- 讨论（圆桌）：user_id 为 NULL 且 is_sample=1 表示全站共享的示例回放
    CREATE TABLE IF NOT EXISTS discussions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      topic TEXT NOT NULL,
      knowledge TEXT,
      knowledge_files TEXT,
      next_turn INTEGER DEFAULT 0,
      is_sample INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- 讨论成员：建群时从人格库快照，讨论期间不随库变动
    CREATE TABLE IF NOT EXISTS discussion_participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      discussion_id INTEGER NOT NULL,
      persona_id TEXT,
      name TEXT NOT NULL,
      persona TEXT NOT NULL,
      avatar_color TEXT,
      avatar_char TEXT,
      turn_order INTEGER NOT NULL,
      FOREIGN KEY (discussion_id) REFERENCES discussions(id) ON DELETE CASCADE
    );

    -- 讨论消息：system(议题/提示) / human(用户插话) / agent(AI 发言)
    CREATE TABLE IF NOT EXISTS discussion_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      discussion_id INTEGER NOT NULL,
      speaker_type TEXT NOT NULL CHECK(speaker_type IN ('system', 'human', 'agent')),
      participant_id INTEGER,
      speaker_name TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (discussion_id) REFERENCES discussions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_characters_user ON characters(user_id);
    CREATE INDEX IF NOT EXISTS idx_messages_character ON messages(character_id);
    CREATE INDEX IF NOT EXISTS idx_messages_time ON messages(character_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_condensed_character ON condensed_memories(character_id);
    CREATE INDEX IF NOT EXISTS idx_ground_truth ON ground_truth_log(character_id);
    CREATE INDEX IF NOT EXISTS idx_discussions_user ON discussions(user_id);
    CREATE INDEX IF NOT EXISTS idx_disc_participants ON discussion_participants(discussion_id, turn_order);
    CREATE INDEX IF NOT EXISTS idx_disc_messages ON discussion_messages(discussion_id, id);

    -- ============ 板块三「修仙模拟人生」============

    -- 角色：一个用户可创建多个修仙角色
    CREATE TABLE IF NOT EXISTS xianxia_characters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      gender TEXT DEFAULT 'neutral',
      status TEXT DEFAULT 'active' CHECK(status IN ('active','dead','ascended')),
      -- 灵根
      spirit_roots TEXT NOT NULL DEFAULT '{}',
      special_body TEXT,
      -- 出生
      birth_region TEXT NOT NULL,
      birth_background TEXT NOT NULL,
      birth_narrative TEXT,
      -- 修炼路线进度（JSON：{ "xiandao": "金丹初期", "physical": null, "strange": null, "artisan": null, "wanderer": null }）
      cultivation_paths TEXT NOT NULL DEFAULT '{}',
      -- 属性
      lifespan_remaining INTEGER NOT NULL DEFAULT 80,
      health REAL NOT NULL DEFAULT 100,
      qi_current REAL NOT NULL DEFAULT 0,
      qi_max REAL NOT NULL DEFAULT 0,
      divine_sense REAL NOT NULL DEFAULT 0,
      dao_heart REAL NOT NULL DEFAULT 50,
      comprehension REAL NOT NULL DEFAULT 50,
      fortune REAL NOT NULL DEFAULT 50,
      spirit_stones INTEGER NOT NULL DEFAULT 0,
      fame INTEGER NOT NULL DEFAULT 0,
      infamy INTEGER NOT NULL DEFAULT 0,
      charm REAL NOT NULL DEFAULT 50,
      pressure REAL NOT NULL DEFAULT 50,
      alchemy_skill REAL NOT NULL DEFAULT 0,
      crafting_skill REAL NOT NULL DEFAULT 0,
      formation_skill REAL NOT NULL DEFAULT 0,
      talisman_skill REAL NOT NULL DEFAULT 0,
      body_status TEXT DEFAULT NULL,
      current_location TEXT NOT NULL DEFAULT '中州-无名小镇',
      game_age INTEGER NOT NULL DEFAULT 0,
      -- 倒计时锁
      timer_type TEXT,
      timer_end_at TEXT,
      timer_narrative TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- 时间线：角色人生事件日志
    CREATE TABLE IF NOT EXISTS xianxia_timeline (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      character_id INTEGER NOT NULL,
      game_time TEXT NOT NULL,
      event_type TEXT NOT NULL,
      narrative TEXT NOT NULL,
      options TEXT,
      rewards TEXT,
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (character_id) REFERENCES xianxia_characters(id) ON DELETE CASCADE
    );

    -- 固定 NPC 主数据（全局共享）
    CREATE TABLE IF NOT EXISTS xianxia_npcs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      identity TEXT NOT NULL,
      faction TEXT,
      location TEXT,
      personality_type TEXT NOT NULL,
      strength_level TEXT,
      personality_traits TEXT NOT NULL DEFAULT '{}',
      is_fixed INTEGER DEFAULT 0,
      is_alive INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- 角色 ↔ NPC 关系
    CREATE TABLE IF NOT EXISTS xianxia_relationships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      character_id INTEGER NOT NULL,
      npc_id INTEGER NOT NULL,
      affection REAL NOT NULL DEFAULT 0,
      relation_types TEXT NOT NULL DEFAULT '[]',
      notes TEXT,
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (character_id) REFERENCES xianxia_characters(id) ON DELETE CASCADE,
      FOREIGN KEY (npc_id) REFERENCES xianxia_npcs(id) ON DELETE CASCADE,
      UNIQUE(character_id, npc_id)
    );

    -- 世界状态（全局单行，JSON 键值）
    CREATE TABLE IF NOT EXISTS xianxia_world_state (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- 传世记录
    CREATE TABLE IF NOT EXISTS xianxia_legacy (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      character_id INTEGER NOT NULL,
      death_cause TEXT NOT NULL,
      death_narrative TEXT,
      final_cultivation TEXT,
      final_age INTEGER,
      legacy_type TEXT,
      legacy_data TEXT NOT NULL DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (character_id) REFERENCES xianxia_characters(id) ON DELETE CASCADE
    );

    -- 通关记录
    CREATE TABLE IF NOT EXISTS xianxia_completed_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      character_id INTEGER NOT NULL,
      character_name TEXT NOT NULL,
      cultivation_path TEXT NOT NULL,
      final_cultivation TEXT NOT NULL,
      game_duration INTEGER NOT NULL,
      key_achievements TEXT NOT NULL DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (character_id) REFERENCES xianxia_characters(id) ON DELETE CASCADE
    );

    -- 角色物品/法宝
    CREATE TABLE IF NOT EXISTS xianxia_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      character_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      item_type TEXT NOT NULL CHECK(item_type IN ('treasure','pill','technique','material','spirit_stone','misc')),
      grade TEXT NOT NULL DEFAULT '凡品',
      description TEXT,
      quantity INTEGER DEFAULT 1,
      is_equipped INTEGER DEFAULT 0,
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (character_id) REFERENCES xianxia_characters(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_xianxia_chars_user ON xianxia_characters(user_id);
    CREATE INDEX IF NOT EXISTS idx_xianxia_timeline_char ON xianxia_timeline(character_id, id);
    CREATE INDEX IF NOT EXISTS idx_xianxia_rel_char ON xianxia_relationships(character_id);
    CREATE INDEX IF NOT EXISTS idx_xianxia_items_char ON xianxia_items(character_id);
    CREATE INDEX IF NOT EXISTS idx_xianxia_legacy_char ON xianxia_legacy(character_id);
  `);

  // 兼容旧库：users 增加 email_verified 列（存量用户默认 1 = 已验证）
  safeAddColumn('users', 'email_verified', 'INTEGER DEFAULT 1');
  // 兼容旧库：xianxia_timeline 增加 options 列（AI 建议选项 JSON 数组）
  safeAddColumn('xianxia_timeline', 'options', 'TEXT');
  // 兼容旧库：xianxia_timeline 增加 rewards 列（剧本收益摘要 JSON 数组）
  safeAddColumn('xianxia_timeline', 'rewards', 'TEXT');
  module.exports.safeAddColumn = safeAddColumn;
}

function safeAddColumn(table, column, definition) {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  } catch (err) {
    // 列已存在 — 忽略
    if (!err.message.includes('duplicate')) throw err;
  }
}

// ==================== Emotional State Helpers ====================

function defaultEmotionalState() {
  return { mood: 'calm', energy: 70, stress: 20, confidence: 60, socialBattery: 80 };
}

function getEmotionalState(characterId) {
  const row = db.prepare('SELECT * FROM emotional_state WHERE character_id = ?').get(characterId);
  if (!row) return defaultEmotionalState();
  return {
    mood: row.mood,
    energy: row.energy,
    stress: row.stress,
    confidence: row.confidence,
    socialBattery: row.social_battery,
  };
}

function upsertEmotionalState(characterId, state) {
  const existing = db.prepare('SELECT id FROM emotional_state WHERE character_id = ?').get(characterId);
  if (existing) {
    db.prepare(`UPDATE emotional_state SET mood=?, energy=?, stress=?, confidence=?, social_battery=?, updated_at=datetime('now')
      WHERE character_id=?`)
      .run(state.mood, state.energy, state.stress, state.confidence, state.socialBattery, characterId);
  } else {
    db.prepare(`INSERT INTO emotional_state (character_id, mood, energy, stress, confidence, social_battery)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .run(characterId, state.mood, state.energy, state.stress, state.confidence, state.socialBattery);
  }
}

// ==================== Condensed Memory Helpers ====================

function addCondensedMemory(characterId, summary, salience, emotionalTone) {
  return db.prepare(`INSERT INTO condensed_memories (character_id, summary, salience, emotional_tone)
    VALUES (?, ?, ?, ?)`).run(characterId, summary, salience || 0.5, emotionalTone || null);
}

function getCondensedMemories(characterId, limit = 5) {
  return db.prepare(`SELECT * FROM condensed_memories WHERE character_id = ? ORDER BY salience DESC, created_at DESC LIMIT ?`)
    .all(characterId, limit);
}

function decayCondensedMemories(characterId) {
  // Reduce salience by 0.02 each time, with anchors for high-importance memories
  db.prepare(`UPDATE condensed_memories SET salience = CASE
    WHEN salience >= 0.9 THEN MAX(0.5, salience - 0.01)  -- Core memories decay slowly
    WHEN salience >= 0.5 THEN MAX(0.2, salience - 0.02)  -- Emotional memories have some protection
    ELSE MAX(0, salience - 0.02)
    END WHERE character_id = ?`).run(characterId);
}

// ==================== Ground Truth Log ====================

function logGroundTruth(characterId, role, content, exchangeIndex) {
  db.prepare(`INSERT INTO ground_truth_log (character_id, role, content, exchange_index)
    VALUES (?, ?, ?, ?)`).run(characterId, role, content, exchangeIndex);
}

module.exports = {
  db, init,
  getEmotionalState, upsertEmotionalState, defaultEmotionalState,
  addCondensedMemory, getCondensedMemories, decayCondensedMemories,
  logGroundTruth,
};
