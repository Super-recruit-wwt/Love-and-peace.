import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import './xianxia-common.css';

export default function LegacyPage() {
  const navigate = useNavigate();
  const [legacy, setLegacy] = useState([]);
  const [completed, setCompleted] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exportingId, setExportingId] = useState(null);

  useEffect(() => {
    api.get('/xianxia/legacy').then(res => {
      setLegacy(res.legacy || []);
      setCompleted(res.completed_runs || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function handleExport(characterId) {
    setExportingId(characterId);
    try {
      const response = await fetch(`/api/xianxia/characters/${characterId}/export`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (!response.ok) throw new Error('导出失败');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `xianxia-life-${characterId}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('导出失败，请重试');
    } finally {
      setExportingId(null);
    }
  }

  function parseAchievements(s) {
    try { return JSON.parse(s || '[]'); } catch { return []; }
  }

  if (loading) return <div className="x-loading">加载中……</div>;

  return (
    <div className="x-page">
      <div className="x-header">
        <div>
          <p className="mono-label">Xianxia · 传世</p>
          <h1 className="t-heading">传世记录</h1>
        </div>
        <button className="btn-outline" onClick={() => navigate('/xianxia')}>返回角色列表</button>
      </div>

      {completed.length > 0 && (
        <section style={{ marginBottom: '32px' }}>
          <span className="mono-label x-group-label">✧ 已飞升</span>
          {completed.map(r => (
            <div key={r.id} className="card-porcelain x-legacy-card">
              <div className="x-legacy-card-head">
                <div>
                  <span className="x-legacy-name">{r.character_name}</span>
                  <span className="x-status-tag x-status-ascended" style={{ marginLeft: '10px' }}>已飞升</span>
                </div>
                <button className="btn-outline btn-sm" onClick={() => handleExport(r.character_id)} disabled={exportingId === r.character_id}>
                  {exportingId === r.character_id ? '导出中…' : '导出 MD'}
                </button>
              </div>
              <div className="x-legacy-meta">
                {r.cultivation_path} · {r.final_cultivation} · 游戏时长 {r.game_duration}年
              </div>
              <div className="x-legacy-achievements">
                成就：{parseAchievements(r.key_achievements).join('、') || '无'}
              </div>
            </div>
          ))}
        </section>
      )}

      {legacy.length > 0 && (
        <section style={{ marginBottom: '32px' }}>
          <span className="mono-label x-group-label">☽ 已陨落</span>
          {legacy.map(l => (
            <div key={l.id} className="card-porcelain x-legacy-card">
              <div className="x-legacy-card-head">
                <div>
                  <span className="x-legacy-name">{l.character_name}</span>
                  <span className="x-status-tag x-status-dead" style={{ marginLeft: '10px' }}>已陨落</span>
                </div>
                <button className="btn-outline btn-sm" onClick={() => handleExport(l.character_id)} disabled={exportingId === l.character_id}>
                  {exportingId === l.character_id ? '导出中…' : '导出 MD'}
                </button>
              </div>
              <div className="x-legacy-meta">
                死因：{l.death_cause} · 享年 {l.final_age}岁 · {l.final_cultivation}
              </div>
            </div>
          ))}
        </section>
      )}

      {completed.length === 0 && legacy.length === 0 && (
        <p className="x-empty">
          还没有传世记录。<br />当一个角色陨落或飞升后，他的人生将在这里被铭记。
        </p>
      )}
    </div>
  );
}
