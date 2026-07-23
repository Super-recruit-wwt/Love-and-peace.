import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import './xianxia-common.css';
import './main.css';

// 关系类型中文标签（与服务端 jade.js REL_TYPE_LABELS 一致）
const REL_LABELS = {
  stranger: '陌生', acquaintance: '熟人', friend: '朋友', close_friend: '挚友',
  master: '师父', disciple: '徒弟', lover: '道侣', rival: '劲敌',
  enemy: '仇敌', blood_enemy: '血仇', debtor: '欠情', creditor: '施恩',
};
const ITEM_TYPE_LABELS = { technique: '功法', pill: '丹药', treasure: '法宝', material: '材料' };

function relText(types) {
  if (!Array.isArray(types) || types.length === 0) return '';
  return types.map(t => REL_LABELS[t] || t).join('·');
}

export default function JadePage() {
  const { characterId } = useParams();
  const navigate = useNavigate();
  const [threads, setThreads] = useState([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [activeNpcId, setActiveNpcId] = useState(null);
  const [activeThread, setActiveThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [claiming, setClaiming] = useState(null); // messageId
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [knownNpcs, setKnownNpcs] = useState([]); // 已有关系的 NPC（发起新会话用）
  const [newChatNpcId, setNewChatNpcId] = useState('');
  const msgEndRef = useRef(null);

  const loadThreads = useCallback(async () => {
    try {
      const res = await api.get(`/xianxia/characters/${characterId}/jade/threads`);
      setThreads(res.threads || []);
      setTotalUnread(res.totalUnread || 0);
    } catch { /* 轮询失败静默 */ }
  }, [characterId]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadThreads();
      // 加载角色已有关系，用于"发起新会话"下拉
      try {
        const ch = await api.get(`/xianxia/characters/${characterId}`);
        setKnownNpcs((ch.relationships || []).map(r => ({
          npcId: r.npc_id,
          npcName: r.npc_name,
          relationTypes: r.relation_types || [],
        })));
      } catch (e) { setError(e.message); }
      setLoading(false);
    })();
    // 每 30 秒刷新会话列表（未读角标/新来讯）
    const timer = setInterval(loadThreads, 30000);
    return () => clearInterval(timer);
  }, [characterId, loadThreads]);

  useEffect(() => {
    if (msgEndRef.current) msgEndRef.current.scrollIntoView({ block: 'end' });
  }, [messages]);

  async function openThread(npcId) {
    setActiveNpcId(npcId);
    setError('');
    try {
      const res = await api.get(`/xianxia/characters/${characterId}/jade/threads/${npcId}`);
      setActiveThread(res.thread);
      setMessages(res.messages || []);
      loadThreads(); // 打开即清零未读，刷新角标
    } catch (e) {
      // 尚无会话：以空白会话开启（发送第一条消息时后端自动建会话）
      const npc = knownNpcs.find(n => n.npcId === npcId);
      setActiveThread({ threadId: null, npcId, npcName: npc ? npc.npcName : '', npcIdentity: '' });
      setMessages([]);
    }
  }

  function startNewChat() {
    const npcId = parseInt(newChatNpcId, 10);
    if (!Number.isFinite(npcId)) return;
    setNewChatNpcId('');
    openThread(npcId);
  }

  async function sendMessage() {
    const content = input.trim();
    if (!content || sending || !activeNpcId) return;
    setSending(true);
    setError('');
    const optimistic = { id: `tmp-${Date.now()}`, sender: 'player', content, item_payload: null };
    setMessages(prev => [...prev, optimistic]);
    setInput('');
    try {
      const res = await api.post(`/xianxia/characters/${characterId}/jade/send`, { npcId: activeNpcId, content });
      setMessages(prev => [...prev, res.reply]);
      loadThreads();
    } catch (e) {
      setError(e.message);
      setMessages(prev => prev.filter(m => m.id !== optimistic.id));
      setInput(content);
    }
    setSending(false);
  }

  async function claimGift(msg) {
    if (claiming) return;
    setClaiming(msg.id);
    try {
      await api.post(`/xianxia/characters/${characterId}/jade/claim`, { messageId: msg.id });
      setMessages(prev => prev.map(m =>
        m.id === msg.id ? { ...m, item_payload: { ...m.item_payload, claimed: true } } : m
      ));
    } catch (e) {
      setError(e.message);
    }
    setClaiming(null);
  }

  const threadNpcIds = new Set(threads.map(t => t.npcId));
  const newChatCandidates = knownNpcs.filter(n => !threadNpcIds.has(n.npcId));

  return (
    <div className="x-page">
      <div className="x-header">
        <h1 className="t-heading">传讯玉符</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {totalUnread > 0 && <span className="x-jade-unread">{totalUnread} 条未读</span>}
          <button className="btn-outline" onClick={() => navigate(`/xianxia/${characterId}`)}>返回主界面</button>
        </div>
      </div>

      {error && <div className="x-jade-error">{error}</div>}

      <div className="x-jade-layout">
        {/* 左栏：会话列表 */}
        <aside className="card-porcelain x-jade-threads">
          <span className="mono-label">会话</span>
          <div className="x-jade-newchat">
            <select
              className="input-inkstone x-jade-select"
              value={newChatNpcId}
              onChange={e => setNewChatNpcId(e.target.value)}
            >
              <option value="">发起新会话…</option>
              {newChatCandidates.map(n => (
                <option key={n.npcId} value={n.npcId}>{n.npcName}（{relText(n.relationTypes) || '相识'}）</option>
              ))}
            </select>
            <button className="btn-outline btn-sm" onClick={startNewChat} disabled={!newChatNpcId}>发起</button>
          </div>

          <div className="x-jade-thread-list">
            {!loading && threads.length === 0 && (
              <div className="x-jade-empty">
                你还没有结识可通过玉符联络的道友。与 NPC 建立关系后，他们会出现在这里。
              </div>
            )}
            {threads.map(t => (
              <div
                key={t.threadId}
                className={`x-jade-thread${activeNpcId === t.npcId ? ' x-jade-thread-active' : ''}`}
                onClick={() => openThread(t.npcId)}
              >
                <div className="x-jade-thread-top">
                  <span className="x-jade-thread-name">{t.npcName}</span>
                  {t.unreadPlayer > 0 && <span className="x-jade-badge">{t.unreadPlayer}</span>}
                </div>
                <div className="x-row-sub">
                  {relText(t.relationTypes)}{t.npcFaction ? ` · ${t.npcFaction}` : ''}
                </div>
                {t.lastMessage && <div className="x-jade-preview">{t.lastMessage}</div>}
              </div>
            ))}
          </div>
        </aside>

        {/* 右栏：聊天区 */}
        <section className="card-porcelain x-jade-chat">
          {!activeNpcId ? (
            <div className="x-jade-empty" style={{ margin: 'auto' }}>
              选择左侧会话，或发起一次新的传讯。
            </div>
          ) : (
            <>
              <div className="x-jade-chat-header">
                <span className="mono-label">{activeThread ? activeThread.npcName : ''}</span>
                {activeThread && activeThread.npcIdentity && (
                  <span className="x-row-sub">{activeThread.npcIdentity}</span>
                )}
              </div>
              <div className="x-jade-msgs">
                {messages.map(m => (
                  <div key={m.id} className={`x-jade-msg ${m.sender === 'player' ? 'x-jade-msg-player' : 'x-jade-msg-npc'}`}>
                    <div className="x-jade-bubble">{m.content}</div>
                    {m.item_payload && (
                      <div className="x-jade-gift">
                        <div className="x-jade-gift-info">
                          <span className="x-jade-gift-name">
                            【{ITEM_TYPE_LABELS[m.item_payload.item_type] || '物品'}】{m.item_payload.name}
                          </span>
                          <span className="x-jade-gift-grade">{m.item_payload.grade}</span>
                        </div>
                        {m.item_payload.claimed ? (
                          <span className="x-jade-claimed">已领取</span>
                        ) : (
                          <button
                            className="btn-primary btn-sm"
                            disabled={claiming === m.id}
                            onClick={() => claimGift(m)}
                          >
                            {claiming === m.id ? '领取中…' : '领取'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                <div ref={msgEndRef} />
              </div>
              <div className="x-input-row">
                <input
                  className="input-inkstone"
                  value={input}
                  maxLength={500}
                  placeholder="以玉符传讯……"
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') sendMessage(); }}
                />
                <button className="btn-primary" onClick={sendMessage} disabled={sending || !input.trim()}>
                  {sending ? '传讯中…' : '发送'}
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
