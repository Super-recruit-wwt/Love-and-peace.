import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { formatAge, formatYears } from './format';
import './xianxia-common.css';
import './main.css';

const QUICK_ACTIONS = ['修炼', '探索四周', '找人交谈', '休整'];
const PAGE_SIZE = 50;

function parseOptions(raw) {
  if (!raw) return null;
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) && arr.length > 0 ? arr : null;
  } catch { return null; }
}

function parseRewards(raw) {
  if (!raw) return null;
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) && arr.length > 0 ? arr : null;
  } catch { return null; }
}

export default function MainPage() {
  const { characterId } = useParams();
  const navigate = useNavigate();
  const [character, setCharacter] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [worldState, setWorldState] = useState({});
  const [suggestions, setSuggestions] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [timer, setTimer] = useState(null);
  const [timerNarrative, setTimerNarrative] = useState('');
  const timelineRef = useRef(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    loadCharacter();
    loadWorldState();
  }, [characterId]);

  useEffect(() => {
    if (stickToBottom.current && timelineRef.current) {
      timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
    }
  }, [timeline]);

  // 倒计时 tick
  useEffect(() => {
    if (!timer || timer <= 0) {
      if (timer === 0) {
        // 计时结束：调用服务端结算（突破/炼制），再刷新角色状态
        (async () => {
          try {
            await api.post(`/xianxia/characters/${characterId}/settle`, {});
          } catch { /* 结算失败不阻塞，刷新后重试 */ }
          setTimer(null);
          setTimerNarrative('');
          loadCharacter();
        })();
      }
      return;
    }
    const id = setTimeout(() => setTimer(t => t - 1), 1000);
    return () => clearTimeout(id);
  }, [timer]);

  async function loadCharacter() {
    try {
      const res = await api.get(`/xianxia/characters/${characterId}`);
      setCharacter(res);
      // 检查倒计时
      if (res.timer_remaining && res.timer_remaining > 0) {
        setTimer(res.timer_remaining);
        setTimerNarrative(res.timer_narrative || '闭关中……');
      }
      // 加载时间线
      const tlRes = await api.get(`/xianxia/characters/${characterId}/timeline?limit=${PAGE_SIZE}`);
      setTimeline(tlRes.events);
      setHasMore(tlRes.events.length === PAGE_SIZE);
      stickToBottom.current = true;
      // 建议选项：取最近一条带选项的叙事
      const latestWithOptions = [...tlRes.events].reverse().find(e => parseOptions(e.options));
      setSuggestions(parseOptions(latestWithOptions?.options) || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  async function loadMore() {
    if (loadingMore || timeline.length === 0) return;
    setLoadingMore(true);
    try {
      const oldest = timeline[0].id;
      const res = await api.get(`/xianxia/characters/${characterId}/timeline?limit=${PAGE_SIZE}&before=${oldest}`);
      stickToBottom.current = false; // 翻历史时不拽到底部
      setTimeline(prev => [...res.events, ...prev]);
      setHasMore(res.events.length === PAGE_SIZE);
    } catch (err) { console.error(err); }
    finally { setLoadingMore(false); }
  }

  async function loadWorldState() {
    try {
      const res = await api.get('/xianxia/world-state');
      setWorldState(res.world_state);
    } catch { /* 世界状态加载失败不阻塞 */ }
  }

  async function handleAction(actionText) {
    const text = (actionText || input).trim();
    if (!text || acting || (timer && timer > 0)) return;
    setActing(true);

    try {
      // 先将用户输入加入时间线（决策回顾：与服务端入库的 action 事件一致）
      const userEvent = {
        id: `local-${Date.now()}`,
        game_time: formatAge(character.game_age),
        event_type: 'action',
        narrative: text
      };
      setTimeline(prev => [...prev, userEvent]);
      setInput('');

      // 调用后端 LLM 处理
      const res = await api.post(`/xianxia/characters/${characterId}/action`, { action: text });

      // 如果上一段倒计时在本次行动前被结算，先展示结算结果
      if (res.settled) {
        setTimeline(prev => [...prev, {
          id: `local-s-${Date.now()}`,
          game_time: '',
          event_type: 'breakthrough',
          narrative: res.settled
        }]);
      }

      const aiEvent = {
        id: `local-n-${Date.now()}`,
        game_time: res.gameTime || formatAge(character.game_age),
        event_type: 'narrative',
        narrative: res.narrative,
        options: res.options ? JSON.stringify(res.options) : null,
        rewards: res.rewards ? JSON.stringify(res.rewards) : null
      };
      setTimeline(prev => [...prev, aiEvent]);

      // 寿元耗尽：角色死亡
      if (res.died && res.deathNarrative) {
        setTimeline(prev => [...prev, {
          id: `local-d-${Date.now()}`,
          game_time: res.gameTime || '',
          event_type: 'death',
          narrative: res.deathNarrative
        }]);
      }

      // 更新建议选项（AI/剧本每回合给出；无则隐藏"当下可行"行）
      setSuggestions(res.options && res.options.length > 0 ? res.options : []);

      // 如果触发了倒计时
      if (res.timer) {
        setTimer(res.timer.remaining);
        setTimerNarrative(res.timer.narrative);
      }

      // 刷新角色状态
      const updated = await api.get(`/xianxia/characters/${characterId}`);
      setCharacter(updated);

      setActing(false);
    } catch (err) {
      console.error(err);
      const errEvent = {
        id: `local-e-${Date.now()}`,
        game_time: '',
        event_type: 'system',
        narrative: `（行动处理失败：${err.message || '请重试'}）`
      };
      setTimeline(prev => [...prev, errEvent]);
      setActing(false);
    }
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  if (loading) return <div className="x-loading">加载中……</div>;
  if (!character) return <div className="x-loading">角色不存在</div>;

  const paths = character.cultivation_paths || {};
  const roots = character.spirit_roots || {};

  return (
    <div className="x-main-layout">
      {/* 左侧：世界信息 */}
      <aside className="x-panel x-panel-left">
        <div className="x-panel-header">
          <h3 className="mono-label">世界</h3>
        </div>
        <div className="x-panel-content">
          <div className="x-info-block">
            <span className="x-info-label">当前位置</span>
            <span className="x-info-value">{character.current_location}</span>
          </div>
          <div className="x-info-block">
            <span className="x-info-label">游戏时间</span>
            <span className="x-info-value">{formatAge(character.game_age)}</span>
          </div>
          {Object.keys(worldState).length > 0 ? (
            <div className="x-info-block">
              <span className="x-info-label">纪元</span>
              <span className="x-info-value">{worldState.era_name || '开天纪'} · 第{worldState.game_year || 1}年</span>
            </div>
          ) : (
            <div className="x-info-block">
              <span className="x-info-label">已知势力</span>
              <span className="x-info-value">等待探索……</span>
            </div>
          )}
        </div>
        <div className="x-panel-footer">
          <button className="btn-outline btn-sm" onClick={() => navigate(`/xianxia/${characterId}/map`)}>地图</button>
          <button className="btn-outline btn-sm" onClick={() => navigate(`/xianxia/${characterId}/journal`)}>日志</button>
          <button className="btn-outline btn-sm" onClick={() => navigate('/xianxia')}>角色列表</button>
        </div>
      </aside>

      {/* 中间：叙事对话区 */}
      <main className="x-panel x-panel-center">
        {timer !== null && timer > 0 ? (
          <div className="x-timer-lock">
            <div className="x-timer-narrative">{timerNarrative}</div>
            <div className="x-timer-countdown">{formatTime(timer)}</div>
            <div className="x-timer-hint mono-label">
              {character.timer_type === 'breakthrough' ? '突破进行中' : '炼制进行中'}
            </div>
          </div>
        ) : (
          <>
            <div className="x-timeline" ref={timelineRef}>
              {hasMore && (
                <div className="x-load-more">
                  <button className="btn-link" onClick={loadMore} disabled={loadingMore}>
                    {loadingMore ? '翻阅中……' : '加载更早的记忆'}
                  </button>
                </div>
              )}
              {timeline.length === 0 && (
                <div className="x-empty-timeline">
                  <span className="seal" aria-hidden="true">道</span>
                  <p>你的人生即将开始。输入你的第一个行动——或者从下方的建议中选择。</p>
                </div>
              )}
              {timeline.map(event => {
                const eventOptions = parseOptions(event.options);
                const eventRewards = parseRewards(event.rewards);
                return (
                  <div key={event.id} className={`x-timeline-event x-event-${event.event_type}`}>
                    <span className="x-event-time">
                      {event.event_type === 'action' ? '你 · ' : ''}{event.game_time}
                    </span>
                    <p className="x-event-text">
                      {event.event_type === 'action' ? `你：${event.narrative}` : event.narrative}
                    </p>
                    {eventRewards && (
                      <div className="x-event-rewards">
                        {eventRewards.map((r, i) => (
                          <span key={i} className={`x-reward x-reward-${r.tone || 'time'}`}>{r.text}</span>
                        ))}
                      </div>
                    )}
                    {eventOptions && (
                      <div className="x-event-options">
                        当时可选：{eventOptions.join(' / ')}
                      </div>
                    )}
                  </div>
                );
              })}
              {acting && <div className="x-typing">命运正在书写……</div>}
            </div>

            <div className="x-input-area">
              <div className="x-quick-actions">
                <span className="x-quick-label mono-label">常见行动</span>
                {QUICK_ACTIONS.map(a => (
                  <button key={a} className="chip chip-quick" onClick={() => handleAction(a)} disabled={acting}>{a}</button>
                ))}
              </div>
              {suggestions.length > 0 && (
                <div className="x-suggestions">
                  <span className="x-quick-label mono-label">当下可行</span>
                  {suggestions.map(s => (
                    <button key={s} className="chip" onClick={() => handleAction(s)} disabled={acting}>{s}</button>
                  ))}
                </div>
              )}
              <div className="x-input-row">
                <input
                  className="input-inkstone"
                  placeholder="输入你想做的事情……"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAction()}
                  disabled={acting}
                />
                <button className="btn-primary" onClick={() => handleAction()} disabled={acting || !input.trim()}>
                  行动
                </button>
              </div>
            </div>
          </>
        )}
      </main>

      {/* 右侧：个人信息 */}
      <aside className="x-panel x-panel-right">
        <div className="x-panel-header">
          <h3 className="x-panel-name">{character.name}</h3>
        </div>
        <div className="x-panel-content">
          <div className="x-info-block">
            <span className="x-info-label">寿元</span>
            <span className="x-info-value">{formatYears(character.lifespan_remaining)}</span>
          </div>
          <div className="x-info-block">
            <span className="x-info-label">生命</span>
            <span className="x-info-value">{character.health}</span>
          </div>
          <div className="x-info-block">
            <span className="x-info-label">灵力</span>
            <span className="x-info-value">{character.qi_current}/{character.qi_max}</span>
          </div>

          <div className="x-info-separator" />

          {Object.entries(paths).map(([k, v]) => v && (
            <div className="x-info-block" key={k}>
              <span className="x-info-label">{k === 'xiandao' ? '仙道' : k === 'physical' ? '肉身' : k === 'strange' ? '诡道' : k === 'artisan' ? '匠道' : '散修'}</span>
              <span className="x-info-value">{v}</span>
            </div>
          ))}

          <div className="x-info-separator" />

          <div className="x-info-block">
            <span className="x-info-label">灵根</span>
            <span className="x-info-value">
              {Object.entries(roots).map(([k,v]) => `${k}(${v})`).join(' ')}
            </span>
          </div>
          {character.special_body && (
            <div className="x-info-block">
              <span className="x-info-label">体质</span>
              <span className="x-info-value">{character.special_body}</span>
            </div>
          )}
          <div className="x-info-block">
            <span className="x-info-label">灵石</span>
            <span className="x-info-value">{character.spirit_stones}</span>
          </div>
        </div>
        <div className="x-panel-footer">
          <button className="btn-outline btn-sm" onClick={() => navigate(`/xianxia/${characterId}/profile`)}>详情</button>
        </div>
      </aside>
    </div>
  );
}
