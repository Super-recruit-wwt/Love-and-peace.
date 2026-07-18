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
  generateInternalMonologue, compressMemory } = require('./llm');

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
      fs.readFileSync(path.join(__dirname, 'config', 'presets.json'), 'utf-8')
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

    // Get recent conversation history
    const recentMessages = db.prepare(
      'SELECT role, content FROM messages WHERE character_id = ? ORDER BY created_at DESC LIMIT 30'
    ).all(char.id).reverse();

    // Emotional state — load, analyze stimulus, update
    let emotionalState = getEmotionalState(char.id);
    const stimulus = analyzeStimulus(message.trim());
    emotionalState = applyStimulus(emotionalState, stimulus);
    upsertEmotionalState(char.id, emotionalState);

    // Call LLM
    let reply;
    try {
      const history = recentMessages.slice(0, -1).map(m => ({
        role: m.role,
        content: m.content,
      }));

      reply = await chat(char.system_prompt, history, emotionalState);
    } catch (llmErr) {
      console.error('LLM error:', llmErr);
      reply = '抱歉，我现在有点累，稍等一下再来找我聊好吗？';
    }

    // Save AI reply
    const result = db.prepare('INSERT INTO messages (character_id, role, content) VALUES (?, ?, ?)')
      .run(char.id, 'assistant', reply);

    // Log ground truth for AI reply
    logGroundTruth(char.id, 'assistant', reply, msgCount + 1);

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
      id: result.lastInsertRowid,
      role: 'assistant',
      content: reply,
      created_at: new Date().toISOString(),
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

// ==================== Serve static files in production ====================

const clientBuildPath = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientBuildPath)) {
  app.use(express.static(clientBuildPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
