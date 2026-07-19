import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { get, post } from '../api';
import { qbAvatarColor } from '../avatarColors';
import './voices.css';

const KNOWLEDGE_MAX = 20000;

/* 仿 Python 版 FileParser 的宽容 JSON 解析：尽量取出正文文字 */
function extractFromJson(raw) {
  try {
    const data = JSON.parse(raw);
    if (typeof data === 'string') return data;
    if (Array.isArray(data)) {
      if (data.every(x => typeof x === 'string')) return data.join('\n\n');
      const parts = data.map(item => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          for (const key of ['text', 'content', 'message', 'body', 'description']) {
            if (typeof item[key] === 'string') {
              return item.title ? `# ${item.title}\n\n${item[key]}` : item[key];
            }
          }
        }
        return null;
      }).filter(Boolean);
      return parts.length ? parts.join('\n\n') : raw;
    }
    if (data && typeof data === 'object') {
      for (const key of ['text', 'content', 'message', 'body', 'description', 'knowledge']) {
        if (typeof data[key] === 'string') {
          return data.title ? `# ${data.title}\n\n${data[key]}` : data[key];
        }
      }
    }
    return raw;
  } catch {
    return raw;
  }
}

export default function VoicesNewPage() {
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const [personas, setPersonas] = useState([]);
  const [topic, setTopic] = useState('');
  const [chosen, setChosen] = useState([]);
  const [knowledge, setKnowledge] = useState('');
  const [files, setFiles] = useState([]); // { name, content }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    get('/voices/personas').then(setPersonas).catch(() => setPersonas([]));
  }, []);

  const togglePersona = (id) => {
    setChosen(prev => prev.includes(id)
      ? prev.filter(x => x !== id)
      : prev.length >= 5 ? prev : [...prev, id]);
  };

  const handleFiles = async (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
    const parsed = [];
    for (const f of picked) {
      if (!/\.(md|txt|json)$/i.test(f.name)) {
        setError(`暂不支持 ${f.name} 的格式（可用 md / txt / json）`);
        continue;
      }
      const raw = await f.text();
      parsed.push({
        name: f.name,
        content: /\.json$/i.test(f.name) ? extractFromJson(raw) : raw,
      });
    }
    if (parsed.length) {
      setFiles(prev => [...prev, ...parsed.filter(p => !prev.some(x => x.name === p.name))]);
      setError('');
    }
  };

  const mergedKnowledge = [
    knowledge.trim(),
    ...files.map(f => `【文件: ${f.name}】\n${f.content.trim()}`),
  ].filter(Boolean).join('\n\n');

  const overLimit = mergedKnowledge.length > KNOWLEDGE_MAX;
  const ready = topic.trim() && chosen.length >= 2 && chosen.length <= 5 && !overLimit && !busy;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!ready) {
      if (!topic.trim()) setError('先写下想讨论的议题');
      else if (chosen.length < 2) setError('至少选择 2 位讨论成员');
      else if (overLimit) setError(`背景资料过长（上限 ${KNOWLEDGE_MAX} 字）`);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await post('/voices', {
        topic: topic.trim(),
        persona_ids: chosen,
        knowledge: mergedKnowledge || undefined,
        knowledge_files: files.map(f => ({ name: f.name })),
      });
      navigate(`/voices/${res.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="voices-wrap" style={{ maxWidth: 760 }}>
      <div className="fade-rise">
        <Link to="/voices" className="voices-back">← 众声</Link>
        <p className="mono-label" style={{ marginTop: 24 }}>New Discussion</p>
        <h1 className="t-heading voices-title">发起一场讨论</h1>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="voices-form-block fade-rise delay-1">
          <label className="mono-label voices-label" htmlFor="voices-topic">议题</label>
          <div className="field-inkstone">
            <input
              id="voices-topic"
              className="input-inkstone voices-topic-input"
              placeholder="今日想让他们聊些什么？"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              maxLength={120}
              autoFocus
            />
          </div>
        </div>

        <div className="voices-form-block fade-rise delay-2">
          <label className="mono-label voices-label">成员 · 选 2 至 5 位（{chosen.length}/5）</label>
          <div className="voices-personas">
            {personas.map(p => {
              const selected = chosen.includes(p.id);
              return (
                <button
                  type="button"
                  key={p.id}
                  className={`voices-persona ${selected ? 'selected' : ''}`}
                  onClick={() => togglePersona(p.id)}
                  aria-pressed={selected}
                >
                  <span className="voices-persona-head">
                    <span
                      className="avatar-circle"
                      style={{ background: qbAvatarColor(p.avatar_color), width: 36, height: 36, fontSize: 16 }}
                    >
                      {p.avatar_char}
                    </span>
                    <span className="voices-persona-name">{p.name}</span>
                    <span className="voices-persona-check">{selected ? '入席' : ''}</span>
                  </span>
                  <span className="voices-persona-tagline">「{p.tagline}」</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="voices-form-block fade-rise delay-3">
          <label className="mono-label voices-label" htmlFor="voices-knowledge">
            背景资料 · 可选
          </label>
          <textarea
            id="voices-knowledge"
            className="voices-textarea"
            placeholder="粘贴希望大家在讨论时参考的背景信息…"
            value={knowledge}
            onChange={(e) => setKnowledge(e.target.value)}
          />
          <div className="voices-files">
            <button type="button" className="btn-outline" onClick={() => fileRef.current?.click()}>
              添加文件（md / txt / json）
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".md,.txt,.json"
              multiple
              hidden
              onChange={handleFiles}
            />
            {files.map(f => (
              <span key={f.name} className="voices-file-chip">
                {f.name}
                <button
                  type="button"
                  className="voices-file-x"
                  aria-label={`移除 ${f.name}`}
                  onClick={() => setFiles(prev => prev.filter(x => x.name !== f.name))}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          {mergedKnowledge.length > 0 && (
            <div className={`voices-count ${overLimit ? 'over' : ''}`}>
              {mergedKnowledge.length} / {KNOWLEDGE_MAX}
            </div>
          )}
        </div>

        <div className="voices-submit fade-rise delay-3">
          <button type="submit" className={`btn-primary ${ready ? '' : 'is-idle'}`}>
            {busy ? '正在开席…' : '开始讨论'}
          </button>
          {error && <span className="voices-error">{error}</span>}
        </div>
      </form>
    </div>
  );
}
