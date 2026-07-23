import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import './xianxia-common.css';

export default function JournalPage() {
  const { characterId } = useParams();
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [npcs, setNpcs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get(`/xianxia/characters/${characterId}/timeline?limit=20`).catch(() => ({ events: [] })),
      api.get('/xianxia/npcs').catch(() => ({ npcs: [] })),
    ]).then(([tl, n]) => {
      setEvents(tl.events || []);
      setNpcs(n.npcs || []);
      setLoading(false);
    });
  }, [characterId]);

  if (loading) return <div className="x-loading">加载中……</div>;

  // 按类型分组事件
  var worldEvents = events.filter(e => e.event_type === 'world_event').slice(-10);
  var breakthroughs = events.filter(e => e.event_type === 'breakthrough');
  var npcEvents = events.filter(e => e.event_type === 'npc_behavior');

  return (
    <div className="x-page">
      <div className="x-header">
        <h1 className="t-heading">世界日志</h1>
        <button className="btn-outline" onClick={() => navigate(`/xianxia/${characterId}`)}>返回</button>
      </div>

      {npcs.length > 0 && (
        <section className="card-porcelain x-section">
          <span className="mono-label">已知 NPC</span>
          <div style={{display:'flex',flexDirection:'column',gap:6,marginTop:8}}>
            {npcs.slice(0, 10).map(npc => (
              <div key={npc.id} className="x-row">
                <span className="x-row-main">{npc.name}</span>
                <span className="x-row-sub" style={{fontSize:12}}>{npc.identity} · {npc.faction} · {npc.location}</span>
              </div>
            ))}
            {npcs.length > 10 && <span className="mono-label" style={{fontSize:11,color:'var(--color-ink-3)'}}>…还有 {npcs.length - 10} 位</span>}
          </div>
        </section>
      )}

      {worldEvents.length > 0 && (
        <section className="card-porcelain x-section">
          <span className="mono-label">世界事件</span>
          <div style={{display:'flex',flexDirection:'column',gap:8,marginTop:8}}>
            {worldEvents.map(evt => (
              <div key={evt.id} style={{fontSize:13,lineHeight:1.7,color:'var(--color-ink-2)'}}>
                {evt.narrative}
              </div>
            ))}
          </div>
        </section>
      )}

      {npcEvents.length > 0 && (
        <section className="card-porcelain x-section">
          <span className="mono-label">NPC 互动</span>
          <div style={{display:'flex',flexDirection:'column',gap:8,marginTop:8}}>
            {npcEvents.map(evt => (
              <div key={evt.id} style={{fontSize:13,lineHeight:1.7}}>
                {evt.narrative}
              </div>
            ))}
          </div>
        </section>
      )}

      {events.length === 0 && (
        <p className="x-empty">暂无日志记录。开始你的修仙之旅，一切经历都将被铭记。</p>
      )}
    </div>
  );
}
