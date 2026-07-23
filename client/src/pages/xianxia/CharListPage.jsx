import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { formatAge } from './format';
import './xianxia-common.css';

export default function CharListPage() {
  const [characters, setCharacters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newGender, setNewGender] = useState('neutral');
  const [deletingId, setDeletingId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadCharacters();
  }, []);

  async function loadCharacters() {
    try {
      const res = await api.get('/xianxia/characters');
      setCharacters(res.characters);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      const res = await api.post('/xianxia/characters', { name: newName, gender: newGender });
      navigate('/xianxia/birth', { state: { character: res.character } });
    } catch (err) { console.error(err); }
  }

  async function handleDelete(e, c) {
    e.stopPropagation(); // 不触发卡片跳转
    if (!confirm(`确定删除角色「${c.name}」吗？\n其人生记录（含传世/通关记录）将一并抹除，不可恢复。`)) return;
    setDeletingId(c.id);
    try {
      await api.del(`/xianxia/characters/${c.id}`);
      setCharacters(prev => prev.filter(x => x.id !== c.id));
    } catch (err) {
      alert(err.message || '删除失败，请重试');
    } finally {
      setDeletingId(null);
    }
  }

  const pathLabel = (paths) => {
    const labels = [];
    if (paths.xiandao) labels.push(`仙道·${paths.xiandao}`);
    if (paths.physical) labels.push(`肉身·${paths.physical}`);
    if (paths.strange) labels.push(`诡道·${paths.strange}`);
    if (paths.artisan) labels.push(`匠道·${paths.artisan}`);
    if (paths.wanderer) labels.push(`散修·${paths.wanderer}`);
    return labels.length > 0 ? labels.join(' | ') : '未踏入修炼';
  };

  const statusLabel = (s) => s === 'active' ? '修行中' : s === 'dead' ? '已陨落' : '已飞升';

  if (loading) return <div className="x-loading">加载中……</div>;

  return (
    <div className="x-page">
      <div className="x-header">
        <div>
          <p className="mono-label">Xianxia · 修仙模拟</p>
          <h1 className="t-heading">角色</h1>
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? '取消' : '＋ 创建新角色'}
        </button>
      </div>

      {showCreate && (
        <form className="x-create-form card-porcelain" onSubmit={handleCreate}>
          <div className="field-inkstone">
            <input
              className="input-inkstone"
              placeholder="角色名"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              autoFocus
            />
          </div>
          <select className="x-select" value={newGender} onChange={e => setNewGender(e.target.value)}>
            <option value="neutral">无分性别</option>
            <option value="male">男</option>
            <option value="female">女</option>
          </select>
          <button type="submit" className="btn-primary">踏入修仙世界</button>
        </form>
      )}

      <div className="x-char-grid">
        {characters.map(c => (
          <div
            key={c.id}
            className="x-char-card card-porcelain"
            onClick={() => navigate(`/xianxia/${c.id}`)}
            role="button"
            tabIndex={0}
          >
            <div className="x-char-card-head">
              <span className="x-char-name">{c.name}</span>
              <span className={`x-status-tag x-status-${c.status}`}>{statusLabel(c.status)}</span>
            </div>
            <div className="x-char-card-path">{pathLabel(c.cultivation_paths)}</div>
            <div className="x-char-card-meta">
              <span>{c.birth_region} · {c.birth_background}</span>
              <span>{formatAge(c.game_age)} · {c.current_location}</span>
            </div>
            {c.timer_remaining && c.timer_remaining > 0 && (
              <div className="x-timer-badge">
                {c.timer_type === 'breakthrough' ? '突破中' : '闭关中'} · {Math.floor(c.timer_remaining / 60)}分{c.timer_remaining % 60}秒
              </div>
            )}
            <div className="x-char-card-footer">
              {confirmDeleteId === c.id ? (
                <span className="x-delete-confirm">
                  <span style={{fontSize:11,color:"var(--color-seal)"}}>确定删除？</span>
                  <button className="btn-danger-link" onClick={() => handleDelete(c.id)} disabled={deletingId === c.id}>确认</button>
                  <button className="btn-outline btn-sm" onClick={(e) => {e.stopPropagation(); setConfirmDeleteId(null);}}>取消</button>
                </span>
              ) : (
                <button
                  className="btn-danger-link"
                  onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(c.id); }}
                >
                  删除
                </button>
              )}
            </div>
          </div>
        ))}
        {characters.length === 0 && !loading && (
          <p className="x-empty">还没有角色。点击上方按钮创建你的第一个求道者。</p>
        )}
      </div>

      <div className="x-footer-nav">
        <button className="btn-outline" onClick={() => navigate('/xianxia/legacy')}>传世记录</button>
        <button className="btn-outline" onClick={() => navigate('/')}>返回 Portal</button>
      </div>
    </div>
  );
}
