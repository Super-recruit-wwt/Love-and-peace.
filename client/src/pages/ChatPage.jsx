import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { get, post, del } from '../api';

export default function ChatPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [character, setCharacter] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [typingText, setTypingText] = useState(''); // real-time AI preview
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const lastInteractionRef = useRef(Date.now());
  const proactiveTimerRef = useRef(null);

  // Schedule random proactive check
  const scheduleProactive = useCallback(() => {
    if (proactiveTimerRef.current) clearTimeout(proactiveTimerRef.current);

    // Random delay between 2 and 8 minutes (in ms)
    const minDelay = 120000;
    const maxDelay = 480000;
    const delay = minDelay + Math.random() * (maxDelay - minDelay);

    proactiveTimerRef.current = setTimeout(async () => {
      // Check if user has been idle (no messages sent) since last interaction
      const idleTime = Date.now() - lastInteractionRef.current;
      if (idleTime < minDelay) {
        // User interacted recently, reschedule
        scheduleProactive();
        return;
      }

      try {
        const result = await post(`/characters/${id}/proactive`, {});
        if (result && result.content) {
          setMessages(prev => {
            // Avoid duplicate messages
            if (prev.length > 0 && prev[prev.length - 1].id === result.id) return prev;
            return [...prev, result];
          });
        }
      } catch (_) {
        // Silent fail
      }

      // Reschedule for next random interval
      scheduleProactive();
    }, delay);
  }, [id]);

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [chars, msgs] = await Promise.all([
        get('/characters'),
        get(`/characters/${id}/messages?limit=100`),
      ]);
      const char = chars.find(c => c.id === parseInt(id));
      if (!char) {
        setError('角色不存在');
        setLoading(false);
        return;
      }
      setCharacter(char);
      setMessages(msgs.messages || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Start proactive messaging when chat page is ready
  useEffect(() => {
    if (!loading && character) {
      scheduleProactive();
    }
    return () => {
      if (proactiveTimerRef.current) clearTimeout(proactiveTimerRef.current);
    };
  }, [loading, character, scheduleProactive]);

  useEffect(() => {
    if (!loading && character && messages.length === 0) {
      setInput('你好呀～');
    }
  }, [loading]);

  const handleSend = useCallback(async (msg) => {
    const text = msg || input.trim();
    if (!text || sending) return;

    const userMsg = { id: Date.now(), role: 'user', content: text, created_at: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setSending(true);

    try {
      const reply = await post(`/characters/${id}/chat`, { message: text });
      const newMessages = [reply];
      if (reply.more && reply.more.length > 0) {
        newMessages.push(...reply.more);
      }
      setMessages(prev => [...prev, ...newMessages]);
      lastInteractionRef.current = Date.now();
    } catch (err) {
      const errMsg = { id: Date.now() + 1, role: 'assistant', content: '抱歉，消息发送失败了，请稍后重试。', created_at: new Date().toISOString() };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setSending(false);
      setTimeout(() => document.getElementById('chatInput')?.focus(), 10);
    }
  }, [input, sending, id]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClearHistory = async () => {
    if (!confirm('确定清空所有对话记录吗？此操作不可恢复。')) return;
    try {
      await del(`/characters/${id}/messages`);
      setMessages([]);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteChar = async () => {
    if (!confirm('确定删除这个角色吗？所有对话记录也将被删除。')) return;
    try {
      await del(`/characters/${id}`);
      navigate('/chat');
    } catch (err) {
      alert(err.message);
    }
  };

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.loadingText}>加载中…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.loadingText}>{error}</div>
        <Link to="/chat" style={styles.backLink}>返回角色列表</Link>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Top bar */}
      <div style={styles.topbar}>
        <Link to="/chat" style={styles.backBtn}>← 伙伴</Link>
        <div style={styles.charInfo}>
          <div style={{
            ...styles.avatarDot,
            background: charAvatarGradient(character?.avatar_color),
          }} />
          <span style={styles.charName}>{character?.name}</span>
          {/* Emotional state indicator */}
          <span style={styles.moodTag}>
            {moodEmoji[character?.mood] || '😊'}
          </span>
        </div>
        <div style={styles.topActions}>
          {!character?.preset_id && (
            <button onClick={handleDeleteChar} style={styles.actionBtn} title="删除角色">🗑️</button>
          )}
          <button onClick={handleClearHistory} style={styles.actionBtn} title="清空对话">🔄</button>
        </div>
      </div>

      {/* Messages */}
      <div style={styles.messagesArea}>
        {messages.length === 0 && (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>💬</div>
            <div style={styles.emptyText}>发送第一条消息，开始和 {character?.name} 聊天吧</div>
          </div>
        )}
        {messages.map(msg => (
          <div
            key={msg.id}
            style={{
              ...styles.messageRow,
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            {msg.role !== 'user' && (
              <div style={{
                ...styles.avatarDot,
                background: charAvatarGradient(character?.avatar_color),
                marginRight: '8px',
              }} />
            )}
            <div style={{
              ...styles.bubble,
              background: msg.role === 'user' ? 'var(--bubble-user)' : 'var(--bubble-ai)',
              color: msg.role === 'user' ? 'var(--bubble-user-text)' : 'var(--bubble-ai-text)',
              borderRadius: msg.role === 'user'
                ? '16px 16px 4px 16px'
                : '16px 16px 16px 4px',
            }}>
              {msg.content}
            </div>
            {msg.role === 'user' && (
              <div style={{
                ...styles.avatarDot,
                background: 'var(--accent)',
                marginLeft: '8px',
              }} />
            )}
          </div>
        ))}
        {sending && (
          <div style={{ ...styles.messageRow, justifyContent: 'flex-start' }}>
            <div style={{
              ...styles.avatarDot,
              background: charAvatarGradient(character?.avatar_color),
              marginRight: '8px',
            }} />
            <div style={styles.typingBubble}>
              <span style={styles.typingDot} />
              <span style={{ ...styles.typingDot, animationDelay: '0.15s' }} />
              <span style={{ ...styles.typingDot, animationDelay: '0.3s' }} />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div style={styles.inputArea}>
        <input
          id="chatInput"
          ref={inputRef}
          style={styles.textInput}
          type="text"
          placeholder="输入消息…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          style={styles.sendBtn}
          onClick={() => handleSend()}
          disabled={sending || !input.trim()}
        >
          发送
        </button>
      </div>
    </div>
  );
}

const moodEmoji = {
  joyful: '😊', content: '😌', calm: '😶', excited: '🤩',
  anxious: '😰', melancholic: '😔', confident: '💪',
};

function charAvatarGradient(color) {
  const gradients = {
    '#f472b6': 'linear-gradient(135deg, #f472b6, #fb7185)',
    '#fbbf24': 'linear-gradient(135deg, #fbbf24, #f59e0b)',
    '#6366f1': 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    '#f87171': 'linear-gradient(135deg, #f87171, #ef4444)',
    '#818cf8': 'linear-gradient(135deg, #818cf8, #6366f1)',
    '#fb923c': 'linear-gradient(135deg, #fb923c, #f97316)',
  };
  return gradients[color] || gradients['#6366f1'];
}

const styles = {
  container: {
    display: 'flex', flexDirection: 'column', height: '100vh',
    maxWidth: '640px', margin: '0 auto',
    background: 'var(--bg-primary)',
  },
  loadingContainer: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', minHeight: '100vh', gap: '16px',
  },
  loadingText: { color: 'var(--text-secondary)', fontSize: '16px' },
  backLink: { color: 'var(--accent)', fontSize: '15px' },
  topbar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 16px', background: 'var(--bg-secondary)',
    borderBottom: '1px solid var(--border-color)',
    flexShrink: 0,
  },
  backBtn: {
    background: 'none', border: 'none', color: 'var(--accent)',
    fontSize: '15px', cursor: 'pointer', textDecoration: 'none',
  },
  charInfo: {
    display: 'flex', alignItems: 'center', gap: '10px',
  },
  avatarDot: {
    width: '36px', height: '36px', borderRadius: '50%',
    flexShrink: 0,
  },
  charName: { fontSize: '16px', fontWeight: '600' },
  moodTag: {
    fontSize: '12px', padding: '2px 8px', borderRadius: '10px',
    background: 'var(--bg-input)', marginLeft: '6px',
  },
  topActions: { display: 'flex', gap: '4px' },
  actionBtn: {
    background: 'none', border: 'none', fontSize: '18px',
    cursor: 'pointer', padding: '4px',
  },
  messagesArea: {
    flex: 1, overflowY: 'auto', padding: '16px',
    display: 'flex', flexDirection: 'column', gap: '12px',
  },
  messageRow: {
    display: 'flex', alignItems: 'flex-end', maxWidth: '100%',
  },
  bubble: {
    padding: '10px 16px', maxWidth: '75%',
    fontSize: '15px', lineHeight: '1.6',
    boxShadow: 'var(--shadow-sm)', wordBreak: 'break-word',
  },
  typingBubble: {
    display: 'flex', gap: '4px', padding: '14px 18px',
    background: 'var(--bubble-ai)', borderRadius: '16px 16px 16px 4px',
    boxShadow: 'var(--shadow-sm)',
  },
  typingDot: {
    width: '8px', height: '8px', borderRadius: '50%',
    background: 'var(--text-muted)',
    animation: 'typingBounce 0.6s infinite alternate',
  },
  emptyState: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', flex: 1, gap: '12px',
    paddingTop: '120px',
  },
  emptyIcon: { fontSize: '48px' },
  emptyText: { color: 'var(--text-muted)', fontSize: '15px' },
  inputArea: {
    display: 'flex', gap: '10px', padding: '12px 16px',
    background: 'var(--bg-secondary)',
    borderTop: '1px solid var(--border-color)',
    flexShrink: 0,
  },
  textInput: {
    flex: 1, padding: '10px 16px',
    background: 'var(--bg-input)', border: '1px solid var(--border-color)',
    borderRadius: '24px', fontSize: '15px',
    color: 'var(--text-primary)', outline: 'none',
  },
  sendBtn: {
    padding: '10px 20px',
    background: 'var(--accent)', color: '#fff',
    border: 'none', borderRadius: '24px',
    fontSize: '15px', fontWeight: '600', cursor: 'pointer',
  },
};
