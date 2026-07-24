const { db } = require('../db');
const { authMiddleware } = require('../auth');
const { chat, proactiveChat } = require('../llm');
const {
  getEmotionalState, upsertEmotionalState,
  getCondensedMemories, addCondensedMemory, decayCondensedMemories,
  logGroundTruth,
} = require('../db');
const { analyzeStimulus, applyStimulus, compressMemory } = require('../llm');

function register(app) {
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
}

module.exports = { register };
