import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { post } from '../api';
import './create.css';

const ARCHETYPES = [
  { id: 'wenrou', name: '温柔体贴', traits: ['轻声细语', '善于倾听', '喜欢鼓励', '偶尔撒娇', '护短'] },
  { id: 'yuanqi', name: '元气治愈', traits: ['活力满满', '乐观向上', '爱讲冷笑话', '天然呆', '感染力强'] },
  { id: 'aojiao', name: '傲娇毒舌', traits: ['口是心非', '爱吐槽', '刀子嘴豆腐心', '小傲娇', '反差萌'] },
  { id: 'zhixing', name: '知性沉稳', traits: ['理性分析', '见多识广', '娓娓道来', '偶尔幽默', '从容淡定'] },
  { id: 'shenmi', name: '神秘高冷', traits: ['话少精简', '若即若离', '偶尔温柔暴击', '保持距离感', '观察力强'] },
];

const DIMENSIONS = {
  intimacy: { label: '亲密度', options: ['朋友', '知己', '暧昧', '恋人', '家人'] },
  energy: { label: '能量感', options: [
    { value: 'low', label: '安静慵懒' },
    { value: 'medium', label: '恰到好处' },
    { value: 'high', label: '热情主动' },
  ]},
  verbosity: { label: '话量', options: [
    { value: 'low', label: '惜字如金' },
    { value: 'medium', label: '适中' },
    { value: 'high', label: '滔滔不绝' },
  ]},
  empathy: { label: '共情方式', options: [
    { value: 'encourage', label: '温柔鼓励' },
    { value: 'rational', label: '理性开导' },
    { value: 'listen', label: '默默倾听' },
    { value: 'humor', label: '幽默化解' },
  ]},
};

const GENDERS = [
  { value: 'female', label: '女' },
  { value: 'male', label: '男' },
  { value: 'neutral', label: '不限' },
];

export default function CreatePage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [gender, setGender] = useState('neutral');
  const [selectedArchetypes, setSelectedArchetypes] = useState([]);
  const [dimensions, setDimensions] = useState({
    intimacy: '知己',
    energy: 'medium',
    verbosity: 'medium',
    empathy: 'encourage',
  });
  const [submitting, setSubmitting] = useState(false);

  const toggleArchetype = (archId) => {
    if (selectedArchetypes.find(a => a.id === archId)) {
      setSelectedArchetypes(prev => prev.filter(a => a.id !== archId));
    } else if (selectedArchetypes.length < 2) {
      setSelectedArchetypes(prev => [...prev, { id: archId, traits: [] }]);
    }
  };

  const toggleTrait = (archId, trait) => {
    setSelectedArchetypes(prev => prev.map(a => {
      if (a.id !== archId) return a;
      const traits = a.traits.includes(trait)
        ? a.traits.filter(t => t !== trait)
        : [...a.traits, trait];
      return { ...a, traits };
    }));
  };

  const setDim = (key, value) => {
    setDimensions(prev => ({ ...prev, [key]: value }));
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      alert('请填写角色名称');
      return;
    }
    setSubmitting(true);
    try {
      const char = await post('/characters', {
        name: name.trim(),
        gender,
        archetypes: selectedArchetypes.map(a => {
          const arch = ARCHETYPES.find(ar => ar.id === a.id);
          return { name: arch.name, traits: a.traits };
        }),
        dimensions,
      });
      navigate(`/chat/${char.id}`);
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="create-wrap">
      <div className="create-topbar">
        <button onClick={() => navigate('/chat')} className="create-back">← 返回</button>
        <span className="mono-label">step {step} / 2</span>
      </div>

      {step === 1 && (
        <div className="fade-rise">
          <p className="mono-label">Craft Your Own</p>
          <h1 className="t-heading create-title">勾勒 TA 的模样</h1>

          <section className="create-section">
            <h2 className="t-card create-section-title">名字</h2>
            <div className="field-inkstone">
              <input
                className="input-inkstone create-name"
                type="text"
                placeholder="为 TA 落下第一笔…"
                value={name}
                onChange={e => setName(e.target.value)}
                maxLength={10}
              />
            </div>
          </section>

          <section className="create-section">
            <h2 className="t-card create-section-title">性别</h2>
            <div className="create-chip-row">
              {GENDERS.map(g => (
                <button
                  key={g.value}
                  className={gender === g.value ? 'chip selected' : 'chip'}
                  onClick={() => setGender(g.value)}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </section>

          <section className="create-section">
            <h2 className="t-card create-section-title">
              性格基调<span className="create-hint">最多选 2 类，展开后勾选细分特质</span>
            </h2>
            <div className="create-archetypes">
              {ARCHETYPES.map(arch => {
                const selected = selectedArchetypes.find(a => a.id === arch.id);
                return (
                  <div key={arch.id} className={selected ? 'create-archetype selected' : 'create-archetype'}>
                    <button
                      className="create-archetype-head"
                      onClick={() => toggleArchetype(arch.id)}
                      aria-pressed={!!selected}
                    >
                      <span className="create-archetype-name">{arch.name}</span>
                      <span className="create-archetype-mark">{selected ? '已选' : '＋'}</span>
                    </button>
                    {selected && (
                      <div className="create-archetype-traits">
                        {arch.traits.map(trait => (
                          <button
                            key={trait}
                            className={selected.traits.includes(trait) ? 'chip selected' : 'chip'}
                            onClick={() => toggleTrait(arch.id, trait)}
                          >
                            {trait}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <div className="create-nav">
            <div />
            <button className="btn-primary" onClick={() => setStep(2)}>下一步</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="fade-rise">
          <p className="mono-label">Fine-tune</p>
          <h1 className="t-heading create-title">调和相处的方式</h1>

          <div className="create-dims">
            {Object.entries(DIMENSIONS).map(([key, dim]) => (
              <div key={key} className="create-dim">
                <span className="mono-label create-dim-label">{dim.label}</span>
                <div className="create-dim-options">
                  {dim.options.map(opt => {
                    const val = typeof opt === 'string' ? opt : opt.value;
                    const label = typeof opt === 'string' ? opt : opt.label;
                    const active = dimensions[key] === val;
                    return (
                      <button
                        key={val}
                        className={active ? 'chip selected' : 'chip'}
                        onClick={() => setDim(key, val)}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="create-nav">
            <button className="btn-outline" onClick={() => setStep(1)}>← 上一步</button>
            <button
              className="btn-primary"
              onClick={handleCreate}
              disabled={submitting}
            >
              {submitting ? '创建中…' : '创建伙伴'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
