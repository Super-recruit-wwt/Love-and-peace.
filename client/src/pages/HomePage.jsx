import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { get, post } from '../api';

const AVATAR_COLORS = {
  '#f472b6': 'linear-gradient(135deg, #f472b6, #fb7185)',
  '#fbbf24': 'linear-gradient(135deg, #fbbf24, #f59e0b)',
  '#6366f1': 'linear-gradient(135deg, #6366f1, #8b5cf6)',
  '#f87171': 'linear-gradient(135deg, #f87171, #ef4444)',
  '#818cf8': 'linear-gradient(135deg, #818cf8, #6366f1)',
  '#fb923c': 'linear-gradient(135deg, #fb923c, #f97316)',
};

export default function HomePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [presets, setPresets] = useState([]);
  const [myChars, setMyChars] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      get('/characters/presets').catch(() => []),
      get('/characters').catch(() => []),
    ]).then(([p, c]) => {
      setPresets(p);
      setMyChars(c);
      setLoading(false);
    });
  }, []);

  const handleSelectPreset = async (preset) => {
    try {
      const char = await post('/characters', {
        name: preset.name,
        gender: preset.gender,
        preset_id: preset.id,
        archetypes: preset.archetypes,
        dimensions: preset.dimensions,
        avatar_color: preset.avatar_color,
      });
      navigate(`/chat/${char.id}`);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleSelectMyChar = (char) => {
    navigate(`/chat/${char.id}`);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.loadingText}>加载中…</div>
      </div>
    );
  }

  const allMyChars = [
    ...myChars.filter(c => c.preset_id),
    ...myChars.filter(c => !c.preset_id),
  ];

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.greeting}>Hi, {user?.nickname}</h1>
          <p style={styles.subtitle}>今天想和谁聊聊天？</p>
        </div>
        <div style={styles.headerRight}>
          <Link to="/settings" style={styles.settingsBtn}>⚙️</Link>
          <button onClick={handleLogout} style={styles.logoutBtn}>退出</button>
        </div>
      </div>

      {/* My Characters */}
      {allMyChars.length > 0 && (
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>我的伙伴</h2>
          <div style={styles.grid}>
            {allMyChars.map(char => (
              <div
                key={char.id}
                style={styles.card}
                onClick={() => handleSelectMyChar(char)}
              >
                <div style={{
                  ...styles.avatar,
                  background: AVATAR_COLORS[char.avatar_color] || AVATAR_COLORS['#6366f1'],
                }}>
                  {char.name[0]}
                </div>
                <div style={styles.cardName}>{char.name}</div>
                {char.preset_id && <div style={styles.badge}>预设</div>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Preset Characters */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>选择一位伙伴</h2>
        <div style={styles.grid}>
          {presets.map(preset => (
            <div
              key={preset.id}
              style={styles.card}
              onClick={() => handleSelectPreset(preset)}
            >
              <div style={{
                ...styles.avatar,
                background: AVATAR_COLORS[preset.avatar_color] || AVATAR_COLORS['#6366f1'],
              }}>
                {preset.name[0]}
              </div>
              <div style={styles.cardName}>{preset.name}</div>
              <div style={styles.cardDesc}>{preset.description}</div>
              <div style={styles.tagline}>"{preset.tagline}"</div>
            </div>
          ))}

          {/* Create custom character card */}
          <div style={styles.createCard} onClick={() => navigate('/create')}>
            <div style={styles.createAvatar}>+</div>
            <div style={styles.cardName}>创建专属 Ta</div>
            <div style={styles.cardDesc}>自由定制性格与风格</div>
          </div>
        </div>
      </section>
    </div>
  );
}

const styles = {
  container: {
    maxWidth: '800px', margin: '0 auto', padding: '24px 20px', minHeight: '100vh',
  },
  loadingContainer: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    minHeight: '100vh',
  },
  loadingText: { color: 'var(--text-secondary)', fontSize: '16px' },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: '36px',
  },
  greeting: { fontSize: '26px', fontWeight: '700' },
  subtitle: { fontSize: '14px', color: 'var(--text-secondary)', marginTop: '6px' },
  headerRight: { display: 'flex', gap: '12px', alignItems: 'center' },
  settingsBtn: {
    background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-sm)', padding: '8px 12px', fontSize: '18px', cursor: 'pointer',
    textDecoration: 'none',
  },
  logoutBtn: {
    background: 'transparent', border: 'none', color: 'var(--text-secondary)',
    fontSize: '14px', cursor: 'pointer', padding: '8px',
  },
  section: { marginBottom: '36px' },
  sectionTitle: { fontSize: '18px', fontWeight: '600', marginBottom: '16px' },
  grid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '16px',
  },
  card: {
    background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)',
    padding: '20px', cursor: 'pointer',
    boxShadow: 'var(--shadow-sm)', transition: 'transform 0.15s, box-shadow 0.15s',
    display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
  },
  avatar: {
    width: '56px', height: '56px', borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontSize: '24px', fontWeight: '700',
    marginBottom: '12px',
  },
  cardName: { fontSize: '16px', fontWeight: '600', marginBottom: '6px' },
  cardDesc: { fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' },
  tagline: {
    fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic',
    lineHeight: '1.5',
  },
  badge: {
    marginTop: '8px', padding: '2px 8px', borderRadius: '10px',
    background: 'var(--accent)', color: '#fff', fontSize: '11px',
  },
  createCard: {
    background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)',
    padding: '20px', cursor: 'pointer',
    boxShadow: 'var(--shadow-sm)', border: '2px dashed var(--border-color)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
    transition: 'border-color 0.15s',
  },
  createAvatar: {
    width: '56px', height: '56px', borderRadius: '50%',
    background: 'var(--bg-input)', display: 'flex', alignItems: 'center',
    justifyContent: 'center', color: 'var(--text-muted)', fontSize: '28px',
    marginBottom: '12px',
  },
};
