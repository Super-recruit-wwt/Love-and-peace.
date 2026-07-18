import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { put } from '../api';

const THEMES = [
  { value: 'light', label: '清新简约', emoji: '☁️', preview: '#f5f5f5' },
  { value: 'warm', label: '温暖治愈', emoji: '🌅', preview: '#faf6f1' },
  { value: 'dark', label: '暗色护眼', emoji: '🌙', preview: '#1a1a2e' },
  { value: 'green', label: '自然绿意', emoji: '🌿', preview: '#f2f7f3' },
];

export default function SettingsPage() {
  const { user, logout, updateUser } = useAuth();
  const navigate = useNavigate();
  const [nickname, setNickname] = useState(user?.nickname || '');
  const [theme, setTheme] = useState(user?.theme || 'light');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // Password change
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwMessage, setPwMessage] = useState('');

  const handleUpdateProfile = async () => {
    setSaving(true);
    setMessage('');
    try {
      await put('/user/profile', { nickname, theme });
      updateUser({ nickname, theme });
      setMessage('保存成功！');
    } catch (err) {
      setMessage('保存失败：' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleThemeChange = async (t) => {
    setTheme(t);
    try {
      await put('/user/profile', { theme: t });
      updateUser({ theme: t });
    } catch (_) {}
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!oldPw || !newPw) return;
    if (newPw.length < 6) {
      setPwMessage('新密码至少需要 6 位');
      return;
    }
    try {
      await put('/user/password', { oldPassword: oldPw, newPassword: newPw });
      setPwMessage('密码修改成功！');
      setOldPw('');
      setNewPw('');
    } catch (err) {
      setPwMessage('修改失败：' + err.message);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div style={styles.container}>
      <div style={styles.topbar}>
        <Link to="/" style={styles.backBtn}>← 返回</Link>
        <h1 style={styles.title}>设置</h1>
        <div />
      </div>

      {/* Profile */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>个人信息</h2>
        <div style={styles.formGroup}>
          <label style={styles.label}>昵称</label>
          <input
            style={styles.input}
            type="text"
            value={nickname}
            onChange={e => setNickname(e.target.value)}
          />
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>邮箱</label>
          <input style={{ ...styles.input, color: 'var(--text-muted)' }} type="email" value={user?.email || ''} disabled />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {message && <span style={{ color: message.includes('失败') ? '#ef4444' : '#22c55e', fontSize: '14px' }}>{message}</span>}
          <button style={styles.saveBtn} onClick={handleUpdateProfile} disabled={saving}>
            {saving ? '保存中…' : '保存修改'}
          </button>
        </div>
      </section>

      {/* Theme */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>主题配色</h2>
        <div style={styles.themeGrid}>
          {THEMES.map(t => (
            <button
              key={t.value}
              style={{
                ...styles.themeCard,
                borderColor: theme === t.value ? 'var(--accent)' : 'var(--border-color)',
              }}
              onClick={() => handleThemeChange(t.value)}
            >
              <div style={{ ...styles.themePreview, background: t.preview }} />
              <div style={styles.themeLabel}>
                <span>{t.emoji}</span> {t.label}
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Password */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>修改密码</h2>
        <form onSubmit={handleChangePassword}>
          <div style={styles.formGroup}>
            <label style={styles.label}>原密码</label>
            <input style={styles.input} type="password" value={oldPw} onChange={e => setOldPw(e.target.value)} />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>新密码</label>
            <input style={styles.input} type="password" value={newPw} onChange={e => setNewPw(e.target.value)} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {pwMessage && <span style={{ color: pwMessage.includes('失败') ? '#ef4444' : '#22c55e', fontSize: '14px' }}>{pwMessage}</span>}
            <button style={styles.saveBtn} type="submit">修改密码</button>
          </div>
        </form>
      </section>

      {/* Logout */}
      <section style={styles.section}>
        <button onClick={handleLogout} style={styles.logoutBtn}>退出登录</button>
      </section>
    </div>
  );
}

const styles = {
  container: {
    maxWidth: '540px', margin: '0 auto', padding: '24px 20px', minHeight: '100vh',
  },
  topbar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: '32px',
  },
  backBtn: {
    background: 'none', border: 'none', color: 'var(--text-secondary)',
    fontSize: '15px', cursor: 'pointer', textDecoration: 'none',
  },
  title: { fontSize: '20px', fontWeight: '700' },
  section: {
    background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)',
    padding: '24px', marginBottom: '20px', boxShadow: 'var(--shadow-sm)',
  },
  sectionTitle: { fontSize: '17px', fontWeight: '600', marginBottom: '20px' },
  formGroup: { marginBottom: '16px' },
  label: { display: 'block', fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px' },
  input: {
    width: '100%', padding: '10px 14px',
    background: 'var(--bg-input)', border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-sm)', fontSize: '15px',
    color: 'var(--text-primary)', outline: 'none',
  },
  saveBtn: {
    padding: '8px 20px', background: 'var(--accent)', color: '#fff',
    border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '14px',
    fontWeight: '600', cursor: 'pointer', marginTop: '4px',
  },
  themeGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' },
  themeCard: {
    padding: '12px', border: '2px solid', borderRadius: 'var(--radius-md)',
    background: 'none', cursor: 'pointer', textAlign: 'center',
    transition: 'border-color 0.15s',
  },
  themePreview: {
    height: '40px', borderRadius: 'var(--radius-sm)', marginBottom: '8px',
  },
  themeLabel: { fontSize: '14px', color: 'var(--text-primary)' },
  logoutBtn: {
    width: '100%', padding: '12px', background: 'var(--bg-input)', color: 'var(--danger)',
    border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '15px', cursor: 'pointer',
  },
};
