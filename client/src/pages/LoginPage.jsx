import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import './auth.css';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="card-porcelain auth-card fade-rise">
        <div className="auth-head">
          <Link to="/welcome" aria-label="回到首页">
            <span className="seal seal--lg">愛</span>
          </Link>
          <div className="t-en auth-brand">Love and Peace</div>
          <p className="auth-sub">欢迎回来，你的伙伴一直在。</p>
        </div>
        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="auth-error">{error}</div>}
          <div className="field-inkstone">
            <input
              className="input-inkstone"
              type="email"
              placeholder="邮箱"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="field-inkstone">
            <input
              className="input-inkstone"
              type="password"
              placeholder="密码"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>
          <button className="btn-primary auth-submit" type="submit" disabled={submitting}>
            {submitting ? '登录中…' : '登录'}
          </button>
        </form>
        <p className="auth-foot">
          还没有账号？<Link to="/register">注册</Link>
        </p>
        <p className="auth-foot" style={{ marginTop: 4 }}>
          忘记密码？<Link to="/reset">重置</Link>
        </p>
        <p className="auth-foot" style={{ marginTop: 6 }}>
          忘记密码？<Link to="/reset">重置</Link>
        </p>
      </div>
    </div>
  );
}
