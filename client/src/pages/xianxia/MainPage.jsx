import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { formatAge, formatYears } from './format';
import './xianxia-common.css';
import './main.css';

const QUICK_ACTIONS = ['修炼', '探索四周', '找人交谈', '休整'];
const PAGE_SIZE = 50;

// 三元属性悬浮说明（文案按服务端实际机制撰写）
const STAT_TIPS = {
  essence: {
    title: '精 · 体魄根基',
    lines: [
      '肉身强度与气血之本。',
      '· 切磋与探索中承伤更轻，精≥80 落败时可能凭体魄硬扛逆转',
      '· 精<30 无法承受突破冲击；突破成功率随精提升',
      '· 旅行更快、采集更多；精≥100 可徒手退散劫匪、获体修门派破格录取',
    ],
  },
  qi: {
    title: '气 · 灵力修为',
    lines: [
      '元气流转与灵力底蕴。',
      '· 修炼效率与突破成功率随气提升，突破耗时更短',
      '· 炼丹成功率更高；切磋中以气卸力进一步减伤',
      '· 气≥80 坊市议价更易，享受额外折扣',
    ],
  },
  spirit: {
    title: '神 · 神魂意志',
    lines: [
      '神识念力与心志韧性。',
      '· 探索、旅行中更易发现线索与情报',
      '· 诡道抗性：接触异象时抵御侵蚀，内视时可压制体内异化',
      '· 神≥80 炼丹品质更易出众、讲价更准；神≥100 切磋中可能偷师',
    ],
  },
};

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
  const [actionError, setActionError] = useState('');
  const [timer, setTimer] = useState(null);
  const [timerNarrative, setTimerNarrative] = useState('');
  const [hoveredItem, setHoveredItem] = useState(null);
  const [itemUseMsg, setItemUseMsg] = useState(null);
  const [statTip, setStatTip] = useState(null); // 'essence' | 'qi' | 'spirit' | null
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



  async function fetchItemKnowledge(itemId, callback) {
    try {
      var knowledge = await api.get('/xianxia/items/' + itemId + '/knowledge');
      callback(knowledge);
    } catch (e) {
      // 知识加载失败时不阻塞
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
  const items = character.items || [];
  // 行囊堆叠：相同名称+类型+品级的物品合并
  var stackedMap = {};
  items.filter(function(i) { return !i.is_equipped; }).forEach(function(item) {
    var key = item.name + '|' + item.item_type + '|' + (item.grade || '');
    if (stackedMap[key]) {
      stackedMap[key].quantity = (stackedMap[key].quantity || 1) + (item.quantity || 1);
    } else {
      stackedMap[key] = Object.assign({}, item);
    }
  });
  var inventoryItems = Object.values(stackedMap);

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

      {/* 物品悬停提示 */}
      {hoveredItem && (
        <div className="x-item-tooltip">
          <div className="x-item-tooltip-name">{hoveredItem.name}</div>
          <div className="mono-label" style={{fontSize:10,marginBottom:4}}>{hoveredItem.item_type} · {hoveredItem.grade || '凡品'}{hoveredItem.quantity > 1 ? ' · ×' + hoveredItem.quantity : ''}</div>
          <div style={{fontSize:12,lineHeight:1.7}}>
            {hoveredItem.known_effects && hoveredItem.known_effects.length > 0 && (
              <div style={{marginTop:4}}>
                <span className="mono-label" style={{fontSize:10,color:'var(--color-celadon)'}}>效果：</span>
                {hoveredItem.known_effects.map(function(e, i) { return <div key={i} style={{fontSize:11}}>• {e}</div>; })}
              </div>
            )}
            {hoveredItem.raw_effects && hoveredItem.raw_effects.length > 0 && (
              <div style={{marginTop:4}}>
                <span className="mono-label" style={{fontSize:10,color:'var(--color-ink-2)'}}>生服效果：</span>
                {hoveredItem.raw_effects.map(function(e, i) { return <div key={i} style={{fontSize:11}}>• {e}</div>; })}
              </div>
            )}
            {hoveredItem.hidden_effects && hoveredItem.hidden_effects.length > 0 && (
              <div style={{marginTop:4}}>
                <span className="mono-label" style={{fontSize:10,color:'var(--color-seal)'}}>隐藏属性：</span>
                {hoveredItem.hidden_effects.map(function(e, i) { return <div key={i} style={{fontSize:11}}>• {e}</div>; })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 物品使用反馈 */}
      {itemUseMsg && (
        <div className="x-item-use-msg" style={{
          fontSize:11,marginTop:8,padding:'6px 10px',borderRadius:'var(--radius-sm)',
          background: itemUseMsg.ok ? 'rgba(70,104,91,0.1)' : 'rgba(166,58,43,0.08)',
          color: itemUseMsg.ok ? 'var(--color-celadon)' : 'var(--color-seal)'
        }}>
          {itemUseMsg.text}
          <button className="btn-outline btn-sm" style={{fontSize:10,marginLeft:8,padding:'1px 6px'}}
            onClick={function() { setItemUseMsg(null); }}>×</button>
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
                          <span key={i} className={`x-reward x-reward-${r.tone || 'time'}`}>{r.text || r}</span>
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
                {actionError && <span className="x-action-error">{actionError}</span>}
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
          {/* 当前年龄 + 寿元 同排 */}
          <div style={{display:'flex',gap:16}}>
            <div className="x-info-block" style={{flex:1}}>
              <span className="x-info-label">当前年龄</span>
              <span className="x-info-value">{formatAge(character.game_age)}</span>
            </div>
            <div className="x-info-block" style={{flex:1}}>
              <span className="x-info-label">寿元</span>
              <span className="x-info-value">{formatYears(character.lifespan_remaining)}</span>
            </div>
          </div>

          {/* 生命 + 修为 同排 */}
          <div style={{display:'flex',gap:16}}>
            <div className="x-info-block" style={{flex:1}}>
              <span className="x-info-label">生命</span>
              <span className="x-info-value">{character.health}</span>
            </div>
            <div className="x-info-block" style={{flex:1}}>
              <span className="x-info-label">修为</span>
              <span className="x-info-value">{character.qi_current}/{character.qi_max}</span>
            </div>
          </div>

          <div className="x-info-separator" />

          {/* 精、气、神 横向排列（悬浮显示自定义说明框） */}
          <div style={{display:'flex',gap:16}}>
            {[['essence','精',character.essence ?? 40],['qi','气',character.qi ?? 40],['spirit','神',character.spirit ?? 30]].map(function([key, label, val]) {
              return (
                <div key={key} className="x-info-block x-stat-block" style={{flex:1,position:'relative'}}
                  onMouseEnter={function() { setStatTip(key); }}
                  onMouseLeave={function() { setStatTip(null); }}
                >
                  <span className="x-info-label" style={{cursor:'help',borderBottom:'1px dashed var(--color-ink-3)'}}>{label}</span>
                  <span className="x-info-value">{val}</span>
                  {statTip === key && (
                    <div className="x-stat-tip">
                      <div className="x-stat-tip-title">{STAT_TIPS[key].title}</div>
                      {STAT_TIPS[key].lines.map(function(line, i) {
                        return <div key={i} className="x-stat-tip-line">{line}</div>;
                      })}
                    </div>
                  )}
                </div>
              );
            })}
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

          {/* 诡道状态 */}
          {(character.strange_corruption ?? 0) > 0 && (
            <div className="x-info-block" style={{marginTop:'8px'}}>
              <span className="x-info-label">异化度</span>
              <span className="x-info-value" style={{color:'var(--color-seal)'}}>{character.strange_corruption}</span>
            </div>
          )}

          {/* 背包物品 */}
          {items && items.length > 0 && (
            <>
              <div className="x-info-separator" />
              <span className="mono-label" style={{display:'block',marginBottom:'8px'}}>行囊</span>
              {inventoryItems.map(function(item) {
                return (
                  <div key={item.id} className="x-row x-item-row" style={{padding:'4px 0', position:'relative'}}
                    onMouseEnter={function(e) { fetchItemKnowledge(item.id, function(k) { setHoveredItem(k); }); }}
                    onMouseLeave={function() { setHoveredItem(null); }}
                  >
                    <span className="x-row-main x-item-name" style={{fontSize:'12px'}}>
                      {item.name}{item.quantity > 1 ? ' ×' + item.quantity : ''}
                      <span className="x-item-grade" style={{fontSize:'9px',color:'var(--color-ink-3)',marginLeft:'4px'}}>{item.grade || ''}</span>
                    </span>
                    {item.item_type === 'pill' || item.item_type === 'material' || item.item_type === 'talisman' ? (
                      <button className="btn-outline btn-sm x-use-btn" style={{fontSize:'10px',padding:'2px 8px',position:'relative'}}
                        onMouseEnter={function(e) { fetchItemKnowledge(item.id, function(k) { setHoveredItem(k); }); }}
                        onMouseLeave={function() { setHoveredItem(null); }}
                        onClick={async function() {
                          try {
                            setItemUseMsg(null);
                            var res = await api.post('/xianxia/characters/' + characterId + '/use-item', { itemId: item.id });
                            setItemUseMsg({ ok: true, text: '使用成功！' + (res.deltas ? Object.entries(res.deltas).map(function(d) { return d[0] + (d[1] > 0 ? '+' : '') + d[1]; }).join(', ') : '') });
                            loadCharacter();
                          } catch(e) {
                            setItemUseMsg({ ok: false, text: e.message || '使用失败' });
                          }
                        }}
                      >使用</button>
                    ) : (
                      <span className="x-row-sub" style={{fontSize:'10px'}}>{item.grade}</span>
                    )}
                    {(item.slot || ['weapon','armor','accessory','artifact'].includes(item.item_type)) && (
                      !item.is_equipped ? (
                        <button className="btn-outline btn-sm" style={{fontSize:'10px',padding:'2px 8px',marginLeft:'4px'}}
                          onClick={async function() {
                            try {
                              await api.post('/xianxia/characters/' + characterId + '/equip', { itemId: item.id });
                              loadCharacter();
                            } catch(e) {
                              setItemUseMsg({ ok: false, text: e.message || '装备失败' });
                            }
                          }}
                        >装备</button>
                      ) : null
                    )}
                  </div>
                );
              })}
              {inventoryItems.length > 5 && <span className="x-row-sub" style={{fontSize:'11px'}}>…还有 {inventoryItems.length - 5} 件</span>}
            </>
          )}

          {/* 装备栏：始终可见，四槽位，空槽显示"空" */}
          <div className="x-info-separator" />
          <span className="mono-label" style={{display:'block',marginBottom:'8px'}}>装备栏</span>
          {[['weapon','武器'],['armor','防具'],['accessory','饰品'],['artifact','法宝']].map(function([slotKey, slotLabel]) {
            var equipped = items.find(function(i) { return i.is_equipped && (i.slot || i.item_type) === slotKey; });
            return (
              <div key={slotKey} className="x-row x-item-row" style={{padding:'4px 0',position:'relative'}}>
                <span className="mono-label" style={{fontSize:'10px',color:'var(--color-ink-3)',width:'32px',flexShrink:0}}>{slotLabel}</span>
                {equipped ? (
                  <>
                    <span className="x-row-main x-item-name" style={{fontSize:'12px'}}>
                      {equipped.name}
                      <span className="x-item-grade" style={{fontSize:'9px',color:'var(--color-ink-3)',marginLeft:'4px'}}>{equipped.grade || ''}</span>
                    </span>
                    <button className="btn-outline btn-sm" style={{fontSize:'10px',padding:'2px 8px'}}
                      onClick={async function() {
                        try {
                          await api.post('/xianxia/characters/' + characterId + '/unequip', { itemId: equipped.id });
                          loadCharacter();
                        } catch(e) {
                          setItemUseMsg({ ok: false, text: e.message || '卸下失败' });
                        }
                      }}
                    >卸下</button>
                  </>
                ) : (
                  <span className="x-row-sub" style={{fontSize:'11px',color:'var(--color-ink-3)'}}>空</span>
                )}
              </div>
            );
          })}
        </div>
        <div className="x-panel-footer">
          <button className="btn-outline btn-sm" onClick={() => navigate(`/xianxia/${characterId}/profile`)}>详情</button>
        </div>
      </aside>
    </div>
  );
}
