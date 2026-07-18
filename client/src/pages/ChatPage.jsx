import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { get, post, del } from '../api';
import { qbAvatarColor } from '../avatarColors';
import './chat.css';

export default function ChatPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [character, setCharacter] = useState(null);
  const [allChars, setAllChars] = useState([]);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef(null);
  const lastInteractionRef = useRef(Date.now());
  const proactiveTimerRef = useRef(null);
  const proactiveCountRef = useRef(0); // 连续主动消息计数，用户回复后清零

  useEffect(() => { loadData(); }, [id]);

  const loadData = async () => {
    setLoading(true);
    setError('');
    proactiveCountRef.current = 0; // 切换角色后重新计数
    try {
      const [chars, msgs] = await Promise.all([
        get('/characters'),
        get(`/characters/${id}/messages?limit=100`),
      ]);
      const char = chars.find(c => c.id === parseInt(id));
      if (!char) { setError('角色不存在'); setLoading(false); return; }
      setCharacter(char);
      setAllChars(chars);
      setMessages(msgs.messages || []);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const scheduleProactive = useCallback(() => {
    if (proactiveTimerRef.current) clearTimeout(proactiveTimerRef.current);
    const minDelay = 120000, maxDelay = 480000;
    const delay = minDelay + Math.random() * (maxDelay - minDelay);
    proactiveTimerRef.current = setTimeout(async () => {
      // 连续主动消息最多 2 条：用户不回复就安静下来
      if (proactiveCountRef.current >= 2) return;
      const idleTime = Date.now() - lastInteractionRef.current;
      if (idleTime < minDelay) { scheduleProactive(); return; }
      try {
        const result = await post(`/characters/${id}/proactive`, {});
        if (result && result.content) {
          proactiveCountRef.current += 1;
          setMessages(prev => {
            if (prev.length > 0 && prev[prev.length - 1].id === result.id) return prev;
            return [...prev, result];
          });
        }
      } catch (_) {}
      if (proactiveCountRef.current < 2) scheduleProactive();
    }, delay);
  }, [id]);

  useEffect(() => {
    if (!loading && character) scheduleProactive();
    return () => { if (proactiveTimerRef.current) clearTimeout(proactiveTimerRef.current); };
  }, [loading, character, scheduleProactive]);

  useEffect(() => {
    if (!loading && character && messages.length === 0) setInput('你好呀～');
  }, [loading]);

  const handleSend = useCallback(async (msg) => {
    const text = msg || input.trim();
    if (!text || sending) return;
    const userMsg = { id: Date.now(), role: 'user', content: text, created_at: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setSending(true);
    proactiveCountRef.current = 0; // 用户开口，重置连发计数
    try {
      const reply = await post(`/characters/${id}/chat`, { message: text });
      const newMessages = [reply];
      if (reply.more && reply.more.length > 0) newMessages.push(...reply.more);
      setMessages(prev => [...prev, ...newMessages]);
      lastInteractionRef.current = Date.now();
    } catch (err) {
      const errMsg = { id: Date.now() + 1, role: 'assistant', content: '抱歉，消息发送失败了，请稍后重试。', created_at: new Date().toISOString() };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setSending(false);
      scheduleProactive(); // 唤醒可能已安静的主动消息循环
    }
  }, [input, sending, id, scheduleProactive]);

  const handleClearHistory = async () => {
    if (!confirm('确定清空所有对话记录吗？此操作不可恢复。')) return;
    try { await del(`/characters/${id}/messages`); setMessages([]); }
    catch (err) { alert(err.message); }
  };

  const handleDeleteChar = async () => {
    if (!confirm('确定删除这个角色吗？所有对话记录也将被删除。')) return;
    try { await del(`/characters/${id}`); navigate('/chat'); }
    catch (err) { alert(err.message); }
  };

  if (loading) {
    return (
      <div className="chat-status">
        <span className="seal" aria-hidden="true">愛</span>
        <span className="mono-label">loading</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="chat-status">
        <span className="seal" aria-hidden="true">愛</span>
        <span className="t-card">{error}</span>
        <Link to="/chat" className="btn-link">返回角色列表</Link>
      </div>
    );
  }

  const avatarBg = qbAvatarColor(character?.avatar_color);

  return (
    <div className="chat-shell">
      {/* 联系人侧栏（桌面端） */}
      <aside className="chat-sidebar">
        <div className="chat-sidebar-head">
          <span className="mono-label">Companions</span>
          <Link to="/" className="chat-sidebar-back">门户</Link>
        </div>
        <div className="chat-sidebar-list">
          {allChars.map(c => (
            <div
              key={c.id}
              className={`row-hairline clickable chat-sidebar-row${c.id === character?.id ? ' active' : ''}`}
              onClick={() => c.id !== character?.id && navigate(`/chat/${c.id}`)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && c.id !== character?.id && navigate(`/chat/${c.id}`)}
            >
              <span
                className="avatar-circle"
                style={{ background: qbAvatarColor(c.avatar_color), width: 36, height: 36, fontSize: 15 }}
              >
                {c.name.slice(-1)}
              </span>
              <span className="chat-sidebar-name">{c.name}</span>
            </div>
          ))}
        </div>
        <button className="btn-outline chat-sidebar-new" onClick={() => navigate('/create')}>
          ＋ 新伙伴
        </button>
      </aside>

      {/* 主对话区 */}
      <div className="chat-main">
        <div className="chat-topbar">
          <Link to="/chat" className="chat-back">← 伙伴</Link>
          <div className="chat-charinfo">
            <span className="avatar-circle" style={{ background: avatarBg, width: 32, height: 32, fontSize: 14 }}>
              {character?.name?.slice(-1)}
            </span>
            <span className="chat-charname">{character?.name}</span>
            {character?.mood && (
              <span className="mono-label">{MOOD_CN[character.mood] || character.mood}</span>
            )}
          </div>
          <div className="chat-actions">
            {!character?.preset_id && (
              <button onClick={handleDeleteChar} className="chat-action">删除角色</button>
            )}
            <button onClick={handleClearHistory} className="chat-action">清空对话</button>
          </div>
        </div>

        <div className="chat-messages">
          {messages.length === 0 && (
            <div className="chat-empty">
              <span className="seal" aria-hidden="true">愛</span>
              <div className="chat-empty-title">第一句话，由你开启</div>
              <p className="t-caption">和 {character?.name} 说点什么吧</p>
            </div>
          )}
          {messages.map(msg => (
            <div key={msg.id} className={`chat-msg ${msg.role === 'user' ? 'from-user' : 'from-ai'}`}>
              <div className="chat-msg-row">
                {msg.role !== 'user' && (
                  <span className="avatar-circle" style={{ background: avatarBg, width: 36, height: 36, fontSize: 15 }}>
                    {character?.name?.slice(-1)}
                  </span>
                )}
                <div className={`bubble ${msg.role === 'user' ? 'bubble--user' : 'bubble--ai'}`}>
                  {msg.content}
                </div>
              </div>
              <div className="chat-time">{formatTime(msg.created_at)}</div>
            </div>
          ))}
          {sending && (
            <div className="chat-msg from-ai">
              <div className="chat-msg-row">
                <span className="avatar-circle" style={{ background: avatarBg, width: 36, height: 36, fontSize: 15 }}>
                  {character?.name?.slice(-1)}
                </span>
                <div className="bubble bubble--ai chat-typing">
                  <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="chat-inputbar">
          <form onSubmit={e => { e.preventDefault(); handleSend(); }} className="chat-form">
            <div className="field-inkstone chat-field">
              <input
                autoFocus
                className="input-inkstone"
                type="text"
                placeholder="输入消息…"
                value={input}
                onChange={e => setInput(e.target.value)}
              />
            </div>
            <button
              className={`btn-primary chat-send${sending || !input.trim() ? ' is-idle' : ''}`}
              type="submit"
            >
              发送
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

const MOOD_CN = {
  joyful: '愉悦', content: '安然', calm: '平静', excited: '雀跃',
  anxious: '不安', melancholic: '低落', confident: '笃定',
};

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (d.toDateString() === now.toDateString()) return time;
  return `${d.getMonth() + 1}/${d.getDate()} ${time}`;
}
