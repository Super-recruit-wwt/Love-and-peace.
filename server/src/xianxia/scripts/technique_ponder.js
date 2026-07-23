// 剧本：参悟功法 — 主动闭关参悟，累积功法深度经验
// 触发示例："参悟《太虚引气术》"、"闭关参悟"、"参研功法"
// 经验量：基础 rand(15,30) × 悟性/50 × 领悟速度 × 宗门加成(本宗地盘 ×1.5) × 悟道丹(insight_mult)
const { rand, buffMult, consumeBuffs, parseDurationDays } = require('./utils');
const techniques = require('../techniques');

module.exports = {
  id: 'technique_ponder',

  match(actionText) {
    if (!/参悟|参研|顿悟|研读|揣摩/.test(actionText)) return null;
    // 排除诡道ponder（strange_ponder 已处理"参悟诡道/异化"类语义）
    if (/诡|异化|污染|虚海|裂隙/.test(actionText)) return null;
    let name = null;
    const quoted = actionText.match(/《([^》]+)》/);
    if (quoted) {
      name = quoted[1].trim();
    } else {
      const m = actionText.match(/(?:参悟|参研|研读|揣摩)\s*([一-龥A-Za-z0-9]{2,12})/);
      if (m && !/功法|心法|一番|片刻|数日/.test(m[1])) name = m[1].trim();
    }
    return { name };
  },

  resolve(character, { name }) {
    const learned = techniques.getLearned(character);
    if (learned.length === 0) {
      return {
        deltas: {},
        elapsedDays: 1,
        resultText: '你盘膝坐下，才发现自己根本没有任何功法可以参悟。',
        renderParams: { outcome: 'no_technique' },
        options: ['继续修炼', '外出历练一番', '前往坊市'],
      };
    }

    // 目标功法：指定名称（须已学），缺省为主修
    let target;
    if (name) {
      target = learned.find(e => e.name === name);
      if (!target) {
        const names = learned.map(e => `《${e.name}》`).join('、');
        return {
          deltas: {},
          elapsedDays: 1,
          resultText: `你并未习得《${name}》。你已习得 ${names}。`,
          renderParams: { outcome: 'not_learned', name },
          options: learned.slice(0, 3).map(e => `参悟《${e.name}》`),
        };
      }
    } else {
      target = learned.find(e => e.main) || learned[0];
    }

    const tpl = techniques.getTemplate(target.name);
    const days = Math.min(30, Math.max(3, Math.round(parseDurationDays('', rand(3, 7)))));

    // 诡品功法：无法主动参悟——它在你体内自行生长（深度随异化度提升）
    if (tpl && tpl.grade === '诡品') {
      return {
        deltas: {},
        elapsedDays: days,
        resultText: `你试图静心参悟《${target.name}》，经文却在识海中自行翻涌——它不需要被理解，它只需要你继续沉沦。诡道功法随异化自行精进，无法主动参悟。`,
        renderParams: { outcome: 'strange_technique', name: target.name },
        options: ['继续修炼', '接触诡道现象', '离开此地'],
      };
    }

    const comp = character.comprehension || 50;
    const spiritVal = character.spirit || 30;

    // 基础经验：rand(15,30) × 悟性/50 × 领悟速度
    const learnSpeed = Number(techniques.unlockedEffect(character).learn_speed) || 1;
    let expGain = rand(15, 30) * (comp / 50) * learnSpeed;
    const notes = [];

    // 神低 → 神思不属，收获减半
    if (spiritVal < 30) {
      expGain *= 0.5;
      notes.push('神思不属，经义在眼前游移不定，收获大打折扣');
    }

    // 宗门加成：在本宗地盘参悟本宗功法 ×1.5（传功堂典籍、同门氛围）
    const loc = character.current_location || '';
    if (tpl && tpl.faction && loc.includes(tpl.faction)) {
      expGain *= 1.5;
      notes.push(`身处${tpl.faction}，传功堂典籍与同门谈玄论道让你触类旁通`);
    }

    // 悟道丹：insight_mult 乘区，本次参悟后消耗
    const sets = {};
    const insightMult = buffMult(character, 'insight_mult');
    if (insightMult !== 1) {
      expGain *= insightMult;
      sets.active_buffs = JSON.stringify(consumeBuffs(character, 'insight'));
      notes.push('悟道丹的药力化开，灵台一片清明，经义纤毫毕现');
    }

    const r = techniques.addDepthExp(character, target.name, expGain);
    if (r.gained > 0) sets.learned_techniques = JSON.stringify(r.list);
    if (r.levelUps.length > 0) sets.qi_max = techniques.recalcQiMax(character, r.list); // 深度提升后气海上限即时刷新

    const entry = r.list.find(e => e.name === target.name) || target;
    const next = techniques.nextThreshold(character, entry);
    const progressText = next != null
      ? `（领悟 ${entry.exp}/${next}）`
      : '（此功法已参透至顶）';

    let levelUpText = '';
    const extraRewards = [{ text: `领悟 +${r.gained}`, tone: 'gain' }];
    if (r.levelUps.length > 0) {
      const label = techniques.DEPTH_LABELS[r.levelUps[r.levelUps.length - 1]];
      levelUpText = ` 某一刻云开月明——《${target.name}》的关隘豁然贯通，你的领悟踏入了${label}之境！`;
      extraRewards.push({ text: `《${target.name}》领悟·${label}`, tone: 'gain' });
    }

    const noteText = notes.length > 0 ? ` ${notes.join('；')}。` : '';
    return {
      deltas: {},
      sets: Object.keys(sets).length > 0 ? sets : undefined,
      extraRewards,
      elapsedDays: days,
      resultText: `你闭门谢客，静心参悟《${target.name}》整整${days}天，于字里行间咂摸出几分前人未曾言明的意味。${noteText}${levelUpText}${progressText}`,
      renderParams: { outcome: 'ponder', name: target.name, expGain: r.gained, levelUps: r.levelUps },
      options: ['继续参悟', '回去修炼', '外出历练一番'],
    };
  },
};
