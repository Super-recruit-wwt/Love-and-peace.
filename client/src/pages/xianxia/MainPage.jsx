import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { formatAge, formatYears } from './format';
import HoverTip from './HoverTip';
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

// 五条修炼路线的完整境界路径（悬浮在境界上展示，当前阶段高亮）
const PATH_TIPS = {
  xiandao: {
    label: '仙道',
    title: '仙道正统 · 境界之路',
    stages: ['炼气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体', '大乘', '渡劫飞升'],
    note: '每境分四小阶：初期 → 中期 → 后期 → 圆满。修满当前境界修为方可冲击下一境。',
  },
  physical: {
    label: '肉身',
    title: '肉身成圣 · 炼体之路',
    stages: ['铜皮', '铁骨', '银血', '金身', '玉髓', '金刚', '不灭', '万象', '肉身成圣'],
    note: '不修法术只炼体魄，每进一步都是肉身劫。',
  },
  strange: {
    label: '诡道',
    title: '诡道 · 异化之路',
    stages: ['初触', '共生', '同化', '深渊', '化诡', '噬主', '规则掌控'],
    note: '诡道不可逆——每向上一步，离"人"就远一步。终点不是飞升，是成为规则本身。',
  },
  artisan: {
    label: '匠道',
    title: '凡人匠道 · 技艺之路',
    stages: ['学徒', '匠师', '大师', '宗师', '圣手', '开派祖师'],
    note: '不修境界，以名望与技艺等级衡量，突破方式是完成"心血之作"。',
  },
  loose: {
    label: '散修',
    title: '散修野路 · 战力之路',
    stages: ['凡俗', '初窥', '小成', '大成', '一方豪强', '半步飞升'],
    note: '不入宗门不碰邪物，进步发生在生死之间的顿悟。',
  },
};

// 从境界字符串（如"炼气中期"）解析当前阶段序号与小阶
function parsePathStage(routeKey, value) {
  const def = PATH_TIPS[routeKey];
  if (!def || !value) return { idx: -1, sub: '' };
  for (let i = 0; i < def.stages.length; i++) {
    if (value.startsWith(def.stages[i])) {
      return { idx: i, sub: value.slice(def.stages[i].length) };
    }
  }
  // 渡劫飞升等特殊终态
  const last = def.stages[def.stages.length - 1];
  if (value.includes(last) || last.includes(value)) return { idx: def.stages.length - 1, sub: '' };
  return { idx: -1, sub: '' };
}

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

// 前端保险：修为满时 suggestions 首位保证"冲击瓶颈"（服务端正源已统一处理，这里兜底）
function ensureBreakthroughFirst(ch, opts) {
  const BT = '冲击瓶颈，尝试突破';
  const list = (opts || []).filter(o => o && o !== BT);
  if (ch && ch.qi_max > 0 && (ch.qi_current || 0) >= ch.qi_max) list.unshift(BT);
  return list;
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
  const [hoveredItem, setHoveredItem] = useState(null); // { knowledge..., rect } — rect 为 trigger 屏幕坐标
  const [itemUseMsg, setItemUseMsg] = useState(null);
  const [statTip, setStatTip] = useState(null); // { key: 'essence'|'qi'|'spirit', rect } | null
  const [qiTip, setQiTip] = useState(null); // { rect } | null — 修为行悬浮
  const [pathTip, setPathTip] = useState(null); // { key: 修炼路线 key, rect } | null
  const [locationOptions, setLocationOptions] = useState([]); // 地点情境化选项（suggestions 兜底）
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
      // 地点情境化选项：行动返回 options 优先，此处作兜底
      setLocationOptions(res.location_options || []);
      // 建议选项：取最近一条带选项的叙事；没有则用地名情境选项兜底
      const latestWithOptions = [...tlRes.events].reverse().find(e => parseOptions(e.options));
      setSuggestions(parseOptions(latestWithOptions?.options) || res.location_options || []);
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

      // 刷新角色状态
      const updated = await api.get(`/xianxia/characters/${characterId}`);
      setCharacter(updated);
      setLocationOptions(updated.location_options || []);

      // 跨年生成了纪元大事记：同步刷新世界面板
      if (res.chronicle_events && res.chronicle_events.length > 0) loadWorldState();

      // 更新建议选项：行动返回的 options 优先；空则用地名情境选项兜底
      if (res.options && res.options.length > 0) {
        setSuggestions(res.options);
      } else {
        setSuggestions(updated.location_options || []);
      }

      // 如果触发了倒计时
      if (res.timer) {
        setTimer(res.timer.remaining);
        setTimerNarrative(res.timer.narrative);
      }

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
  // 临时丹药 buff（duration 类）：三元旁显示 +N
  const buffFor = (stat) => (character.active_buffs || []).filter(b => b.stat === stat).reduce((a, b) => a + (Number(b.value) || 0), 0);
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
      {/* 悬浮层统一出口：fixed 定位到视口，不受面板 overflow 裁剪；滚动/resize 时隐藏 */}
      {statTip && (
        <HoverTip rect={statTip.rect} width={240} prefer="left" className="x-stat-tip" onClose={function() { setStatTip(null); }}>
          <div className="x-stat-tip-title">{STAT_TIPS[statTip.key].title}</div>
          {STAT_TIPS[statTip.key].lines.map(function(line, i) {
            return <div key={i} className="x-stat-tip-line">{line}</div>;
          })}
        </HoverTip>
      )}
      {qiTip && character && (
        <HoverTip rect={qiTip.rect} width={240} prefer="left" className="x-stat-tip" onClose={function() { setQiTip(null); }}>
          <div className="x-stat-tip-title">修为 · 破境之基</div>
          <div className="x-stat-tip-line">当前修为 {character.qi_current} / 上限 {character.qi_max}</div>
          <div className="x-stat-tip-line">· 修为上限随境界成长，境界越高上限越高</div>
          <div className="x-stat-tip-line">· 修满上限方可冲击突破；突破无论成败，修为归零重修</div>
          {character.qi_current >= character.qi_max && (
            <div className="x-stat-tip-line" style={{color:'var(--color-celadon)'}}>· 修为已满——可以冲击突破了</div>
          )}
        </HoverTip>
      )}
      {pathTip && PATH_TIPS[pathTip.key] && (function() {
        var def = PATH_TIPS[pathTip.key];
        var stage = parsePathStage(pathTip.key, paths[pathTip.key]);
        return (
          <HoverTip rect={pathTip.rect} width={280} prefer="left" className="x-stat-tip x-path-tip" onClose={() => setPathTip(null)}>
            <div className="x-stat-tip-title">{def.title}</div>
            <div className="x-path-chain">
              {def.stages.map((s, i) => (
                <span key={s} className={`x-path-stage${i === stage.idx ? ' x-path-stage-current' : ''}${stage.idx >= 0 && i < stage.idx ? ' x-path-stage-passed' : ''}`}>
                  {i > 0 && <span className="x-path-arrow">→</span>}
                  {s}
                  {i === stage.idx && stage.sub && <em className="x-path-sub">{stage.sub}</em>}
                </span>
              ))}
            </div>
            <div className="x-stat-tip-line x-path-note">{def.note}</div>
          </HoverTip>
        );
      })()}
      {hoveredItem && (
        <HoverTip rect={hoveredItem.rect} width={280} prefer="left" className="x-item-tooltip" onClose={function() { setHoveredItem(null); }}>
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
        </HoverTip>
      )}

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
              <span className="x-info-value">{worldState.era_name || '开天纪'} · 第{character.game_year || worldState.game_year || 1}年</span>
            </div>
          ) : (
            <div className="x-info-block">
              <span className="x-info-label">已知势力</span>
              <span className="x-info-value">等待探索……</span>
            </div>
          )}
          {Array.isArray(worldState.chronicle) && worldState.chronicle.length > 0 && (
            <div className="x-info-block" style={{ display: 'block' }}>
              <span className="x-info-label">大事记</span>
              {worldState.chronicle.slice(-3).reverse().map(function(e, i) {
                return (
                  <div key={i} className="x-row-sub" style={{ fontSize: '12px', marginTop: '4px' }}
                    title={e.text}>
                    第{e.year}年 · {e.title}
                  </div>
                );
              })}
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
              {ensureBreakthroughFirst(character, suggestions).length > 0 && (
                <div className="x-suggestions">
                  <span className="x-quick-label mono-label">当下可行</span>
                  {ensureBreakthroughFirst(character, suggestions).map(s => (
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
            <div className="x-info-block" style={{flex:1}}
              onMouseEnter={function(e) { setQiTip({ rect: e.currentTarget.getBoundingClientRect() }); }}
              onMouseLeave={function() { setQiTip(null); }}
            >
              <span className="x-info-label" style={{cursor:'help',borderBottom:'1px dashed var(--color-ink-3)'}}>修为</span>
              <span className="x-info-value">{character.qi_current}/{character.qi_max}</span>
            </div>
          </div>

          <div className="x-info-separator" />

          {/* 精、气、神 横向排列（悬浮显示自定义说明框） */}
          <div style={{display:'flex',gap:16}}>
            {[['essence','精',character.essence ?? 40],['qi','气',character.qi ?? 40],['spirit','神',character.spirit ?? 30]].map(function([key, label, val]) {
              return (
                <div key={key} className="x-info-block x-stat-block" style={{flex:1}}
                  onMouseEnter={function(e) { setStatTip({ key, rect: e.currentTarget.getBoundingClientRect() }); }}
                  onMouseLeave={function() { setStatTip(null); }}
                >
                  <span className="x-info-label" style={{cursor:'help',borderBottom:'1px dashed var(--color-ink-3)'}}>{label}</span>
                  <span className="x-info-value">
                    {val}
                    {buffFor(key) > 0 && (
                      <span style={{fontSize:10,color:'var(--color-celadon)',marginLeft:4}} title="丹药临时加成">+{buffFor(key)}</span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="x-info-separator" />

          {Object.entries(paths).map(([k, v]) => {
            if (!v) return null;
            const def = PATH_TIPS[k];
            const stage = parsePathStage(k, v);
            return (
              <div className="x-info-block" key={k}
                onMouseEnter={(e) => def && setPathTip({ key: k, rect: e.currentTarget.getBoundingClientRect() })}
                onMouseLeave={() => setPathTip(null)}
              >
                <span className="x-info-label" style={def ? {cursor:'help',borderBottom:'1px dashed var(--color-ink-3)'} : undefined}>
                  {def ? def.label : '散修'}
                </span>
                <span className="x-info-value">{v}</span>
              </div>
            );
          })}

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
                    onMouseEnter={function(e) { var r = e.currentTarget.getBoundingClientRect(); fetchItemKnowledge(item.id, function(k) { setHoveredItem(Object.assign({}, k, { rect: r })); }); }}
                    onMouseLeave={function() { setHoveredItem(null); }}
                  >
                    <span className="x-row-main x-item-name" style={{fontSize:'12px'}}>
                      {item.name}{item.quantity > 1 ? ' ×' + item.quantity : ''}
                      <span className="x-item-grade" style={{fontSize:'9px',color:'var(--color-ink-3)',marginLeft:'4px'}}>{item.grade || ''}</span>
                    </span>
                    {item.item_type === 'pill' || item.item_type === 'material' || item.item_type === 'talisman' ? (
                      <button className="btn-outline btn-sm x-use-btn" style={{fontSize:'10px',padding:'2px 8px',position:'relative'}}
                        onMouseEnter={function(e) { var r = e.currentTarget.getBoundingClientRect(); fetchItemKnowledge(item.id, function(k) { setHoveredItem(Object.assign({}, k, { rect: r })); }); }}
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
