import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { api } from '../../api';
import './xianxia-common.css';

export default function BirthPage() {
  const [character, setCharacter] = useState(null);
  const [narrative, setNarrative] = useState('');
  const [choices, setChoices] = useState([]);
  const [stage, setStage] = useState('birth'); // birth | awakening | choice | coming
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const c = location.state?.character;
    if (!c) {
      navigate('/xianxia');
      return;
    }
    setCharacter(c);
    // 生成出生叙事
    generateStage('birth', c);
  }, []);

  async function generateStage(s, char, choice) {
    setLoading(true);
    try {
      // 尝试从后端获取 LLM 生成的叙事（携带上一阶段玩家的选择）
      const res = await api.post(`/xianxia/characters/${char.id}/birth-narrative`, { stage: s, choice });
      setNarrative(res.narrative);
      setStage(s);
    } catch (err) {
      console.error('出生叙事生成失败，使用占位叙事:', err);
      // 降级为占位叙事
      const birthNarratives = {
        birth: `你出生在${char.birth_region}的一个${char.birth_background}家庭。${char.birth_background === '凡人农家' ? '那天没有异象，没有天降祥瑞，只有一个寻常的婴儿、一声寻常的啼哭。接生婆说这孩子哭得比别人大声些，也许将来是个有出息的。但接生婆对每个孩子都这么说。' : '你的降生伴随着一些不寻常的征兆，但还不足以引起大人物的注意。'}灵根测试的结果显示：${Object.entries(char.spirit_roots).map(([k,v]) => `${k}灵根${v}`).join('，')}。`,
        awakening: `六岁那年，你的天赋第一次真正显现。${Math.random() > 0.5 ? '那是一个普通的午后，你在院子里玩耍时突然感到体内有一股陌生的力量在流动。' : '那天夜里，你在睡梦中听到了一个声音——不是用耳朵听到的，而是直接出现在脑海里的。'}`,
        choice: `十二岁，你需要做出第一个重要的人生抉择。家里的人对你的天赋议论纷纷。有人说该送你去最近的宗门，有人说留在家里比较好，还有一个你不太熟悉的远房亲戚，说认识一个散修可以引荐。`,
        coming: `十六岁，你成年了。这些年你逐渐理解了自己的天赋意味着什么。你收拾好行囊，最后一次回望你出生的小镇。前路漫漫，修仙之路自此而始。`
      };
      setNarrative(birthNarratives[s] || `第${s}阶段的叙事……`);
      setStage(s);
    } finally {
      setLoading(false);
    }

    // 设置对应阶段的选项
    if (s === 'awakening') {
      setChoices([
        { label: '兴奋——这力量让我与众不同', action: 'embrace' },
        { label: '恐惧——我不想要这种异于常人的东西', action: 'fear' },
        { label: '隐藏——装作平凡的孩子，不让人知道', action: 'hide' },
      ]);
    } else if (s === 'choice') {
      setChoices([
        { label: '拜入路过收徒的小门派', action: 'sect' },
        { label: '留在家里帮农/帮工', action: 'stay' },
        { label: '独自去最近的城市闯荡', action: 'venture' },
      ]);
    } else if (s === 'coming') {
      setChoices([
        { label: '踏入修仙世界', action: 'start' },
      ]);
    }
  }

  async function handleChoice(choice) {
    setChoices([]);
    const nextMap = { birth: 'awakening', awakening: 'choice', choice: 'coming' };
    const next = nextMap[stage];
    if (next) {
      // 把玩家本阶段的选择传给服务端，让后续叙事承接
      await generateStage(next, character, choice.label);
    } else if (stage === 'coming') {
      // 完成启蒙（年龄与初始位置由服务端在 coming 阶段写入）
      navigate(`/xianxia/${character.id}`, { replace: true });
    }
  }

  if (!character) return <div className="x-loading">加载中……</div>;

  return (
    <div className="x-page x-birth-page">
      <div className="x-birth-stage">
        <span className="mono-label">
          {stage === 'birth' ? '出生' : stage === 'awakening' ? '六岁 · 天赋觉醒' : stage === 'choice' ? '十二岁 · 择路' : '十六岁 · 成人'}
        </span>
      </div>
      <div className="x-birth-narrative">
        <p>{narrative}</p>
        {loading && <p className="x-loading-text">命运正在编织……</p>}
      </div>
      {choices.length > 0 && (
        <div className="x-choices">
          {choices.map(c => (
            <button key={c.action} className="btn-primary" onClick={() => handleChoice(c)}>
              {c.label}
            </button>
          ))}
        </div>
      )}
      {choices.length === 0 && !loading && stage === 'birth' && (
        <button className="btn-primary" onClick={() => generateStage('awakening', character)}>继续</button>
      )}
    </div>
  );
}
