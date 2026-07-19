const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const host = process.env.SMTP_HOST || 'smtp.163.com';
  const port = parseInt(process.env.SMTP_PORT || '465', 10);

  if (!user || !pass) {
    throw new Error('SMTP 未配置：请设置 SMTP_USER / SMTP_PASS 环境变量');
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  return transporter;
}

/**
 * 发送验证/重置邮件
 * @param {string} to 收件邮箱
 * @param {'verify'|'reset'} type
 * @param {string} token 验证 token
 * @param {string} [nickname] 昵称（收件人称呼）
 */
async function sendTokenMail(to, type, token, nickname) {
  const transport = getTransporter();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const app = process.env.APP_URL || 'http://localhost:5173';

  const name = nickname || to;
  let subject, action, route;

  if (type === 'verify') {
    subject = '验证你的 Love and Peace 邮箱';
    action = '验证邮箱';
    route = `/verify?token=${token}`;
  } else {
    subject = '重置你的 Love and Peace 密码';
    action = '重置密码';
    route = `/reset?token=${token}`;
  }

  const link = `${app}${route}`;

  const html = `<div style="max-width:480px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif;color:#2B2B2B">
    <p style="font-family:'Noto Serif SC',serif;font-size:24px;letter-spacing:.04em;color:#2B2B2B">Love and Peace</p>
    <hr style="border:none;border-top:1px solid #D9D3C9;margin:20px 0">
    <p>${name}，你好：</p>
    <p>请点击下方按钮${action}。这个链接在 1 小时内有效。</p>
    <p style="margin:28px 0">
      <a href="${link}" style="display:inline-block;padding:13px 28px;background:#2B2B2B;color:#F5F2EC;border-radius:999px;text-decoration:none;font-size:14px">${action}</a>
    </p>
    <p style="margin-top:20px;font-size:12px;color:#7A756B">如果按钮点不了，复制这个链接到浏览器：<br>${link}</p>
    <hr style="border:none;border-top:1px solid #D9D3C9;margin:20px 0">
    <p style="font-size:12px;color:#A39C90">这封邮件由 Love and Peace 自动发出。如果你没有注册或请求重置，请忽略。</p>
  </div>`;

  await transport.sendMail({ from, to, subject, html });
}

module.exports = { sendTokenMail };
