import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { formatYears } from './format';
import HoverTip from './HoverTip';
import './xianxia-common.css';

const PATH_LABELS = { xiandao: '仙道', physical: '肉身', strange: '诡道', artisan: '匠道', wanderer: '散修' };
const ITEM_TYPE_LABELS = { technique: '功法', pill: '丹药', treasure: '法宝', material: '材料', spirit_stone: '灵石', misc: '杂物' };
const TECH_TYPE_LABELS = { heart: '心法', spell: '术法', movement: '身法', secret: '秘术', strange_art: '诡术' };

// 功法代价词条（秘术/诡术）
const TECH_COST_LABELS = { health: '生命', spirit: '神', qi_current_ratio: '灵力比例', lifespan: '寿元', spirit_stones: '灵石' };

// 三元偏向标签（与后端 stat_bias 对应）
const STAT_BIAS_LABELS = { essence: '精', qi: '气', spirit: '神' };

// 基本信息属性说明（悬浮提示，与后端突破/修炼规则保持一致）
const ATTR_TIPS = {
  essence: {
    title: '精 · 体魄',
    lines: ['肉身根本。精过低（<30）时肉身无法承受突破冲击；低于 50 突破成功率打折。',
      '来源：偏向「精」的功法滋养、三元丹药、修炼涓流、境界突破。'],
  },
  qi: {
    title: '气 · 真元',
    lines: ['真元根基。气过低（<30）时突破成功率打折。',
      '来源：偏向「气」的功法滋养、三元丹药、修炼涓流、境界突破。'],
  },
  spirit: {
    title: '神 · 神魂',
    lines: ['神魂强度。神过低（<30）时突破成功率大打折扣；搜魂、神算等秘术需消耗神。',
      '来源：偏向「神」的功法滋养、三元丹药、修炼涓流、境界突破。'],
  },
  comprehension: {
    title: '悟性',
    lines: ['修炼与参悟的效率。修炼时功法熟练获取 ×（悟性 ÷ 50），悟性越高功法精进越快；',
      '成长途径：每部功法修至大成/圆满/自创变式（+1/+1/+2）；神魂达 60/120/200/300（各 +2）；破境顿悟（大境界 +2、小境界 +1）；悟道类机缘。'],
  },
};

// 功法效果中文化（仅展示已知字段，未知字段不显示避免英文泄漏）
const TECH_EFFECT_FORMATTERS = {
  efficiency: v => `修炼效率 ×${v}`,
  qi_max: v => `气海底蕴 ${v}`,
  learn_speed: v => `领悟速度 ×${v}`,
  essence_per_break: v => `突破凝精 ${v > 0 ? '+' : ''}${v}`,
  qi_per_break: v => `突破炼气 ${v > 0 ? '+' : ''}${v}`,
  spirit_per_break: v => `突破凝神 ${v > 0 ? '+' : ''}${v}`,
  combat_bonus: v => `战斗加成 +${Math.round(v * 100)}%`,
  evil_bonus: v => `对邪修加成 +${Math.round(v * 100)}%`,
  life_steal: v => `气血吸取 ${Math.round(v * 100)}%`,
  damage_reduce: v => `减伤 ${Math.round(v * 100)}%`,
  debuff_reduce: v => `负面抵抗 ${Math.round(v * 100)}%`,
  poison_resist: v => `毒抗 ${Math.round(v * 100)}%`,
  poison_craft: v => `毒术炼制 ×${v}`,
  poison_dot: v => `剧毒叠伤 ${v}`,
  water_bonus: v => `水系威力 ×${v}`,
  water_resist: v => `水系抗性 ${Math.round(v * 100)}%`,
  ice_bonus: v => `冰系威力 ×${v}`,
  cold_power: v => `寒劲 ×${v}`,
  beast_power: v => `驭兽之力 ×${v}`,
  gu_bonus: v => `蛊术威力 ×${v}`,
  sword_power: v => `剑法威力 ×${v}`,
  pet_slots: v => `灵宠栏位 +${v}`,
  pet_battle: v => `灵宠战力 +${Math.round(v * 100)}%`,
  gu_pet: v => `本命蛊 +${v}`,
  heal_speed: v => `恢复速度 ×${v}`,
  foe_debuff: v => `敌方削弱 ${Math.round(v * 100)}%`,
  no_sect_bonus: v => `散修加成 ×${v}`,
  corruption_suppress: v => `异化压制 ${v}`,
  corruption_decay: v => `异化消解 ${v}`,
  death_keep_stones: v => `陨落保灵石 ${Math.round(v * 100)}%`,
  attack: v => `攻击 +${v}`,
  defense: v => `防御 +${v}`,
  speed: v => `行速 ×${v}`,
  dodge: v => `闪避 ${Math.round(v * 100)}%`,
  burn: v => `灼烧 ${v}`,
  freeze: v => `冻结 ${Math.round(v * 100)}%`,
  slow: v => `迟滞 ${Math.round(v * 100)}%`,
  stun: v => `眩晕 ${Math.round(v * 100)}%`,
  pierce: v => `破甲 ${Math.round(v * 100)}%`,
  heal: v => `恢复生命 +${v}`,
  corruption: v => `异化 +${v}`,
  power_buff_pct: v => `临时战力 +${Math.round(v * 100)}%`,
  breakthrough_spirit: v => `破境凝神 +${v}`,
  escape: () => '遁走千里',
  rob_item: () => '顺手取材',
  random_material: () => '虚质成物',
  spirit_stones: v => Array.isArray(v) ? `灵石 ${v[0]}~${v[1]}` : `灵石 +${v}`,
  cost: v => `代价：${Object.entries(v).map(([k, n]) => `${TECH_COST_LABELS[k] || k} -${k === 'qi_current_ratio' ? Math.round(n * 100) + '%' : n}`).join('，')}`,
};
const TECH_FLAG_LABELS = {
  cold_immune: '寒冻免疫', poison_immune: '万毒不侵', fracture_immune: '骨折免疫',
  carry_bonus: '负重天赋', desert_navigate: '沙海辨途', sea_explore: '深海探索',
  ice_slow: '寒冰迟滞', ignore_defense: '破防', dao_preserve: '道基稳固',
  break_degrade_reduce: '跌落减免', sword_insight: '剑心通明', golden_body: '金刚不坏',
  shadow_independent: '影神自立', spirit_growth: '神魂茁壮',
};

export default function ProfilePage() {
  const { characterId } = useParams();
  const navigate = useNavigate();
  const [character, setCharacter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(null); // 正在设为主修的功法名
  const [sanyuanTip, setSanyuanTip] = useState(null); // 功法三元滋养规则悬浮层
  const [attrTip, setAttrTip] = useState(null); // 基本信息属性说明悬浮层 { rect, title, lines }

  useEffect(() => {
    api.get(`/xianxia/characters/${characterId}`).then(res => {
      setCharacter(res);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [characterId]);

  // 设置某功法为其类型的主修（每个类型各一个主修）
  const setMainTechnique = async (name) => {
    if (switching) return;
    setSwitching(name);
    try {
      await api.post(`/xianxia/characters/${characterId}/technique-main`, { name });
      const res = await api.get(`/xianxia/characters/${characterId}`);
      setCharacter(res);
    } catch (e) {
      alert(e.message || '切换主修失败');
    } finally {
      setSwitching(null);
    }
  };

  if (loading) return <div className="x-loading">加载中……</div>;
  if (!character) return <div className="x-loading">角色不存在</div>;

  const paths = character.cultivation_paths || {};
  const roots = character.spirit_roots || {};
  const items = character.items || [];
  const relationships = character.relationships || [];
  const hasPath = Object.values(paths).some(Boolean);

  return (
    <div className="x-page">
      {/* 功法三元滋养规则悬浮层（fixed 定位到视口，不受面板裁剪；滚动/resize 时隐藏） */}
      {sanyuanTip && (
        <HoverTip rect={sanyuanTip.rect} width={270} prefer="right" className="x-stat-tip" onClose={() => setSanyuanTip(null)}>
          <div className="x-stat-tip-title">三元滋养 · 《{sanyuanTip.name}》</div>
          <div className="x-stat-tip-line">每部功法只滋养其偏向的一元（精/气/神其一）；随熟练加深持续滋养，修至大成时滋养尽出。</div>
          <div className="x-stat-tip-line">· 每一元只取偏向该元的功法中加成最高的一部，多部同修不叠加</div>
          <div className="x-stat-tip-line">· 品级越高，加成越多、上限越高（凡/灵/宝/玄/圣：30/60/120/200/400）</div>
          <div className="x-stat-tip-line">
            · 此功法偏向「{STAT_BIAS_LABELS[sanyuanTip.bias] || '气'}」，已滋养 {sanyuanTip.gained}/{sanyuanTip.cap}{sanyuanTip.gained >= sanyuanTip.cap ? '——滋养已尽出' : ''}
          </div>
        </HoverTip>
      )}
      {/* 基本信息属性说明悬浮层（悟性/精/气/神） */}
      {attrTip && (
        <HoverTip rect={attrTip.rect} width={250} prefer="right" className="x-stat-tip" onClose={() => setAttrTip(null)}>
          <div className="x-stat-tip-title">{attrTip.title}</div>
          {attrTip.lines.map((line, i) => <div key={i} className="x-stat-tip-line">{line}</div>)}
        </HoverTip>
      )}
      <div className="x-header">
        <h1 className="t-heading">{character.name} · 详情</h1>
        <button className="btn-outline" onClick={() => navigate(`/xianxia/${characterId}`)}>返回主界面</button>
      </div>

      <section className="card-porcelain x-section">
        <span className="mono-label">基本信息</span>
        <div className="x-grid-2">
          <div className="x-info-block"><span className="x-info-label">寿元</span><span className="x-info-value">{formatYears(character.lifespan_remaining)}</span></div>
          <div className="x-info-block"><span className="x-info-label">生命</span><span className="x-info-value">{character.health}</span></div>
          <div className="x-info-block"><span className="x-info-label">修为</span><span className="x-info-value">{character.qi_current}/{character.qi_max}</span></div>
          <div className="x-info-block"><span className="x-info-label">灵石</span><span className="x-info-value">{character.spirit_stones}</span></div>
          <div className="x-info-block"><span className="x-info-label">道心</span><span className="x-info-value">{character.dao_heart}</span></div>
          <div className="x-info-block" style={{ cursor: 'help' }}
            onMouseEnter={(e) => setAttrTip({ rect: e.currentTarget.getBoundingClientRect(), ...ATTR_TIPS.essence })}
            onMouseLeave={() => setAttrTip(null)}>
            <span className="x-info-label">精</span><span className="x-info-value">{character.essence ?? 40}</span>
          </div>
          <div className="x-info-block" style={{ cursor: 'help' }}
            onMouseEnter={(e) => setAttrTip({ rect: e.currentTarget.getBoundingClientRect(), ...ATTR_TIPS.qi })}
            onMouseLeave={() => setAttrTip(null)}>
            <span className="x-info-label">气</span><span className="x-info-value">{character.qi ?? 40}</span>
          </div>
          <div className="x-info-block" style={{ cursor: 'help' }}
            onMouseEnter={(e) => setAttrTip({ rect: e.currentTarget.getBoundingClientRect(), ...ATTR_TIPS.spirit })}
            onMouseLeave={() => setAttrTip(null)}>
            <span className="x-info-label">神</span><span className="x-info-value">{character.spirit ?? 30}</span>
          </div>
          <div className="x-info-block" style={{ cursor: 'help' }}
            onMouseEnter={(e) => setAttrTip({ rect: e.currentTarget.getBoundingClientRect(), ...ATTR_TIPS.comprehension })}
            onMouseLeave={() => setAttrTip(null)}>
            <span className="x-info-label">悟性</span><span className="x-info-value">{character.comprehension}</span>
          </div>
          <div className="x-info-block"><span className="x-info-label">名望</span><span className="x-info-value">{character.fame}</span></div>
          <div className="x-info-block"><span className="x-info-label">恶名</span><span className="x-info-value">{character.infamy}</span></div>
          <div className="x-info-block"><span className="x-info-label">炼丹</span><span className="x-info-value">{character.alchemy_skill}</span></div>
          <div className="x-info-block"><span className="x-info-label">炼器</span><span className="x-info-value">{character.crafting_skill}</span></div>
          <div className="x-info-block"><span className="x-info-label">阵法</span><span className="x-info-value">{character.formation_skill}</span></div>
          <div className="x-info-block"><span className="x-info-label">符箓</span><span className="x-info-value">{character.talisman_skill}</span></div>
        </div>
        {character.body_status && (
          <div className="x-info-block" style={{ marginTop: '12px' }}>
            <span className="x-info-label">身体状态</span>
            <span className="x-info-value" style={{ color: 'var(--color-seal)' }}>{character.body_status}</span>
          </div>
        )}
      </section>

      <section className="card-porcelain x-section">
        <span className="mono-label">灵根 · 天赋</span>
        <p style={{ fontSize: '15px' }}>
          {Object.entries(roots).map(([k, v]) => `${k}灵根(${v})`).join('  ')}
        </p>
        {character.special_body && (
          <p className="x-row-sub" style={{ marginTop: '8px' }}>
            特殊体质：{character.special_body}
          </p>
        )}
      </section>

      <section className="card-porcelain x-section">
        <span className="mono-label">修炼路线</span>
        {hasPath ? (
          Object.entries(paths).map(([k, v]) => v && (
            <div className="x-row" key={k}>
              <span className="x-row-main">{PATH_LABELS[k] || k}</span>
              <span className={k === 'strange' ? 'x-row-sub' : 'x-row-accent'}
                style={k === 'strange' ? { color: 'var(--color-seal)' } : undefined}>{v}</span>
            </div>
          ))
        ) : (
          <p className="x-row-sub">尚未踏入修炼之路</p>
        )}
      </section>

      <section className="card-porcelain x-section">
        <span className="mono-label">功法</span>
        {(character.learned_techniques || []).length > 0 ? (
          ['heart', 'spell', 'movement', 'secret', 'strange_art'].map(type => {
            const group = character.learned_techniques.filter(t => (t.type || 'heart') === type);
            if (group.length === 0) return null;
            return (
              <div key={type} style={{ marginBottom: '10px' }}>
                <span className="x-row-sub" style={{ display: 'block', marginBottom: '4px' }}>
                  {TECH_TYPE_LABELS[type]}（主修一部，相关行为精进更快）
                </span>
                {group.map(t => {
                  const effects = Object.entries(t.effect || {})
                    .map(([k, v]) => {
                      if (k === 'cost' && v && typeof v === 'object') return TECH_EFFECT_FORMATTERS.cost(v);
                      if (Array.isArray(v) && TECH_EFFECT_FORMATTERS[k]) return TECH_EFFECT_FORMATTERS[k](v);
                      if (typeof v === 'number' && TECH_EFFECT_FORMATTERS[k]) return TECH_EFFECT_FORMATTERS[k](v);
                      if (v === true && (TECH_FLAG_LABELS[k] || TECH_EFFECT_FORMATTERS[k])) return (TECH_FLAG_LABELS[k] || TECH_EFFECT_FORMATTERS[k](v));
                      return null;
                    })
                    .filter(Boolean);
                  return (
                    <div className="x-row" key={t.name}>
                      <span className="x-row-main">
                        {t.main && <span className="x-row-accent" style={{ marginRight: '6px' }}>主修</span>}
                        《{t.name}》
                        <span className="x-row-sub" style={{ marginLeft: '8px' }}>
                          {t.grade} · {t.depth_label}{t.next_exp != null ? `（${t.exp}/${t.next_exp}）` : ''}{t.faction ? ` · ${t.faction}` : ''}
                          {t.stat_cap != null && (
                            <span
                              style={{ cursor: 'help', borderBottom: '1px dashed var(--color-ink-3)' }}
                              onMouseEnter={(e) => setSanyuanTip({ rect: e.currentTarget.getBoundingClientRect(), name: t.name, gained: t.stat_gained || 0, cap: t.stat_cap, bias: t.stat_bias })}
                              onMouseLeave={() => setSanyuanTip(null)}
                            >
                              {` · ${STAT_BIAS_LABELS[t.stat_bias] || '三元'} ${t.stat_gained || 0}/${t.stat_cap}`}
                            </span>
                          )}
                        </span>
                        {!t.main && (
                          <button
                            className="btn-outline"
                            style={{ padding: '2px 10px', fontSize: '12px', marginLeft: '8px' }}
                            disabled={switching === t.name}
                            onClick={() => setMainTechnique(t.name)}
                          >
                            {switching === t.name ? '切换中…' : '设为主修'}
                          </button>
                        )}
                      </span>
                      {effects.length > 0 && <span className="x-row-sub">{effects.join('，')}</span>}
                      {t.locked_count > 0 && <span className="x-row-sub">未参透 {t.locked_count} 项</span>}
                    </div>
                  );
                })}
              </div>
            );
          })
        ) : (
          <p className="x-row-sub">尚未习得任何功法</p>
        )}
      </section>

      {items.length > 0 && (
        <section className="card-porcelain x-section">
          <span className="mono-label">物品 · 法宝</span>
          {items.map(item => (
            <div key={item.id} className="x-row">
              <span className="x-row-main">{item.is_equipped ? '⚔ ' : ''}{item.name}</span>
              <span className="x-row-sub">{item.grade} · {ITEM_TYPE_LABELS[item.item_type] || item.item_type}</span>
            </div>
          ))}
        </section>
      )}

      {relationships.length > 0 && (
        <section className="card-porcelain x-section">
          <span className="mono-label">人际</span>
          {relationships.map(rel => (
            <div key={rel.id} className="x-row">
              <span className="x-row-main">
                {rel.npc_name}
                <span className="x-row-sub" style={{ marginLeft: '8px' }}>
                  {rel.npc_identity}{rel.npc_faction ? ` · ${rel.npc_faction}` : ''}
                </span>
              </span>
              <span className="x-row-accent">{rel.relation_types.join(' · ')}</span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
