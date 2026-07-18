import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { put } from '../api';
import './settings.css';

/* 青白双模式：纸（亮）/ 砚（暗） */
const THEMES = [
  { value: 'light', label: '纸 · 亮色', dot: '#F5F2EC' },
  { value: 'dark', label: '砚 · 暗色', dot: '#1D1C1A' },
];

export default function SettingsPage() {
  const { user, logout, updateUser } = useAuth();
  const navigate = useNavigate();
  const [nickname, setNickname] = useState(user?.nickname || '');
  const [theme, setTheme] = useState(user?.theme === 'dark' ? 'dark' : 'light');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwMessage, setPwMessage] = useState('');

  const handleUpdateProfile = async () => {
    setSaving(true);
    setMessage('');
    try {
      await put('/user/profile', { nickname, theme });
      updateUser({ nickname, theme });
      setMessage('已保存');
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
      setPwMessage('密码已修改');
      setOldPw('');
      setNewPw('');
    } catch (err) {
      setPwMessage('修改失败：' + err.message);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/welcome');
  };

  return (
    <div className="settings-wrap">
      <div className="fade-rise">
        <Link to="/" className="settings-back">← 门户</Link>
        <h1 className="t-heading settings-title">设置</h1>
      </div>

      {/* 个人信息 */}
      <section className="settings-group fade-rise delay-1">
        <p className="mono-label">Profile</p>
        <div className="settings-rows">
          <div className="settings-row field-inkstone">
            <span className="mono-label settings-row-label">昵称</span>
            <input
              className="input-inkstone"
              type="text"
              value={nickname}
              onChange={e => setNickname(e.target.value)}
            />
          </div>
          <div className="settings-row">
            <span className="mono-label settings-row-label">邮箱</span>
            <span className="settings-static">{user?.email || ''}</span>
          </div>
        </div>
        <div className="settings-foot">
          <span className={`settings-msg ${message.includes('失败') ? 'err' : 'ok'}`}>{message}</span>
          <button className="btn-outline" onClick={handleUpdateProfile} disabled={saving}>
            {saving ? '保存中…' : '保存修改'}
          </button>
        </div>
      </section>

      {/* 主题 */}
      <section className="settings-group fade-rise delay-2">
        <p className="mono-label">Theme</p>
        <div className="settings-themes">
          {THEMES.map(t => (
            <button
              key={t.value}
              className={theme === t.value ? 'chip selected' : 'chip'}
              onClick={() => handleThemeChange(t.value)}
            >
              <span className="settings-theme-dot" style={{ background: t.dot }} />
              {t.label}
            </button>
          ))}
        </div>
      </section>

      {/* 修改密码 */}
      <section className="settings-group fade-rise delay-3">
        <p className="mono-label">Password</p>
        <form onSubmit={handleChangePassword}>
          <div className="settings-rows">
            <div className="settings-row field-inkstone">
              <span className="mono-label settings-row-label">原密码</span>
              <input className="input-inkstone" type="password" value={oldPw} onChange={e => setOldPw(e.target.value)} />
            </div>
            <div className="settings-row field-inkstone">
              <span className="mono-label settings-row-label">新密码</span>
              <input className="input-inkstone" type="password" value={newPw} onChange={e => setNewPw(e.target.value)} />
            </div>
          </div>
          <div className="settings-foot">
            <span className={`settings-msg ${pwMessage.includes('失败') || pwMessage.includes('至少') ? 'err' : 'ok'}`}>{pwMessage}</span>
            <button className="btn-outline" type="submit">修改密码</button>
          </div>
        </form>
      </section>

      <div className="settings-logout">
        <button onClick={handleLogout} className="btn-danger-link">退出登录</button>
      </div>
    </div>
  );
}
