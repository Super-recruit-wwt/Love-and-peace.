import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { get, post } from '../api';
import { qbAvatarColor } from '../avatarColors';
import './home.css';

export default function HomePage() {
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

  if (loading) {
    return (
      <div className="home-loading">
        <span className="seal" aria-hidden="true">愛</span>
        <span className="mono-label">loading</span>
      </div>
    );
  }

  const allMyChars = [
    ...myChars.filter(c => c.preset_id),
    ...myChars.filter(c => !c.preset_id),
  ];

  return (
    <div className="home-wrap">
      <div className="fade-rise">
        <Link to="/" className="home-back">← 门户</Link>
        <p className="mono-label" style={{ marginTop: 24 }}>Pick a Companion</p>
        <h1 className="t-heading home-title">今天想和谁聊聊？</h1>
      </div>

      {allMyChars.length > 0 && (
        <section className="home-section fade-rise delay-1">
          <p className="mono-label">My Companions</p>
          <div className="home-mine">
            {allMyChars.map(char => (
              <div
                key={char.id}
                className="row-hairline clickable"
                onClick={() => navigate(`/chat/${char.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && navigate(`/chat/${char.id}`)}
              >
                <span
                  className="avatar-circle"
                  style={{ background: qbAvatarColor(char.avatar_color), width: 40, height: 40, fontSize: 17 }}
                >
                  {char.name.slice(-1)}
                </span>
                <span className="home-mine-name">{char.name}</span>
                {char.preset_id && <span className="mono-label">preset</span>}
                <span className="home-mine-arrow" aria-hidden="true">→</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="home-section fade-rise delay-2">
        <p className="mono-label">Presets</p>
        <h2 className="t-heading home-section-title">选择一位伙伴</h2>
        <div className="home-grid">
          {presets.map(preset => (
            <article
              key={preset.id}
              className="home-companion"
              onClick={() => handleSelectPreset(preset)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && handleSelectPreset(preset)}
            >
              <div className="home-companion-head">
                <span className="avatar-circle" style={{ background: qbAvatarColor(preset.avatar_color) }}>
                  {preset.name.slice(-1)}
                </span>
                <div>
                  <h3 className="t-card">{preset.name}</h3>
                  {preset.archetypes?.[0] && (
                    <div className="mono-label">{preset.archetypes[0].name}</div>
                  )}
                </div>
              </div>
              <p className="home-companion-desc">{preset.description}</p>
              {preset.tagline && (
                <p className="home-companion-tagline">「{preset.tagline}」</p>
              )}
            </article>
          ))}

          <div
            className="home-create"
            onClick={() => navigate('/create')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && navigate('/create')}
          >
            <span className="home-create-icon" aria-hidden="true">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </span>
            <div className="home-create-name">创建专属 Ta</div>
            <p className="home-companion-desc">自由定制性格与相处方式</p>
          </div>
        </div>
      </section>
    </div>
  );
}
