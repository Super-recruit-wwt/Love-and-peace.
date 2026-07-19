import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { get, post } from '../api';
import { qbAvatarColor } from '../avatarColors';
import './voices.css';

const AUTO_MAX = 8;

function fmtTime(s) {
  if (!s) return '';
  const d = new Date(String(s).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${mm}.${dd} ${hh}:${mi}`;
}

export default function VoicesRoomPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [busy, setBusy] = useState(false);
  const [pendingSpeaker, setPendingSpeaker] = useState(null);
  const [input, setInput] = useState('');
  const [auto, setAuto] = useState(false);
  const [autoRound, setAutoRound] = useState(0);
  const [autoPaused, setAutoPaused] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef(null);
  const busyRef = useRef(false);

  useEffect(() => {
    let alive = true;
    get(`/voices/${id}`)
      .then(d => { if (alive) { setData(d); setStatus('ready'); } })
      .catch(() => { if (alive) setStatus('error'); });
    return () => { alive = false; };
  }, [id]);

  // 消息变化时滚到底部
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [data?.messages?.length, pendingSpeaker]);

  const participants = data?.participants || [];
  const nextSpeaker = participants.length
    ? participants[(data?.next_turn || 0) % participants.length]
    : null;

  const advance = useCallback(async (participantId = null, fromAuto = false) => {
    if (busyRef.current || !data || data.readonly) return;
    const speaker = participantId
      ? participants.find(p => p.id === participantId)
      : nextSpeaker;
    if (!speaker) return;

    busyRef.current = true;
    setBusy(true);
    setPendingSpeaker(speaker);
    setError('');
    if (!fromAuto) { setAutoRound(0); setAutoPaused(false); }

    try {
      const res = await post(`/voices/${id}/advance`,
        participantId ? { participant_id: participantId } : {});
      setData(prev => prev && ({
        ...prev,
        next_turn: res.next_turn,
        messages: [...prev.messages, res.message],
      }));
    } catch (err) {
      setError(err.message);
      if (fromAuto) setAuto(false);
    } finally {
      busyRef.current = false;
      setBusy(false);
      setPendingSpeaker(null);
    }
  }, [data, id, participants, nextSpeaker]);

  // 自动接龙：空闲时隔一秒推进，连续 AUTO_MAX 轮后暂停
  useEffect(() => {
    if (!auto || busy || !data || data.readonly) return undefined;
    if (autoRound >= AUTO_MAX) {
      setAuto(false);
      setAutoPaused(true);
      return undefined;
    }
    const t = setTimeout(() => {
      setAutoRound(r => r + 1);
      advance(null, true);
    }, 1000);
    return () => clearTimeout(t);
  }, [auto, busy, autoRound, data, advance]);

  const toggleAuto = () => {
    setAutoPaused(false);
    setAutoRound(0);
    setAuto(a => !a);
  };

  const handleInterject = async (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || !data || data.readonly) return;
    setError('');
    setAutoRound(0);
    setAutoPaused(false);
    try {
      const msg = await post(`/voices/${id}/interject`, { content: text });
      setInput('');
      setData(prev => prev && ({ ...prev, messages: [...prev.messages, msg] }));
      // 同 Python 版：插话后让当前轮次的 AI 接着回应
      if (!busyRef.current) advance();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleExport = () => {
    if (!data) return;
    const lines = [
      `# 众声 · ${data.topic}`,
      '',
      `- 日期：${fmtTime(data.created_at) || data.created_at || ''}`,
      `- 成员：${participants.map(p => p.name).join('、')}`,
    ];
    if (data.knowledge_files?.length) {
      lines.push(`- 背景资料：${data.knowledge_files.map(f => f.name).join('、')}`);
    }
    lines.push('', '---', '');
    for (const m of data.messages) {
      if (m.speaker_type === 'system') {
        lines.push(`> ${m.content}`, '');
      } else {
        const tag = m.speaker_type === 'human' ? `${m.speaker_name}（人类）` : m.speaker_name;
        lines.push(`**${tag}**：${m.content}`, '');
      }
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `众声-${data.topic.slice(0, 20)}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (status === 'loading') {
    return (
      <div className="voices-status">
        <span className="seal" aria-hidden="true">聲</span>
        <span className="mono-label">loading</span>
      </div>
    );
  }

  if (status === 'error' || !data) {
    return (
      <div className="voices-status">
        <span className="seal" aria-hidden="true">聲</span>
        <p className="t-lead">这场讨论不存在，或已散席。</p>
        <Link to="/voices" className="btn-outline">回到众声</Link>
      </div>
    );
  }

  const readonly = data.readonly;

  return (
    <div className="voices-room">
      <header className="voices-topbar">
        <Link to="/voices" className="voices-back">← 众声</Link>
        <div className="voices-topbar-mid">
          <div className="voices-room-topic">{data.topic}</div>
          <div className="voices-room-meta">
            {participants.length} 位成员 · {data.messages.length} 条发言
            {readonly && ' · 示例回放，只读'}
            {!readonly && data.has_knowledge && ' · 有背景资料'}
          </div>
        </div>
        <button className="voices-export" onClick={handleExport}>导出 MD</button>
      </header>

      <div className="voices-members">
        {participants.map(p => (
          <button
            key={p.id}
            className={`voices-member ${readonly ? 'readonly' : ''} ${!readonly && nextSpeaker?.id === p.id ? 'is-next' : ''}`}
            title={readonly ? p.name : `请 ${p.name} 发言`}
            onClick={() => !readonly && advance(p.id)}
          >
            <span className="avatar-circle" style={{ background: qbAvatarColor(p.avatar_color) }}>
              {p.avatar_char || p.name.slice(-1)}
            </span>
            <span className="voices-member-name">{p.name}</span>
          </button>
        ))}
      </div>

      <main className="voices-messages" ref={scrollRef}>
        {data.messages.map(m => {
          if (m.speaker_type === 'system') {
            return (
              <div key={m.id} className="voices-sysline">
                <span className="mono-label">{m.content}</span>
              </div>
            );
          }
          const p = m.participant_id ? participants.find(x => x.id === m.participant_id) : null;
          const isHuman = m.speaker_type === 'human';
          return (
            <div key={m.id} className={`voices-msg ${isHuman ? 'from-human' : 'from-agent'}`}>
              {!isHuman && (
                <span
                  className="avatar-circle"
                  style={{ background: qbAvatarColor(p?.avatar_color), width: 38, height: 38, fontSize: 16 }}
                  aria-hidden="true"
                >
                  {p?.avatar_char || m.speaker_name.slice(-1)}
                </span>
              )}
              <div className="voices-msg-body">
                <div className="voices-msg-head">
                  <span className="voices-msg-name">{m.speaker_name}</span>
                  <span className="voices-msg-time">{fmtTime(m.created_at)}</span>
                </div>
                <div className={`bubble ${isHuman ? 'bubble--user' : 'bubble--ai'}`}>
                  {m.content}
                </div>
              </div>
            </div>
          );
        })}

        {pendingSpeaker && (
          <div className="voices-typing">
            <span
              className="avatar-circle"
              style={{ background: qbAvatarColor(pendingSpeaker.avatar_color), width: 38, height: 38, fontSize: 16 }}
              aria-hidden="true"
            >
              {pendingSpeaker.avatar_char}
            </span>
            <span className="voices-typing-note">
              {pendingSpeaker.name} 正在思考
              <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
            </span>
          </div>
        )}

        {autoPaused && (
          <div className="voices-hint">已连续接龙 {AUTO_MAX} 轮，自动暂停 —— 你来说两句？</div>
        )}
      </main>

      {!readonly && (
        <footer className="voices-controlbar">
          {error && <div className="voices-error">{error}</div>}
          <div className="voices-auto-row">
            <button
              type="button"
              className={`chip ${auto ? 'selected' : ''}`}
              onClick={toggleAuto}
              aria-pressed={auto}
            >
              自动接龙
            </button>
            {auto && (
              <span className="voices-auto-note">round {Math.min(autoRound + 1, AUTO_MAX)} / {AUTO_MAX}</span>
            )}
          </div>
          <form className="voices-ctl-row" onSubmit={handleInterject}>
            <div className="field-inkstone voices-field">
              <input
                className="input-inkstone"
                placeholder="以你的身份插话，大家会接着回应…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                autoFocus
              />
            </div>
            <button
              type="submit"
              className={`btn-outline voices-interject ${input.trim() ? '' : 'is-idle'}`}
            >
              插话
            </button>
            <button
              type="button"
              className={`btn-primary voices-next ${busy ? 'is-idle' : ''}`}
              onClick={() => advance()}
            >
              请{nextSpeaker?.name}发言 →
            </button>
          </form>
        </footer>
      )}
    </div>
  );
}
