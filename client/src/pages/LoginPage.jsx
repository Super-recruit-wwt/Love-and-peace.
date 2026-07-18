import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';

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
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <h1 style={styles.title}>🕊️ Love and Peace</h1>
          <p style={styles.subtitle}>欢迎回来，你的 AI 伙伴在等你</p>
        </div>
        <form onSubmit={handleSubmit} style={styles.form}>
          {error && <div style={styles.error}>{error}</div>}
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
            placeholder="密码"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
          <button style={styles.button} type="submit" disabled={submitting}>
            {submitting ? '登录中…' : '登录'}
          </button>
        </form>
        <p style={styles.footer}>
          还没有账号？<Link to="/register">注册</Link>
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
    opacity: 1, transition: 'opacity 0.2s',
  },
  footer: { textAlign: 'center', marginTop: '24px', fontSize: '14px', color: 'var(--text-secondary)' },
};
