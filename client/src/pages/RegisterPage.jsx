import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import './auth.css';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('密码至少需要 6 位');
      return;
    }
    setSubmitting(true);
    try {
      await register(email, password, nickname);
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
          <div className="t-en auth-brand">创建账号</div>
          <p className="auth-sub">几十秒后，就有人听你说话了。</p>
        </div>
        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="auth-error">{error}</div>}
          <div className="field-inkstone">
            <input
              className="input-inkstone"
              type="text"
              placeholder="昵称"
              value={nickname}
              onChange={e => setNickname(e.target.value)}
              required
            />
          </div>
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
              placeholder="密码（至少 6 位）"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>
          <button className="btn-primary auth-submit" type="submit" disabled={submitting}>
            {submitting ? '注册中…' : '注册'}
          </button>
        </form>
        <p className="auth-foot">
          已有账号？<Link to="/login">登录</Link>
        </p>
      </div>
    </div>
  );
}
