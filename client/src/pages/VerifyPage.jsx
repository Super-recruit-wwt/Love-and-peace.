import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { get, setToken } from '../api';
import './auth.css';

export default function VerifyPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [error, setError] = useState('');

  const token = searchParams.get('token');

  const requested = useRef(false);

  useEffect(() => {
    if (!token) {
      setError('验证链接无效');
      return;
    }
    if (user) {
      navigate('/', { replace: true });
      return;
    }
    // StrictMode 下 effect 会执行两次，保证验证请求只发一次（token 是一次性的）
    if (requested.current) return;
    requested.current = true;
    get(`/auth/verify-email?token=${token}`)
      .then(res => {
        if (res.token) {
          setToken(res.token);
          window.location.href = '/';
        }
      })
      .catch(err => setError(err.message || '验证失败，请重新注册'));
  }, [token]);

  if (!token) {
    return (
      <div className="auth-wrap">
        <div className="card-porcelain auth-card fade-rise">
          <div className="auth-head">
            <span className="seal seal--lg">愛</span>
            <h2 className="t-heading">无效链接</h2>
            <p className="auth-sub">这个验证链接不完整。请检查邮件里的完整链接。</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="auth-wrap">
        <div className="card-porcelain auth-card fade-rise">
          <div className="auth-head">
            <span className="seal seal--lg">愛</span>
            <h2 className="t-heading">验证失败</h2>
            <p className="auth-sub">{error}</p>
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
          <span className="seal seal--lg">愛</span>
          <h2 className="t-heading">验证完成</h2>
          <p className="auth-sub">正在跳转门户…</p>
        </div>
      </div>
    </div>
  );
}
