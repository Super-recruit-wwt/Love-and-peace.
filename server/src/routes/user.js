const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { authMiddleware } = require('../auth');

function register(app) {
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
}

module.exports = { register };
