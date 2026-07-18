import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';

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
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <h1 style={styles.title}>🕊️ 创建账号</h1>
          <p style={styles.subtitle}>找到属于你的 AI 伙伴</p>
        </div>
        <form onSubmit={handleSubmit} style={styles.form}>
          {error && <div style={styles.error}>{error}</div>}
          <input
            style={styles.input}
            type="text"
            placeholder="昵称"
            value={nickname}
            onChange={e => setNickname(e.target.value)}
            required
          />
          <input
            style={styles.input}
            type="email"
            placeholder="邮箱"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
          <input
            style={styles.input}
            type="password"
            placeholder="密码（至少 6 位）"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
          <button style={styles.button} type="submit" disabled={submitting}>
            {submitting ? '注册中…' : '注册'}
          </button>
        </form>
        <p style={styles.footer}>
          已有账号？<Link to="/login">登录</Link>
        </p>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    minHeight: '100vh', padding: '20px',
  },
  card: {
    width: '100%', maxWidth: '400px',
    background: 'var(--bg-secondary)',
    borderRadius: 'var(--radius-lg)',
    padding: '40px 32px',
    boxShadow: 'var(--shadow-md)',
  },
  header: { textAlign: 'center', marginBottom: '32px' },
  title: { fontSize: '28px', fontWeight: '700', marginBottom: '8px' },
  subtitle: { fontSize: '14px', color: 'var(--text-secondary)' },
  form: { display: 'flex', flexDirection: 'column', gap: '16px' },
  error: {
    background: '#fef2f2', color: '#ef4444', padding: '10px 14px',
    borderRadius: 'var(--radius-sm)', fontSize: '14px',
  },
  input: {
    width: '100%', padding: '12px 16px',
    background: 'var(--bg-input)', border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-sm)', fontSize: '15px',
    color: 'var(--text-primary)', outline: 'none',
  },
  button: {
    width: '100%', padding: '12px',
    background: 'var(--accent)', color: '#fff',
    border: 'none', borderRadius: 'var(--radius-sm)',
    fontSize: '16px', fontWeight: '600', cursor: 'pointer',
  },
  footer: { textAlign: 'center', marginTop: '24px', fontSize: '14px', color: 'var(--text-secondary)' },
};
