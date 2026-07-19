import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import './portal.css';

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function greetingByHour() {
  const h = new Date().getHours();
  if (h < 5) return '夜深了';
  if (h < 12) return '早上好';
  if (h < 18) return '下午好';
  return '晚上好';
}

function monoDate() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${WEEKDAYS[d.getDay()]} · ${mm}.${dd}`;
}

export default function PortalPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/welcome');
  };

  return (
    <div className="portal-wrap">
      <div className="portal-head fade-rise">
        <div>
          <p className="mono-label">{monoDate()}</p>
          <h1 className="t-display portal-greeting">
            {greetingByHour()}，{user?.nickname}
          </h1>
          <p className="portal-sub">今天想聊点什么？</p>
        </div>
        <div className="portal-actions">
          <Link to="/settings" className="btn-outline">设置</Link>
          <button onClick={handleLogout} className="portal-logout">退出</button>
        </div>
      </div>

      <section className="fade-rise delay-1">
        <p className="mono-label">Sections</p>
        <h2 className="t-heading portal-section-title">探索板块</h2>
        <div className="portal-grid">
          <div
            className="card-porcelain hoverable portal-card"
            onClick={() => navigate('/chat')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && navigate('/chat')}
          >
            <span className="portal-card-icon" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </span>
            <div className="portal-card-name">镜花缘</div>
            <div className="portal-card-desc">
              与专属虚拟伙伴畅聊，定制性格，获得情感陪伴
            </div>
          </div>

          <div
            className="card-porcelain hoverable portal-card"
            onClick={() => navigate('/voices')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && navigate('/voices')}
          >
            <span className="portal-card-icon" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </span>
            <div className="portal-card-name">众声</div>
            <div className="portal-card-desc">
              几位人格各异的 AI 围坐论道，你可旁听、点名、随时插话
            </div>
          </div>

          <div className="portal-card-pending" aria-hidden="true">
            <span className="mono-label">coming soon</span>
            <div className="portal-card-pending-name">新的板块，正在窑中</div>
          </div>
        </div>
      </section>
    </div>
  );
}
