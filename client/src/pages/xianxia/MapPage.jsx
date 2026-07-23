import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import './xianxia-common.css';

const REGIONS = [
  { id: '中州', desc: '修仙文明核心，正道宗门总部所在', color: '#7C8A99', locations: ['太虚剑宗', '浑天宗', '丹霞谷', '天机阁', '万兽山', '金刚寺', '万象商会总会', '云来城'] },
  { id: '北荒', desc: '极寒冰原，妖兽横行，苦修之地', color: '#8AA39B', locations: ['铁骨门', '寒冰宗', '血河宗', '深渊裂隙'] },
  { id: '南疆', desc: '湿热密林，毒虫瘴气，诡道出没', color: '#A98B72', locations: ['万毒教', '蛊神宗', '青木宗', '雾中村'] },
  { id: '东海', desc: '群岛密布，海妖出没，海外散修聚集', color: '#C9A86B', locations: ['碧水宫', '龙血殿', '黑水港', '海底古遗迹', '虚海'] },
  { id: '西漠', desc: '沙漠戈壁，凡人王朝，地下古矿脉', color: '#C07A6B', locations: ['搬山宗', '白骨观', '大周王朝', '北朔王朝', '西凉王朝'] },
];

export default function MapPage() {
  var { characterId } = useParams();
  var navigate = useNavigate();
  var [character, setCharacter] = useState(null);
  var [discovered, setDiscovered] = useState([]);
  var [travelling, setTravelling] = useState(false);
  var [travelResult, setTravelResult] = useState(null);
  var [newDiscoveries, setNewDiscoveries] = useState([]);
  var confirming = useState(null); // [location, callback]

  var loadCharacter = useCallback(function() {
    api.get('/xianxia/characters/' + characterId).then(function(res) {
      setCharacter(res);
      var list = res.discovered_locations || [];
      // 兜底：存量角色从未发现过地点时自动触发一次发现（新角色创建时已自带初始发现）
      if (list.length === 0) {
        api.get('/xianxia/characters/' + characterId + '/discover-locations')
          .then(function(d) { setDiscovered(d.discovered_locations || []); })
          .catch(function() { setDiscovered([]); });
      } else {
        setDiscovered(list);
      }
    }).catch(function() {});
  }, [characterId]);

  useEffect(function() { loadCharacter(); }, [loadCharacter]);

  var handleTravel = async function(location) {
    if (travelling) return;
    setTravelling(true);
    setTravelResult(null);
    setNewDiscoveries([]);
    try {
      var res = await api.post('/xianxia/characters/' + characterId + '/travel', { location: location });
      var msg = res.narrative;
      if (res.newly_discovered && res.newly_discovered.length > 0) {
        msg += '\n\n你听说了新的地方：' + res.newly_discovered.join('、');
        setNewDiscoveries(res.newly_discovered);
      }
      setTravelResult({ narrative: res.narrative, newly_discovered: res.newly_discovered || [] });
      setDiscovered(res.discovered_locations || []);
      loadCharacter();
    } catch (err) {
      setTravelResult({ error: err.message });
    } finally {
      setTravelling(false);
    }
  };

  var inSameRegion = character && character.current_location
    ? function(regionId) { return character.current_location.startsWith(regionId); }
    : function() { return false; };

  return (
    <div className="x-page">
      <div className="x-header">
        <h1 className="t-heading">世界地图</h1>
        <button className="btn-outline" onClick={function() { navigate('/xianxia/' + characterId); }}>返回</button>
      </div>

      <p className="mono-label" style={{marginTop:16,marginBottom:8}}>五大区域 · 苍玄界</p>
      <p className="mono-label" style={{fontSize:11,marginBottom:16,color:'var(--color-ink-3)'}}>
        已探索 {discovered.length} / 27 个地点 · 点击地点可前往
      </p>

      <div style={{display:'flex',flexDirection:'column',gap:16}}>

      {/* 已探索地点 — 点击即可传送 */}
      {discovered.length > 0 && (
        <div className="card-porcelain" style={{padding:16}}>
          <span className="mono-label" style={{marginBottom:8,display:'block'}}>已探索的地点</span>
          <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
            {discovered.map(function(loc) {
              var isCurrent = character && character.current_location && character.current_location.endsWith(loc);
              return (
                <span key={loc}
                  onClick={function() { if (!isCurrent && !travelling) handleTravel(loc); }}
                  style={{
                    fontSize:12,padding:'4px 12px',borderRadius:999,
                    border:'1px solid var(--color-hairline)',
                    cursor: isCurrent ? 'default' : 'pointer',
                    background: isCurrent ? 'var(--color-celadon)' : 'rgba(70,104,91,0.06)',
                    color: isCurrent ? 'var(--color-moon)' : 'var(--color-ink)',
                    transition: 'all 0.2s var(--ease-soft)',
                  }}
                  title={isCurrent ? '当前位置' : '点击前往'}
                >{loc}{isCurrent ? ' ●' : ''}</span>
              );
            })}
          </div>
        </div>
      )}
        {REGIONS.map(function(r) {
          var regionDiscovered = r.locations.filter(function(l) { return discovered.includes(l); });
          var regionUndiscovered = r.locations.filter(function(l) { return !discovered.includes(l); });
          return (
            <div key={r.id} className="card-porcelain" style={{padding:16}}>
              <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:8}}>
                <span style={{width:14,height:14,borderRadius:'50%',background:r.color,flexShrink:0}} />
                <span className="t-card" style={{fontFamily:'var(--font-display-cn)'}}>{r.id}</span>
                <span className="mono-label" style={{fontSize:12}}>{r.desc}</span>
                {inSameRegion(r.id) && <span className="mono-label" style={{fontSize:10,color:'var(--color-celadon)'}}>● 在此</span>}
              </div>
              <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                {regionDiscovered.map(function(loc) {
                  var isCurrent = character && character.current_location && character.current_location.endsWith(loc);
                  return (
                    <span key={loc}
                      onClick={function() { if (!isCurrent && !travelling) handleTravel(loc); }}
                      style={{
                        fontSize:12,padding:'4px 12px',borderRadius:999,
                        border:'1px solid var(--color-hairline)',
                        cursor: isCurrent ? 'default' : 'pointer',
                        background: isCurrent ? 'var(--color-celadon)' : 'transparent',
                        color: isCurrent ? 'var(--color-moon)' : 'var(--color-ink)',
                        transition: 'all 0.2s var(--ease-soft)',
                      }}
                      title={isCurrent ? '当前位置' : '点击前往'}
                    >{loc}{isCurrent ? ' ●' : ''}</span>
                  );
                })}
                {regionUndiscovered.map(function(loc) {
                  return (
                    <span key={loc}
                      style={{
                        fontSize:12,padding:'4px 12px',borderRadius:999,
                        border:'1px dashed var(--color-hairline)',
                        color:'var(--color-ink-3)', cursor:'not-allowed',
                        opacity: 0.5,
                      }}
                      title={'尚未发现'}
                    >{loc} ?</span>
                  );
                })}
                {regionDiscovered.length === 0 && regionUndiscovered.length > 0 && (
                  <span className="mono-label" style={{fontSize:11,color:'var(--color-ink-3)'}}>尚未探索此区域</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 当前位置信息 */}
      {character && character.current_location && (
        <div className="card-porcelain" style={{marginTop:16,padding:16}}>
          <span className="mono-label">当前位置</span>
          <p className="t-card" style={{marginTop:4}}>{character.current_location}</p>
        </div>
      )}

      {/* 新发现通知 */}
      {newDiscoveries.length > 0 && (
        <div className="card-porcelain" style={{marginTop:16,padding:16,border:'1px solid var(--color-celadon)'}}>
          <span className="mono-label" style={{color:'var(--color-celadon)'}}>✦ 新发现</span>
          <p style={{marginTop:8,fontSize:14,lineHeight:1.8}}>
            你听说了新的地方：{newDiscoveries.join('、')}
          </p>
        </div>
      )}

      {/* 旅行结果 */}
      {travelResult && (
        <div className="card-porcelain" style={{marginTop:16,padding:16}}>
          {travelResult.error ? (
            <>
              <span className="mono-label" style={{color:'var(--color-seal)'}}>旅行失败</span>
              <p style={{marginTop:8,fontSize:14}}>{travelResult.error}</p>
            </>
          ) : (
            <>
              <span className="mono-label" style={{color:'var(--color-celadon)'}}>旅途结束</span>
              <div style={{marginTop:8,fontSize:14,lineHeight:1.8,whiteSpace:'pre-wrap'}}>{travelResult.narrative}</div>
              {travelResult.newly_discovered && travelResult.newly_discovered.length > 0 && (
                <div className="mono-label" style={{marginTop:8,fontSize:11,color:'var(--color-celadon)'}}>
                  + 发现 {travelResult.newly_discovered.join('、')}
                </div>
              )}
            </>
          )}
          <button className="btn-outline btn-sm" style={{marginTop:12}}
            onClick={function() { setTravelResult(null); setNewDiscoveries([]); }}>
            关闭
          </button>
        </div>
      )}

      {/* 旅行中加载状态 */}
      {travelling && (
        <div className="card-porcelain" style={{marginTop:16,padding:16,textAlign:'center'}}>
          <span className="mono-label">旅行中……</span>
        </div>
      )}
    </div>
  );
}
