const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { signToken } = require('../auth');
const { sendTokenMail } = require('../mailer');

function makeVerificationToken() {
  return crypto.randomBytes(32).toString('hex');
}

function register(app) {
  app.post('/api/auth/register', async (req, res) => {
    try {
      const { email, password, nickname } = req.body;

      if (!email || !password || !nickname) {
        return res.status(400).json({ error: '请填写邮箱、密码和昵称' });
      }

      if (password.length < 6) {
        return res.status(400).json({ error: '密码至少需要 6 位' });
      }

      const existing = db.prepare('SELECT id, email_verified FROM users WHERE email = ?').get(email.trim());
      if (existing) {
        if (existing.email_verified) {
          return res.status(400).json({ error: '该邮箱已被注册' });
        }
        const vt = makeVerificationToken();
        const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        db.prepare(
          "INSERT INTO verification_tokens (user_id, token, type, expires_at) VALUES (?, ?, 'verify', ?)"
        ).run(existing.id, vt, expires);
        sendTokenMail(email.trim(), 'verify', vt, nickname).catch(err =>
          console.error('发送验证邮件失败:', err.message));
        return res.json({ ok: true, email: email.trim(), message: '验证邮件已重新发送，请查收' });
      }

      const hash = bcrypt.hashSync(password, 10);
      const result = db.prepare(
        'INSERT INTO users (email, password_hash, nickname, email_verified) VALUES (?, ?, ?, 0)'
      ).run(email.trim(), hash, nickname.trim());

      const vt = makeVerificationToken();
      const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      db.prepare(
        "INSERT INTO verification_tokens (user_id, token, type, expires_at) VALUES (?, ?, 'verify', ?)"
      ).run(result.lastInsertRowid, vt, expires);

      sendTokenMail(email.trim(), 'verify', vt, nickname.trim()).catch(err =>
        console.error('发送验证邮件失败:', err.message));

      res.json({ ok: true, email: email.trim(), message: '验证邮件已发送，请查收' });
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

      const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim());
      if (!user) {
        return res.status(400).json({ error: '邮箱或密码错误' });
      }

      if (!user.email_verified) {
        return res.status(400).json({ error: '请先验证邮箱后再登录。查看注册时收到的邮件，或重新注册以获取新验证链接。' });
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

  // 邮箱验证
  app.get('/api/auth/verify-email', (req, res) => {
    try {
      const { token } = req.query;
      if (!token) return res.status(400).json({ error: '缺少验证 token' });

      const row = db.prepare(
        "SELECT * FROM verification_tokens WHERE token = ? AND type = 'verify'"
      ).get(token);

      if (!row) return res.status(400).json({ error: '验证链接无效' });
      if (new Date(row.expires_at) < new Date()) {
        return res.status(400).json({ error: '验证链接已过期，请重新注册' });
      }

      db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(row.user_id);
      db.prepare('DELETE FROM verification_tokens WHERE id = ?').run(row.id);

      const jwt = signToken(row.user_id);
      const user = db.prepare('SELECT id, email, nickname, theme FROM users WHERE id = ?').get(row.user_id);
      res.json({ ok: true, token: jwt, user });
    } catch (err) {
      console.error('Verify email error:', err);
      res.status(500).json({ error: '验证失败，请稍后重试' });
    }
  });

  // 重置密码 — 请求邮件
  app.post('/api/auth/request-reset', async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ error: '请输入注册邮箱' });

      const user = db.prepare('SELECT id, nickname, email_verified FROM users WHERE email = ?').get(email.trim());
      if (!user) {
        return res.json({ ok: true, message: '如果你的邮箱已注册，重置链接已发送' });
      }

      const vt = makeVerificationToken();
      const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      db.prepare(
        "INSERT INTO verification_tokens (user_id, token, type, expires_at) VALUES (?, ?, 'reset', ?)"
      ).run(user.id, vt, expires);

      sendTokenMail(email.trim(), 'reset', vt, user.nickname).catch(err =>
        console.error('发送重置邮件失败:', err.message));

      res.json({ ok: true, message: '如果你的邮箱已注册，重置链接已发送' });
    } catch (err) {
      console.error('Request reset error:', err);
      res.status(500).json({ error: '发送重置邮件失败' });
    }
  });

  // 重置密码 — 设新密码
  app.post('/api/auth/reset-password', async (req, res) => {
    try {
      const { token, newPassword } = req.body;
      if (!token || !newPassword) return res.status(400).json({ error: '缺少必要参数' });
      if (newPassword.length < 6) return res.status(400).json({ error: '新密码至少需要 6 位' });

      const row = db.prepare(
        "SELECT * FROM verification_tokens WHERE token = ? AND type = 'reset'"
      ).get(token);

      if (!row) return res.status(400).json({ error: '重置链接无效' });
      if (new Date(row.expires_at) < new Date()) {
        return res.status(400).json({ error: '重置链接已过期，请重新请求' });
      }

      const hash = bcrypt.hashSync(newPassword, 10);
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, row.user_id);
      db.prepare('DELETE FROM verification_tokens WHERE token = ?').run(token);

      res.json({ ok: true, message: '密码已重置，请前往登录' });
    } catch (err) {
      console.error('Reset password error:', err);
      res.status(500).json({ error: '重置密码失败' });
    }
  });
}

module.exports = { register };
