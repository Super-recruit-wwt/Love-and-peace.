const fs = require('fs');
const path = require('path');
const { db } = require('../db');
const { authMiddleware } = require('../auth');
const { buildSystemPrompt } = require('../llm');

function register(app) {
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
}

module.exports = { register };
