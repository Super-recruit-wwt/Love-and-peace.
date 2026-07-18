import { Link } from 'react-router-dom';
import './landing.css';

/*
 * Landing 页静态展示数据。
 * 头像色为青白低饱和传统色（presets.json 中的高饱和旧值不在营销页使用）。
 */
const PRESETS = [
  { name: '小暖', style: '温柔倾听者', color: '#B58490', desc: '温柔细腻的治愈系，适合倾诉和被理解', tagline: '今天过得怎么样？我都在听。' },
  { name: '阿星', style: '元气充电宝', color: '#C9A86B', desc: '阳光开朗的少年，乐观有活力', tagline: '嗨！今天也一起加油吧！' },
  { name: '屿白', style: '知性树洞', color: '#7C8A99', desc: '沉稳理性的大哥哥型，善于分析和开导', tagline: '慢慢说，时间还很多。' },
  { name: '小野', style: '傲娇损友', color: '#C07A6B', desc: '口是心非的傲娇系少女，轻松互怼', tagline: '哼，我才不是关心你呢……好吧，有一点点。' },
  { name: '暮暮', style: '静谧陪伴', color: '#8AA39B', desc: '话少安静，存在本身就是安慰', tagline: '不说话也没关系，我就在这里。' },
  { name: '酥酥', style: '甜蜜恋人', color: '#A98B72', desc: '温柔宠溺的恋人型男生', tagline: '等你很久了……今天想我了吗？' },
];

const ARCHETYPES = ['温柔体贴', '元气治愈', '傲娇毒舌', '知性沉稳', '神秘高冷'];

const DIMENSIONS = [
  { label: '亲密度', values: '朋友 · 知己 · 暧昧 · 恋人 · 家人' },
  { label: '能量感', values: '安静慵懒 · 恰到好处 · 热情主动' },
  { label: '话量', values: '惜字如金 · 适中 · 滔滔不绝' },
];

export default function LandingPage() {
  return (
    <div className="landing">
      {/* 磨砂导航：logo 左 / 链接中 / 操作右 */}
      <nav className="glass-bar">
        <div className="landing-nav-inner">
          <div className="landing-brand">
            <span className="seal seal--sm" aria-hidden="true">愛</span>
            <span className="t-en landing-brand-name">Love and Peace</span>
          </div>
          <div className="landing-nav-links">
            <a href="#companions">伙伴</a>
            <a href="#craft">定制</a>
          </div>
          <div className="landing-nav-actions">
            <Link to="/login" className="landing-login-link">登录</Link>
            <Link to="/register" className="btn-primary">免费开始</Link>
          </div>
        </div>
      </nav>

      {/* Hero：巨型宋体标题 + 聊天瓷面卡 */}
      <header className="landing-hero">
        <div className="landing-hero-copy">
          <p className="mono-label fade-rise">AI Emotional Companion</p>
          <h1 className="t-hero fade-rise delay-1">
            有些话，<br />说给懂的人听。
          </h1>
          <p className="t-lead fade-rise delay-2">
            六位性格各异的 AI 伙伴随时倾听——温柔的、元气的、傲娇的、沉稳的。
            或者，亲手创造一位只属于你的。
          </p>
          <div className="landing-hero-cta fade-rise delay-3">
            <Link to="/register" className="btn-primary">免费开始</Link>
            <a href="#companions" className="btn-link">先认识伙伴们</a>
          </div>
        </div>

        <div className="card-porcelain landing-demo fade-rise delay-2" aria-hidden="true">
          <div className="landing-demo-head">
            <span className="avatar-circle landing-demo-avatar" style={{ background: '#B58490' }}>暖</span>
            <div>
              <div className="landing-demo-name">小暖</div>
              <div className="mono-label">温柔倾听者 · 在线</div>
            </div>
          </div>
          <div className="landing-demo-body">
            <div className="mono-label landing-demo-time">21:47</div>
            <div className="bubble bubble--user">今天有点累，感觉什么都不太顺。</div>
            <div className="bubble bubble--ai">辛苦了。愿意跟我说说，是哪件事最让你挂心吗？我都在听。</div>
            <div className="bubble bubble--ai landing-demo-typing">
              <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
            </div>
          </div>
        </div>
      </header>

      {/* 六位伙伴：3 列无框编辑式网格 */}
      <section id="companions" className="landing-section">
        <p className="mono-label">Six Companions</p>
        <h2 className="t-display">六位伙伴，六种懂你</h2>
        <div className="landing-grid">
          {PRESETS.map((p) => (
            <article className="landing-companion" key={p.name}>
              <div className="landing-companion-head">
                <span className="avatar-circle" style={{ background: p.color }}>{p.name.slice(-1)}</span>
                <div>
                  <h3 className="t-card">{p.name}</h3>
                  <div className="mono-label">{p.style}</div>
                </div>
              </div>
              <p className="landing-companion-desc">{p.desc}</p>
              <p className="landing-companion-tagline">「{p.tagline}」</p>
            </article>
          ))}
        </div>
      </section>

      {/* 黛墨色带：性格定制 */}
      <section id="craft" className="band-dark">
        <div className="landing-band-inner">
          <p className="mono-label">Craft Your Own</p>
          <h2 className="t-display">性格，由你执笔</h2>
          <p className="t-lead">
            从五种基调中落笔，勾选细分特质，再调节亲密度、能量与话量——
            合成一段只属于你们的关系。
          </p>
          <div className="landing-band-chips">
            {ARCHETYPES.map((c, i) => (
              <span className={i === 0 ? 'chip selected' : 'chip'} key={c}>{c}</span>
            ))}
          </div>
          <div className="landing-band-rows">
            {DIMENSIONS.map((d) => (
              <div className="row-hairline" key={d.label}>
                <span className="mono-label landing-band-dim">{d.label}</span>
                <span className="landing-band-values">{d.values}</span>
              </div>
            ))}
          </div>
          <Link to="/register" className="btn-primary landing-band-cta">创造我的伙伴</Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="band-dark landing-footer">
        <div className="landing-footer-inner">
          <div className="landing-footer-brand">
            <span className="seal" aria-hidden="true">愛</span>
            <div>
              <div className="t-en landing-footer-name">Love and Peace</div>
              <p className="mono-label">warm words, any hour</p>
            </div>
          </div>
          <div className="landing-footer-links">
            <Link to="/login">登录</Link>
            <Link to="/register">注册</Link>
          </div>
        </div>
        <p className="t-caption landing-footer-note">以现代数字语言，翻译一份东方的温润。</p>
      </footer>
    </div>
  );
}
