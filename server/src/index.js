require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { db, init: initDb, getEmotionalState, upsertEmotionalState, defaultEmotionalState,
  addCondensedMemory, getCondensedMemories, decayCondensedMemories,
  logGroundTruth } = require('./db');
const { signToken, authMiddleware } = require('./auth');
const { buildSystemPrompt, chat, proactiveChat,
  analyzeStimulus, applyStimulus,
  generateInternalMonologue, compressMemory, discussionReply } = require('./llm');

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// Initialize database
initDb();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ==================== Auth Routes ====================

app.post('/api/auth/register', (req, res) => {
  try {
    const { email, password, nickname } = req.body;

    if (!email || !password || !nickname) {
      return res.status(400).json({ error: '请填写邮箱、密码和昵称' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: '密码至少需要 6 位' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(400).json({ error: '该邮箱已被注册' });
    }

    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare(
      'INSERT INTO users (email, password_hash, nickname) VALUES (?, ?, ?)'
    ).run(email, hash, nickname);

    const token = signToken(result.lastInsertRowid);

    res.json({
      token,
      user: { id: result.lastInsertRowid, email, nickname, theme: 'light' },
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: '注册失败，请稍后重试' });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: '请填写邮箱和密码' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      return res.status(400).json({ error: '邮箱或密码错误' });
    }

    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) {
      return res.status(400).json({ error: '邮箱或密码错误' });
    }

    const token = signToken(user.id);

    res.json({
      token,
      user: { id: user.id, email: user.email, nickname: user.nickname, theme: user.theme },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: '登录失败，请稍后重试' });
  }
});

// ==================== Character Routes ====================

// Get preset characters (public)
app.get('/api/characters/presets', (_req, res) => {
  try {
    const presets = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'config', 'presets.json'), 'utf-8')
    );
    res.json(presets);
  } catch (err) {
    res.status(500).json({ error: '读取预设角色失败' });
  }
});

// Get user's characters
app.get('/api/characters', authMiddleware, (req, res) => {
  try {
    const characters = db.prepare(
      'SELECT id, name, gender, preset_id, personality_config, avatar_color, created_at FROM characters WHERE user_id = ? ORDER BY created_at DESC'
    ).all(req.userId);

    res.json(characters.map(c => ({
      ...c,
      personality_config: c.personality_config ? JSON.parse(c.personality_config) : null,
    })));
  } catch (err) {
    console.error('Get characters error:', err);
    res.status(500).json({ error: '获取角色列表失败' });
  }
});

// Create character (custom or from preset)
app.post('/api/characters', authMiddleware, (req, res) => {
  try {
    const { name, gender, preset_id, archetypes, dimensions, avatar_color } = req.body;

    if (!name) {
      return res.status(400).json({ error: '请输入角色名称' });
    }

    const personalityConfig = { name, gender: gender || 'neutral', archetypes, dimensions };
    const systemPrompt = buildSystemPrompt(personalityConfig);

    const result = db.prepare(
      `INSERT INTO characters (user_id, name, gender, preset_id, personality_config, system_prompt, avatar_color)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      req.userId,
      name,
      gender || 'neutral',
      preset_id || null,
      JSON.stringify(personalityConfig),
      systemPrompt,
      avatar_color || '#6366f1'
    );

    res.json({
      id: result.lastInsertRowid,
      name,
      gender: gender || 'neutral',
      preset_id: preset_id || null,
      personality_config: personalityConfig,
      avatar_color: avatar_color || '#6366f1',
    });
  } catch (err) {
    console.error('Create character error:', err);
    res.status(500).json({ error: '创建角色失败' });
  }
});

// Update character
app.put('/api/characters/:id', authMiddleware, (req, res) => {
  try {
    const char = db.prepare(
      'SELECT * FROM characters WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.userId);

    if (!char) {
      return res.status(404).json({ error: '角色不存在' });
    }

    const { name, gender, archetypes, dimensions, avatar_color } = req.body;
    const personalityConfig = {
      name: name || char.name,
      gender: gender || char.gender,
      archetypes: archetypes || JSON.parse(char.personality_config || '{}').archetypes,
      dimensions: dimensions || JSON.parse(char.personality_config || '{}').dimensions,
    };
    const systemPrompt = buildSystemPrompt(personalityConfig);

    db.prepare(
      `UPDATE characters SET name = ?, gender = ?, personality_config = ?, system_prompt = ?, avatar_color = ?
       WHERE id = ? AND user_id = ?`
    ).run(
      name || char.name,
      gender || char.gender,
      JSON.stringify(personalityConfig),
      systemPrompt,
      avatar_color || char.avatar_color,
      req.params.id,
      req.userId
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Update character error:', err);
    res.status(500).json({ error: '更新角色失败' });
  }
});

// Delete character
app.delete('/api/characters/:id', authMiddleware, (req, res) => {
  try {
    const char = db.prepare(
      'SELECT * FROM characters WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.userId);

    if (!char) {
      return res.status(404).json({ error: '角色不存在' });
    }

    db.prepare('DELETE FROM characters WHERE id = ? AND user_id = ?')
      .run(req.params.id, req.userId);

    res.json({ success: true });
  } catch (err) {
    console.error('Delete character error:', err);
    res.status(500).json({ error: '删除角色失败' });
  }
});

// ==================== Chat Routes ====================

// Get messages for a character
app.get('/api/characters/:id/messages', authMiddleware, (req, res) => {
  try {
    const char = db.prepare(
      'SELECT * FROM characters WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.userId);

    if (!char) {
      return res.status(404).json({ error: '角色不存在' });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    const messages = db.prepare(
      'SELECT id, role, content, created_at FROM messages WHERE character_id = ? ORDER BY created_at ASC LIMIT ? OFFSET ?'
    ).all(req.params.id, limit, offset);

    const total = db.prepare(
      'SELECT COUNT(*) as count FROM messages WHERE character_id = ?'
    ).get(req.params.id).count;

    res.json({ messages, total, page, hasMore: offset + limit < total });
  } catch (err) {
    console.error('Get messages error:', err);
    res.status(500).json({ error: '获取对话失败' });
  }
});

// Send message and get AI reply
app.post('/api/characters/:id/chat', authMiddleware, async (req, res) => {
  try {
    const char = db.prepare(
      'SELECT * FROM characters WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.userId);

    if (!char) {
      return res.status(404).json({ error: '角色不存在' });
    }

    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: '消息不能为空' });
    }

    // Save user message
    db.prepare('INSERT INTO messages (character_id, role, content) VALUES (?, ?, ?)')
      .run(char.id, 'user', message.trim());

    // Log ground truth
    const msgCount = db.prepare('SELECT COUNT(*) as count FROM messages WHERE character_id = ?').get(char.id).count;
    logGroundTruth(char.id, 'user', message.trim(), msgCount);

    // Get recent conversation history (INCLUDE the user's just-saved message)
    const recentMessages = db.prepare(
      'SELECT role, content FROM messages WHERE character_id = ? ORDER BY created_at DESC LIMIT 30'
    ).all(char.id).reverse();

    // Emotional state — load, analyze stimulus, update
    let emotionalState = getEmotionalState(char.id);
    const stimulus = analyzeStimulus(message.trim());
    emotionalState = applyStimulus(emotionalState, stimulus);
    upsertEmotionalState(char.id, emotionalState);

    // Get condensed memories for context
    const condensed = getCondensedMemories(char.id, 3);
    const condensedContext = condensed.length > 0
      ? condensed.map(m => m.summary).join('\n')
      : '';

    // Call LLM with FULL history (including user's latest message)
    let reply;
    try {
      const history = recentMessages.map(m => ({
        role: m.role,
        content: m.content,
      }));

      // Build context-enhanced system prompt with condensed memories
      let contextPrompt = char.system_prompt;
      if (condensedContext) {
        contextPrompt += `\n\n## 过往记忆\n以下是此前对话中值得记住的事情（以你的视角）：\n${condensedContext}`;
      }

      reply = await chat(contextPrompt, history, emotionalState);
    } catch (llmErr) {
      console.error('LLM error:', llmErr);
      reply = '抱歉，我现在有点累，稍等一下再来找我聊好吗？';
    }

    // Save AI reply (split by double newline into multiple messages if applicable)
    const paragraphs = reply.split(/\n\s*\n/).filter(p => p.trim());
    const savedReplies = [];

    for (const para of paragraphs) {
      const result = db.prepare('INSERT INTO messages (character_id, role, content) VALUES (?, ?, ?)')
        .run(char.id, 'assistant', para.trim());
      savedReplies.push({
        id: result.lastInsertRowid,
        role: 'assistant',
        content: para.trim(),
        created_at: new Date().toISOString(),
      });
      // Log each paragraph to ground truth
      logGroundTruth(char.id, 'assistant', para.trim(), msgCount + 1);
    }

    // Only return the first paragraph immediately for responsive UX,
    // but signal to frontend that there are more
    const firstReply = savedReplies[0];
    const additionalReplies = savedReplies.slice(1);

    // Memory compression check — every 10 messages, compress and decay
    if ((msgCount + 1) % 10 === 0) {
      decayCondensedMemories(char.id);
      const olderMessages = db.prepare(
        'SELECT role, content FROM messages WHERE character_id = ? ORDER BY created_at ASC LIMIT ?'
      ).all(char.id, msgCount - 10);
      if (olderMessages.length > 0) {
        compressMemory(char.system_prompt, olderMessages).then(summary => {
          if (summary) addCondensedMemory(char.id, summary, 0.6, emotionalState.mood);
        }).catch(() => {});
      }
    }

    res.json({
      id: firstReply.id,
      role: 'assistant',
      content: firstReply.content,
      created_at: firstReply.created_at,
      more: additionalReplies.length > 0 ? additionalReplies : undefined,
    });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: '发送消息失败' });
  }
});

// Clear messages
app.delete('/api/characters/:id/messages', authMiddleware, (req, res) => {
  try {
    const char = db.prepare(
      'SELECT * FROM characters WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.userId);

    if (!char) {
      return res.status(404).json({ error: '角色不存在' });
    }

    db.prepare('DELETE FROM messages WHERE character_id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Clear messages error:', err);
    res.status(500).json({ error: '清空对话失败' });
  }
});

// Proactive message — character initiates conversation
app.post('/api/characters/:id/proactive', authMiddleware, async (req, res) => {
  try {
    const char = db.prepare(
      'SELECT * FROM characters WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.userId);

    if (!char) {
      return res.status(404).json({ error: '角色不存在' });
    }

    // Get recent messages
    const recentMessages = db.prepare(
      'SELECT role, content, created_at FROM messages WHERE character_id = ? ORDER BY created_at DESC LIMIT 20'
    ).all(char.id).reverse();

    // Load emotional state
    const emotionalState = getEmotionalState(char.id);

    const history = recentMessages.map(m => ({
      role: m.role,
      content: m.content,
    }));

    let reply;
    try {
      reply = await proactiveChat(char.system_prompt, history, emotionalState);
    } catch (llmErr) {
      console.error('Proactive LLM error:', llmErr);
      return res.json(null);
    }

    // Save proactive message
    const result = db.prepare('INSERT INTO messages (character_id, role, content) VALUES (?, ?, ?)')
      .run(char.id, 'assistant', reply);

    res.json({
      id: result.lastInsertRowid,
      role: 'assistant',
      content: reply,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Proactive chat error:', err);
    res.json(null);
  }
});

// ==================== User Routes ====================

app.get('/api/user/profile', authMiddleware, (req, res) => {
  try {
    const user = db.prepare(
      'SELECT id, email, nickname, theme FROM users WHERE id = ?'
    ).get(req.userId);

    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: '获取用户信息失败' });
  }
});

app.put('/api/user/profile', authMiddleware, (req, res) => {
  try {
    const { nickname, theme } = req.body;
    const updates = [];
    const values = [];

    if (nickname) {
      updates.push('nickname = ?');
      values.push(nickname);
    }
    if (theme) {
      updates.push('theme = ?');
      values.push(theme);
    }

    if (updates.length > 0) {
      values.push(req.userId);
      db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '更新失败' });
  }
});

app.put('/api/user/password', authMiddleware, (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
    if (!bcrypt.compareSync(oldPassword, user.password_hash)) {
      return res.status(400).json({ error: '原密码错误' });
    }

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: '新密码至少需要 6 位' });
    }

    const hash = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.userId);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '修改密码失败' });
  }
});

// ==================== 众声 · AI 圆桌讨论 Routes ====================

const PERSONAS_PATH = path.join(__dirname, '..', 'config', 'personas.json');
const SAMPLES_DIR = path.join(__dirname, '..', 'config', 'samples');
const KNOWLEDGE_MAX_CHARS = 20000;
const TRANSCRIPT_WINDOW = 40;

function loadPersonas() {
  return JSON.parse(fs.readFileSync(PERSONAS_PATH, 'utf-8'));
}

const discussionParticipantsStmt = () => db.prepare(
  'SELECT id, persona_id, name, persona, avatar_color, avatar_char, turn_order FROM discussion_participants WHERE discussion_id = ? ORDER BY turn_order'
);

/** 取讨论并校验可见性：自己的可读写，示例只读，其余 404 */
function getDiscussionFor(req, id) {
  const d = db.prepare('SELECT * FROM discussions WHERE id = ?').get(id);
  if (!d) return { error: 404 };
  if (d.is_sample) return { discussion: d, readonly: true };
  if (d.user_id !== req.userId) return { error: 404 };
  return { discussion: d, readonly: false };
}

/** 生成供 AI 阅读的对话记录（同 Python 版 get_transcript，超窗时保留议题行） */
function buildTranscript(discussionId) {
  const all = db.prepare(
    'SELECT speaker_name, content FROM discussion_messages WHERE discussion_id = ? ORDER BY id'
  ).all(discussionId);
  let window = all;
  if (all.length > TRANSCRIPT_WINDOW) {
    window = [all[0], ...all.slice(all.length - (TRANSCRIPT_WINDOW - 1))];
  }
  return window.map(m => `${m.speaker_name}: ${m.content}`).join('\n');
}

// 人格库（公开，同 presets）
app.get('/api/voices/personas', (_req, res) => {
  try {
    res.json(loadPersonas());
  } catch (err) {
    console.error('Load personas error:', err);
    res.status(500).json({ error: '读取人格库失败' });
  }
});

// 讨论列表：我的 + 示例回放
app.get('/api/voices', authMiddleware, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT d.id, d.topic, d.is_sample, d.knowledge_files, d.created_at, d.updated_at,
        (SELECT COUNT(*) FROM discussion_messages m WHERE m.discussion_id = d.id) AS message_count
      FROM discussions d
      WHERE d.user_id = ? OR d.is_sample = 1
      ORDER BY d.is_sample ASC, d.updated_at DESC
    `).all(req.userId);

    const pStmt = discussionParticipantsStmt();
    res.json(rows.map(d => ({
      ...d,
      knowledge_files: d.knowledge_files ? JSON.parse(d.knowledge_files) : [],
      participants: pStmt.all(d.id),
    })));
  } catch (err) {
    console.error('List discussions error:', err);
    res.status(500).json({ error: '获取讨论列表失败' });
  }
});

// 发起讨论
app.post('/api/voices', authMiddleware, (req, res) => {
  try {
    const { topic, persona_ids, knowledge, knowledge_files } = req.body;

    if (!topic || !topic.trim()) {
      return res.status(400).json({ error: '请输入讨论议题' });
    }
    if (!Array.isArray(persona_ids) || persona_ids.length < 2 || persona_ids.length > 5) {
      return res.status(400).json({ error: '请选择 2 至 5 位讨论成员' });
    }

    const personas = loadPersonas();
    const chosen = persona_ids.map(pid => personas.find(p => p.id === pid));
    if (chosen.some(p => !p)) {
      return res.status(400).json({ error: '存在无效的人格选择' });
    }

    let knowledgeText = (knowledge || '').trim();
    if (knowledgeText.length > KNOWLEDGE_MAX_CHARS) {
      return res.status(400).json({ error: `背景资料过长（上限 ${KNOWLEDGE_MAX_CHARS} 字）` });
    }

    const create = db.transaction(() => {
      const result = db.prepare(
        'INSERT INTO discussions (user_id, topic, knowledge, knowledge_files) VALUES (?, ?, ?, ?)'
      ).run(
        req.userId,
        topic.trim(),
        knowledgeText || null,
        knowledge_files && knowledge_files.length ? JSON.stringify(knowledge_files) : null
      );
      const discussionId = result.lastInsertRowid;

      const insertP = db.prepare(
        `INSERT INTO discussion_participants (discussion_id, persona_id, name, persona, avatar_color, avatar_char, turn_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );
      chosen.forEach((p, i) => {
        insertP.run(discussionId, p.id, p.name, p.persona, p.avatar_color, p.avatar_char, i);
      });

      db.prepare(
        'INSERT INTO discussion_messages (discussion_id, speaker_type, speaker_name, content) VALUES (?, ?, ?, ?)'
      ).run(discussionId, 'system', 'System', `讨论开始，今日议题：${topic.trim()}`);

      return discussionId;
    });

    const discussionId = create();
    res.json({ id: discussionId });
  } catch (err) {
    console.error('Create discussion error:', err);
    res.status(500).json({ error: '发起讨论失败' });
  }
});

// 讨论详情（含成员与全部消息）
app.get('/api/voices/:id', authMiddleware, (req, res) => {
  try {
    const { discussion: d, readonly, error } = getDiscussionFor(req, req.params.id);
    if (error) return res.status(404).json({ error: '讨论不存在' });

    const participants = discussionParticipantsStmt().all(d.id);
    const messages = db.prepare(
      'SELECT id, speaker_type, participant_id, speaker_name, content, created_at FROM discussion_messages WHERE discussion_id = ? ORDER BY id'
    ).all(d.id);

    res.json({
      id: d.id,
      topic: d.topic,
      is_sample: !!d.is_sample,
      readonly,
      has_knowledge: !!d.knowledge,
      knowledge_files: d.knowledge_files ? JSON.parse(d.knowledge_files) : [],
      next_turn: d.next_turn,
      created_at: d.created_at,
      participants,
      messages,
    });
  } catch (err) {
    console.error('Get discussion error:', err);
    res.status(500).json({ error: '获取讨论失败' });
  }
});

// 推进发言：默认轮到谁谁说；带 participant_id 则点名发言（不占轮次，同 Python 版）
const advancingDiscussions = new Set();

app.post('/api/voices/:id/advance', authMiddleware, async (req, res) => {
  const discussionId = String(req.params.id);
  try {
    const { discussion: d, readonly, error } = getDiscussionFor(req, discussionId);
    if (error) return res.status(404).json({ error: '讨论不存在' });
    if (readonly) return res.status(403).json({ error: '示例回放为只读' });

    if (advancingDiscussions.has(discussionId)) {
      return res.status(409).json({ error: '正在生成发言，请稍候' });
    }

    const participants = discussionParticipantsStmt().all(d.id);
    if (participants.length === 0) {
      return res.status(400).json({ error: '该讨论没有成员' });
    }

    const { participant_id } = req.body || {};
    let speaker;
    let advanceTurn;
    if (participant_id) {
      speaker = participants.find(p => p.id === participant_id);
      if (!speaker) return res.status(400).json({ error: '成员不存在' });
      advanceTurn = false; // 点名发言不改变轮次
    } else {
      speaker = participants[d.next_turn % participants.length];
      advanceTurn = true;
    }

    advancingDiscussions.add(discussionId);
    let reply;
    try {
      const transcript = buildTranscript(d.id);
      reply = await discussionReply(speaker, d.topic, transcript, d.knowledge);
    } catch (llmErr) {
      console.error('Discussion LLM error:', llmErr);
      return res.status(502).json({ error: '发言生成失败，请稍后重试' });
    } finally {
      advancingDiscussions.delete(discussionId);
    }

    const result = db.prepare(
      'INSERT INTO discussion_messages (discussion_id, speaker_type, participant_id, speaker_name, content) VALUES (?, ?, ?, ?, ?)'
    ).run(d.id, 'agent', speaker.id, speaker.name, reply);

    const newTurn = advanceTurn
      ? (d.next_turn + 1) % participants.length
      : d.next_turn;
    db.prepare("UPDATE discussions SET next_turn = ?, updated_at = datetime('now') WHERE id = ?")
      .run(newTurn, d.id);

    res.json({
      message: {
        id: result.lastInsertRowid,
        speaker_type: 'agent',
        participant_id: speaker.id,
        speaker_name: speaker.name,
        content: reply,
        created_at: new Date().toISOString(),
      },
      next_turn: newTurn,
      next_participant: participants[newTurn % participants.length],
    });
  } catch (err) {
    advancingDiscussions.delete(discussionId);
    console.error('Advance discussion error:', err);
    res.status(500).json({ error: '推进讨论失败' });
  }
});

// 用户插话
app.post('/api/voices/:id/interject', authMiddleware, (req, res) => {
  try {
    const { discussion: d, readonly, error } = getDiscussionFor(req, req.params.id);
    if (error) return res.status(404).json({ error: '讨论不存在' });
    if (readonly) return res.status(403).json({ error: '示例回放为只读' });

    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: '插话内容不能为空' });
    }

    const user = db.prepare('SELECT nickname FROM users WHERE id = ?').get(req.userId);
    const speakerName = user?.nickname || '人类(Admin)';

    const result = db.prepare(
      'INSERT INTO discussion_messages (discussion_id, speaker_type, speaker_name, content) VALUES (?, ?, ?, ?)'
    ).run(d.id, 'human', speakerName, content.trim());
    db.prepare("UPDATE discussions SET updated_at = datetime('now') WHERE id = ?").run(d.id);

    res.json({
      id: result.lastInsertRowid,
      speaker_type: 'human',
      participant_id: null,
      speaker_name: speakerName,
      content: content.trim(),
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Interject error:', err);
    res.status(500).json({ error: '插话失败' });
  }
});

// 删除讨论（示例不可删：user_id 条件天然排除）
app.delete('/api/voices/:id', authMiddleware, (req, res) => {
  try {
    const d = db.prepare('SELECT id FROM discussions WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.userId);
    if (!d) return res.status(404).json({ error: '讨论不存在' });

    db.prepare('DELETE FROM discussions WHERE id = ?').run(d.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete discussion error:', err);
    res.status(500).json({ error: '删除讨论失败' });
  }
});

// ==================== 众声 · 示例回放导入（首次启动执行一次） ====================

function seedSampleDiscussions() {
  try {
    const existing = db.prepare('SELECT COUNT(*) AS c FROM discussions WHERE is_sample = 1').get().c;
    if (existing > 0) return;
    if (!fs.existsSync(SAMPLES_DIR)) return;

    const personas = loadPersonas();
    const files = fs.readdirSync(SAMPLES_DIR).filter(f => f.endsWith('.json')).sort();

    const importFile = db.transaction((msgs) => {
      const first = msgs[0];
      const last = msgs[msgs.length - 1];
      const topic = first.text.replace(/^讨论开始，今日议题：/, '');

      const dResult = db.prepare(
        'INSERT INTO discussions (user_id, topic, is_sample, created_at, updated_at) VALUES (NULL, ?, 1, ?, ?)'
      ).run(topic, first.timestamp, last.timestamp);
      const discussionId = dResult.lastInsertRowid;

      // 按出场顺序建成员快照（排除 System 与人类）
      const participantIds = {};
      let order = 0;
      const insertP = db.prepare(
        `INSERT INTO discussion_participants (discussion_id, persona_id, name, persona, avatar_color, avatar_char, turn_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );
      for (const m of msgs) {
        if (m.speaker === 'System' || m.speaker === '人类(Admin)') continue;
        if (participantIds[m.speaker] !== undefined) continue;
        const p = personas.find(x => x.name === m.speaker);
        const r = insertP.run(
          discussionId,
          p ? p.id : null,
          m.speaker,
          p ? p.persona : '（示例人格）',
          p ? p.avatar_color : '#B8A89A',
          p ? p.avatar_char : m.speaker.slice(-1),
          order++
        );
        participantIds[m.speaker] = r.lastInsertRowid;
      }

      const insertM = db.prepare(
        `INSERT INTO discussion_messages (discussion_id, speaker_type, participant_id, speaker_name, content, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      );
      for (const m of msgs) {
        const type = m.speaker === 'System' ? 'system'
          : m.speaker === '人类(Admin)' ? 'human' : 'agent';
        insertM.run(
          discussionId,
          type,
          type === 'agent' ? participantIds[m.speaker] : null,
          m.speaker,
          m.text,
          m.timestamp
        );
      }
    });

    let imported = 0;
    for (const file of files) {
      try {
        const msgs = JSON.parse(fs.readFileSync(path.join(SAMPLES_DIR, file), 'utf-8'));
        if (!Array.isArray(msgs) || msgs.length < 3) continue;
        if (!msgs[0].text || !msgs[0].text.startsWith('讨论开始')) continue;
        importFile(msgs);
        imported++;
      } catch (e) {
        console.error(`导入示例讨论 ${file} 失败:`, e.message);
      }
    }
    if (imported > 0) console.log(`众声：已导入 ${imported} 场示例回放`);
  } catch (err) {
    console.error('Seed sample discussions error:', err);
  }
}

seedSampleDiscussions();

// ==================== Serve static files in production ====================

const clientBuildPath = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientBuildPath)) {
  app.use(express.static(clientBuildPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
