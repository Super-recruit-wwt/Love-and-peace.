import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { get, del } from '../api';
import { qbAvatarColor } from '../avatarColors';
import './voices.css';

function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return s.slice(0, 10);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}.${mm}.${dd}`;
}

function DiscussionRow({ item, onOpen, onDelete }) {
  return (
    <div
      className="row-hairline clickable"
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
    >
      <span className="voices-avstack" aria-hidden="true">
        {item.participants.slice(0, 5).map(p => (
          <span
            key={p.id}
            className="avatar-circle"
            style={{ background: qbAvatarColor(p.avatar_color) }}
            title={p.name}
          >
            {p.avatar_char || p.name.slice(-1)}
          </span>
        ))}
      </span>
      <div className="voices-row-main">
        <div className="voices-row-topic">{item.topic}</div>
        <div className="voices-row-meta">
          {fmtDate(item.updated_at)} · {item.message_count} 条发言
          {item.knowledge_files?.length > 0 && ' · 有背景资料'}
        </div>
      </div>
      {item.is_sample ? (
        <span className="mono-label">sample</span>
      ) : (
        <button
          className="btn-danger-link voices-row-del"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
        >
          删除
        </button>
      )}
    </div>
  );
}

export default function VoicesListPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    get('/voices')
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id) => {
    if (!window.confirm('删除这场讨论？记录将不可恢复。')) return;
    try {
      await del(`/voices/${id}`);
      setItems(prev => prev.filter(x => x.id !== id));
    } catch (err) {
      alert(err.message);
    }
  };

  if (loading) {
    return (
      <div className="voices-status">
        <span className="seal" aria-hidden="true">聲</span>
        <span className="mono-label">loading</span>
      </div>
    );
  }

  const mine = items.filter(x => !x.is_sample);
  const samples = items.filter(x => x.is_sample);

  return (
    <div className="voices-wrap">
      <div className="fade-rise">
        <Link to="/" className="voices-back">← 门户</Link>
        <div className="voices-head">
          <div>
            <p className="mono-label" style={{ marginTop: 24 }}>Voices</p>
            <h1 className="t-heading voices-title">众声 · AI 圆桌</h1>
            <p className="voices-sub">
              几位人格各异的 AI 围坐论道。你可以旁听，也可以点名、插话，随时入席。
            </p>
          </div>
          <button className="btn-primary" onClick={() => navigate('/voices/new')}>
            发起新讨论
          </button>
        </div>
      </div>

      <section className="voices-section fade-rise delay-1">
        <p className="mono-label">My Discussions</p>
        {mine.length === 0 ? (
          <div className="voices-empty">
            还没有你的讨论。发起一场，或先看看下面的示例回放。
          </div>
        ) : (
          <div className="voices-section-gap">
            {mine.map(item => (
              <DiscussionRow
                key={item.id}
                item={item}
                onOpen={() => navigate(`/voices/${item.id}`)}
                onDelete={() => handleDelete(item.id)}
              />
            ))}
          </div>
        )}
      </section>

      {samples.length > 0 && (
        <section className="voices-section fade-rise delay-2">
          <p className="mono-label">Samples · 示例回放</p>
          <div className="voices-section-gap">
            {samples.map(item => (
              <DiscussionRow
                key={item.id}
                item={item}
                onOpen={() => navigate(`/voices/${item.id}`)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
