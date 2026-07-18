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

    CREATE INDEX IF NOT EXISTS idx_characters_user ON characters(user_id);
    CREATE INDEX IF NOT EXISTS idx_messages_character ON messages(character_id);
    CREATE INDEX IF NOT EXISTS idx_messages_time ON messages(character_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_condensed_character ON condensed_memories(character_id);
    CREATE INDEX IF NOT EXISTS idx_ground_truth ON ground_truth_log(character_id);
  `);
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
