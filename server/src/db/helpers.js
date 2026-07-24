// 数据库辅助函数：EmotionalState / CondensedMemories / GroundTruthLog
// 从 db.js 拆分出来，保持对外接口不变

const { db } = require('./index');

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
  defaultEmotionalState,
  getEmotionalState,
  upsertEmotionalState,
  addCondensedMemory,
  getCondensedMemories,
  decayCondensedMemories,
  logGroundTruth,
};
