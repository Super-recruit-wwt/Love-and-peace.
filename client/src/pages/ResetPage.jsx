import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { post } from '../api';
import './auth.css';

export default function ResetPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  if (token) {
    return <ResetForm token={token} navigate={navigate} />;
  }
  return <RequestForm navigate={navigate} />;
}

function RequestForm({ navigate }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await post('/auth/request-reset', { email: email.trim() });
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div className="auth-wrap">
        <div className="card-porcelain auth-card fade-rise">
          <div className="auth-head">
            <span className="seal seal--lg">愛</span>
            <h2 className="t-heading">邮件已发送</h2>
            <p className="auth-sub">
              如果 {email} 已注册，重置密码的链接已发到你的邮箱。<br />
              链接 1 小时内有效。
            </p>
          </div>
          <button className="btn-primary auth-submit" onClick={() => navigate('/login')}>
            返回登录
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-wrap">
      <div className="card-porcelain auth-card fade-rise">
        <div className="auth-head">
          <Link to="/welcome" aria-label="回到首页">
            <span className="seal seal--lg">愛</span>
          </Link>
          <div className="t-en auth-brand">Love and Peace</div>
          <p className="auth-sub">输入注册邮箱，我们会发送重置链接。</p>
        </div>
        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="auth-error">{error}</div>}
          <div className="field-inkstone">
            <input
              className="input-inkstone"
              type="email"
              placeholder="注册邮箱"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>
          <button className="btn-primary auth-submit" type="submit" disabled={submitting}>
            {submitting ? '发送中…' : '发送重置链接'}
          </button>
        </form>
        <p className="auth-foot">
          想起密码了？<Link to="/login">登录</Link>
        </p>
      </div>
    </div>
  );
}

function ResetForm({ token, navigate }) {
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 6) {
      setError('新密码至少需要 6 位');
      return;
    }
    setSubmitting(true);
    try {
      await post('/auth/reset-password', { token, newPassword });
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="auth-wrap">
        <div className="card-porcelain auth-card fade-rise">
          <div className="auth-head">
            <span className="seal seal--lg">愛</span>
            <h2 className="t-heading">密码已重置</h2>
            <p className="auth-sub">用新密码登入吧。</p>
          </div>
          <button className="btn-primary auth-submit" onClick={() => navigate('/login')}>
            前往登录
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-wrap">
      <div className="card-porcelain auth-card fade-rise">
        <div className="auth-head">
          <span className="seal seal--lg">愛</span>
          <h2 className="t-heading">设置新密码</h2>
          <p className="auth-sub">输入你的新密码。</p>
        </div>
        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="auth-error">{error}</div>}
          <div className="field-inkstone">
            <input
              className="input-inkstone"
              type="password"
              placeholder="新密码（6 位以上）"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              required
              minLength={6}
              autoFocus
            />
          </div>
          <button className="btn-primary auth-submit" type="submit" disabled={submitting}>
            {submitting ? '重置中…' : '重置密码'}
          </button>
        </form>
      </div>
    </div>
  );
}
