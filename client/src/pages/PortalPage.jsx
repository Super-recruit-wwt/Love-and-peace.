import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../AuthContext';

export default function PortalPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.greeting}>Hi, {user?.nickname}</h1>
          <p style={styles.subtitle}>欢迎来到 Love and Peace</p>
        </div>
        <div style={styles.headerRight}>
          <Link to="/settings" style={styles.settingsBtn}>⚙️</Link>
          <button onClick={handleLogout} style={styles.logoutBtn}>退出</button>
        </div>
      </div>

      {/* Section cards */}
      <section>
        <h2 style={styles.sectionTitle}>探索板块</h2>
        <div style={styles.grid}>
          {/* AI Chat card */}
          <div style={styles.card} onClick={() => navigate('/chat')}>
            <div style={styles.cardIcon}>💬</div>
            <div style={styles.cardName}>AI 陪伴聊天</div>
            <div style={styles.cardDesc}>
              与专属虚拟伙伴畅聊，定制性格，获得情感陪伴
            </div>
          </div>

          {/* Placeholder cards for future sections */}
          <div style={styles.placeholderCard}>
            <div style={styles.placeholderIcon}>✨</div>
            <div style={styles.placeholderLabel}>更多板块</div>
            <div style={styles.placeholderHint}>敬请期待</div>
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
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: '40px',
  },
  greeting: { fontSize: '26px', fontWeight: '700' },
  subtitle: { fontSize: '14px', color: 'var(--text-secondary)', marginTop: '6px' },
  headerRight: { display: 'flex', gap: '12px', alignItems: 'center' },
  settingsBtn: {
    background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-sm)', padding: '8px 12px', fontSize: '18px',
    cursor: 'pointer', textDecoration: 'none',
  },
  logoutBtn: {
    background: 'transparent', border: 'none', color: 'var(--text-secondary)',
    fontSize: '14px', cursor: 'pointer', padding: '8px',
  },
  sectionTitle: { fontSize: '18px', fontWeight: '600', marginBottom: '20px' },
  grid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '20px',
  },
  card: {
    background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)',
    padding: '28px 24px', cursor: 'pointer',
    boxShadow: 'var(--shadow-sm)',
    transition: 'transform 0.15s, box-shadow 0.15s',
  },
  cardIcon: { fontSize: '36px', marginBottom: '14px' },
  cardName: { fontSize: '17px', fontWeight: '600', marginBottom: '8px' },
  cardDesc: { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6' },
  placeholderCard: {
    background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)',
    padding: '28px 24px', border: '2px dashed var(--border-color)',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    textAlign: 'center', opacity: 0.6,
  },
  placeholderIcon: { fontSize: '36px', marginBottom: '14px' },
  placeholderLabel: { fontSize: '17px', fontWeight: '600', marginBottom: '6px' },
  placeholderHint: { fontSize: '13px', color: 'var(--text-muted)' },
};
