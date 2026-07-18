import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { post } from '../api';

const ARCHETYPES = [
  {
    id: 'wenrou',
    name: '温柔体贴',
    color: '#f472b6',
    traits: ['轻声细语', '善于倾听', '喜欢鼓励', '偶尔撒娇', '护短'],
  },
  {
    id: 'yuanqi',
    name: '元气治愈',
    color: '#fbbf24',
    traits: ['活力满满', '乐观向上', '爱讲冷笑话', '天然呆', '感染力强'],
  },
  {
    id: 'aojiao',
    name: '傲娇毒舌',
    color: '#f87171',
    traits: ['口是心非', '爱吐槽', '刀子嘴豆腐心', '小傲娇', '反差萌'],
  },
  {
    id: 'zhixing',
    name: '知性沉稳',
    color: '#6366f1',
    traits: ['理性分析', '见多识广', '娓娓道来', '偶尔幽默', '从容淡定'],
  },
  {
    id: 'shenmi',
    name: '神秘高冷',
    color: '#818cf8',
    traits: ['话少精简', '若即若离', '偶尔温柔暴击', '保持距离感', '观察力强'],
  },
];

const DIMENSIONS = {
  intimacy: { label: '亲密度', options: ['朋友', '知己', '暧昧', '恋人', '家人'] },
  energy: { label: '能量感', options: [
    { value: 'low', label: '低 — 安静慵懒' },
    { value: 'medium', label: '中 — 恰到好处' },
    { value: 'high', label: '高 — 热情主动' },
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
  { value: 'female', label: '女', emoji: '👩' },
  { value: 'male', label: '男', emoji: '👨' },
  { value: 'neutral', label: '不限', emoji: '💛' },
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
    <div style={styles.container}>
      {/* Top bar */}
      <div style={styles.topbar}>
        <button onClick={() => navigate('/')} style={styles.backBtn}>← 返回</button>
        <div style={styles.steps}>
          <div style={{ ...styles.stepDot, background: step >= 1 ? 'var(--accent)' : 'var(--border-color)' }} />
          <div style={{ ...styles.stepLine, background: step >= 2 ? 'var(--accent)' : 'var(--border-color)' }} />
          <div style={{ ...styles.stepDot, background: step >= 2 ? 'var(--accent)' : 'var(--border-color)' }} />
        </div>
      </div>

      {step === 1 && (
        <>
          {/* Step 1: Name & Gender */}
          <section style={styles.section}>
            <h2 style={styles.sectionTitle}>给你的伙伴取个名字</h2>
            <input
              style={styles.nameInput}
              type="text"
              placeholder="输入名字…"
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={10}
            />
          </section>

          <section style={styles.section}>
            <h2 style={styles.sectionTitle}>TA 的性别</h2>
            <div style={styles.genderRow}>
              {GENDERS.map(g => (
                <button
                  key={g.value}
                  style={{
                    ...styles.genderBtn,
                    borderColor: gender === g.value ? 'var(--accent)' : 'var(--border-color)',
                    background: gender === g.value ? 'var(--accent)' : 'var(--bg-secondary)',
                    color: gender === g.value ? '#fff' : 'var(--text-primary)',
                  }}
                  onClick={() => setGender(g.value)}
                >
                  <span style={styles.genderEmoji}>{g.emoji}</span>
                  {g.label}
                </button>
              ))}
            </div>
          </section>

          {/* Step 1: Archetypes */}
          <section style={styles.section}>
            <h2 style={styles.sectionTitle}>
              性格基调 <span style={styles.hint}>(最多选 2 类)</span>
            </h2>
            <div style={styles.archetypeGrid}>
              {ARCHETYPES.map(arch => {
                const selected = selectedArchetypes.find(a => a.id === arch.id);
                return (
                  <button
                    key={arch.id}
                    style={{
                      ...styles.archetypeBtn,
                      borderColor: selected ? arch.color : 'var(--border-color)',
                      background: selected ? arch.color + '15' : 'var(--bg-secondary)',
                    }}
                    onClick={() => toggleArchetype(arch.id)}
                  >
                    <div style={styles.archetypeName} {arch.name}>{arch.name}</div>
                    {selected && (
                      <div style={styles.traitsRow}>
                        {arch.traits.map(trait => (
                          <button
                            key={trait}
                            style={{
                              ...styles.traitTag,
                              background: selected.traits.includes(trait) ? arch.color : 'var(--bg-input)',
                              color: selected.traits.includes(trait) ? '#fff' : 'var(--text-secondary)',
                            }}
                            onClick={e => { e.stopPropagation(); toggleTrait(arch.id, trait); }}
                          >
                            {trait}
                          </button>
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          <div style={styles.navRow}>
            <div />
            <button style={styles.nextBtn} onClick={() => setStep(2)}>下一步 →</button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          {/* Step 2: Dimensions */}
          {Object.entries(DIMENSIONS).map(([key, dim]) => (
            <section key={key} style={styles.section}>
              <h2 style={styles.sectionTitle}>{dim.label}</h2>
              <div style={styles.optionsRow}>
                {dim.options.map(opt => {
                  const val = typeof opt === 'string' ? opt : opt.value;
                  const label = typeof opt === 'string' ? opt : opt.label;
                  const active = dimensions[key] === val;
                  return (
                    <button
                      key={val}
                      style={{
                        ...styles.optionBtn,
                        borderColor: active ? 'var(--accent)' : 'var(--border-color)',
                        background: active ? 'var(--accent)' : 'var(--bg-secondary)',
                        color: active ? '#fff' : 'var(--text-primary)',
                      }}
                      onClick={() => setDim(key, val)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}

          <div style={styles.navRow}>
            <button style={styles.backStepBtn} onClick={() => setStep(1)}>← 上一步</button>
            <button
              style={{ ...styles.nextBtn, opacity: submitting ? 0.7 : 1 }}
              onClick={handleCreate}
              disabled={submitting}
            >
              {submitting ? '创建中…' : '创建伙伴 ✨'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const styles = {
  container: {
    maxWidth: '640px', margin: '0 auto', padding: '24px 20px', minHeight: '100vh',
  },
  topbar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: '32px',
  },
  backBtn: {
    background: 'none', border: 'none', color: 'var(--text-secondary)',
    fontSize: '15px', cursor: 'pointer', padding: '4px',
  },
  steps: { display: 'flex', alignItems: 'center', gap: '8px' },
  stepDot: {
    width: '10px', height: '10px', borderRadius: '50%', transition: 'background 0.3s',
  },
  stepLine: {
    width: '24px', height: '2px', borderRadius: '1px', transition: 'background 0.3s',
  },
  section: { marginBottom: '32px' },
  sectionTitle: { fontSize: '18px', fontWeight: '600', marginBottom: '16px' },
  hint: { fontSize: '13px', color: 'var(--text-muted)', fontWeight: '400' },
  nameInput: {
    width: '100%', padding: '14px 16px', fontSize: '18px',
    background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', outline: 'none',
  },
  genderRow: { display: 'flex', gap: '12px' },
  genderBtn: {
    flex: 1, padding: '14px', border: '2px solid', borderRadius: 'var(--radius-md)',
    cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: '6px', fontSize: '14px', fontWeight: '600', transition: 'all 0.15s',
  },
  genderEmoji: { fontSize: '24px' },
  archetypeGrid: { display: 'flex', flexDirection: 'column', gap: '12px' },
  archetypeBtn: {
    padding: '16px', border: '2px solid', borderRadius: 'var(--radius-md)',
    cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
  },
  archetypeName: { fontSize: '16px', fontWeight: '600', marginBottom: '10px' },
  traitsRow: { display: 'flex', flexWrap: 'wrap', gap: '8px' },
  traitTag: {
    padding: '6px 12px', border: 'none', borderRadius: '20px',
    fontSize: '13px', cursor: 'pointer', transition: 'all 0.15s',
  },
  optionsRow: { display: 'flex', flexWrap: 'wrap', gap: '10px' },
  optionBtn: {
    padding: '10px 16px', border: '2px solid', borderRadius: 'var(--radius-sm)',
    fontSize: '14px', cursor: 'pointer', transition: 'all 0.15s',
  },
  navRow: {
    display: 'flex', justifyContent: 'space-between', marginTop: '24px',
    paddingBottom: '40px',
  },
  nextBtn: {
    padding: '12px 28px', background: 'var(--accent)', color: '#fff',
    border: 'none', borderRadius: 'var(--radius-md)', fontSize: '16px',
    fontWeight: '600', cursor: 'pointer',
  },
  backStepBtn: {
    padding: '12px 20px', background: 'var(--bg-secondary)', color: 'var(--text-primary)',
    border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)',
    fontSize: '15px', cursor: 'pointer',
  },
};
