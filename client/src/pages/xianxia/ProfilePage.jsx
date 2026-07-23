import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { formatYears } from './format';
import './xianxia-common.css';

const PATH_LABELS = { xiandao: '仙道', physical: '肉身', strange: '诡道', artisan: '匠道', wanderer: '散修' };
const ITEM_TYPE_LABELS = { technique: '功法', pill: '丹药', treasure: '法宝', material: '材料', spirit_stone: '灵石', misc: '杂物' };

export default function ProfilePage() {
  const { characterId } = useParams();
  const navigate = useNavigate();
  const [character, setCharacter] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/xianxia/characters/${characterId}`).then(res => {
      setCharacter(res);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [characterId]);

  if (loading) return <div className="x-loading">加载中……</div>;
  if (!character) return <div className="x-loading">角色不存在</div>;

  const paths = character.cultivation_paths || {};
  const roots = character.spirit_roots || {};
  const items = character.items || [];
  const relationships = character.relationships || [];
  const hasPath = Object.values(paths).some(Boolean);

  return (
    <div className="x-page">
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
          <div className="x-info-block"><span className="x-info-label">悟性</span><span className="x-info-value">{character.comprehension}</span></div>
          <div className="x-info-block"><span className="x-info-label">神识</span><span className="x-info-value">{character.divine_sense}</span></div>
          <div className="x-info-block"><span className="x-info-label">气</span><span className="x-info-value">{character.qi ?? 40}</span></div>
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
