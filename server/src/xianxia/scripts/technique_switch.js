// 剧本：转修功法 — 设置某功法为其类型的主修（每个类型各有一个主修）
// 触发示例："转修《太虚引气术》"、"改修虚海心经"、"主修御剑术"
const { parseDurationDays } = require('./utils');
const techniques = require('../techniques');

const TYPE_LABELS = { heart: '心法', spell: '术法', movement: '身法', secret: '秘术', strange_art: '诡术' };

module.exports = {
  id: 'technique_switch',

  match(actionText) {
    if (!/转修|改修|换修|主修/.test(actionText)) return null;
    // 提取功法名：优先《...》，其次关键词后的连续中文/字母
    let name = null;
    const quoted = actionText.match(/《([^》]+)》/);
    if (quoted) {
      name = quoted[1].trim();
    } else {
      const m = actionText.match(/(?:转修|改修|换修|主修)\s*([一-龥A-Za-z0-9]{2,12})/);
      if (m) name = m[1].trim();
    }
    if (!name) return { name: null };
    return { name };
  },

  resolve(character, { name }) {
    const days = Math.min(30, parseDurationDays('', 3));
    const learned = techniques.getLearned(character);

    if (learned.length === 0) {
      return {
        deltas: {},
        elapsedDays: 1,
        resultText: '你尚无习得任何功法，谈何转修。',
        renderParams: { outcome: 'no_technique' },
        options: ['继续修炼', '外出历练一番', '前往坊市'],
      };
    }

    const labelOf = (e) => {
      const t = techniques.getTemplate(e.name);
      return TYPE_LABELS[(t && t.type) || 'heart'] || '功法';
    };
    // 备选：非主修的已学功法（任何类型都可设为主修）
    const switchable = learned.filter(e => !e.main).slice(0, 3);

    // 未指明功法名 → 列出已学功法供选择
    if (!name) {
      const names = learned.map(e => `《${e.name}》${e.main ? '（主修中）' : ''}`).join('、');
      return {
        deltas: {},
        elapsedDays: 1,
        resultText: `你已习得 ${names}。要将哪一部设为主修？（例如：转修《${(switchable[0] || learned[0]).name}》）`,
        renderParams: { outcome: 'list', learned: names },
        options: switchable.map(e => `转修《${e.name}》`),
      };
    }

    const { list, switched, reason, type } = techniques.switchMainTechnique(character, name);

    if (!switched) {
      const owned = learned.find(e => e.name === name);
      const names = learned.map(e => `《${e.name}》`).join('、');
      return {
        deltas: {},
        elapsedDays: 1,
        resultText: !owned
          ? `你并未习得《${name}》。你已习得 ${names}。`
          : `《${name}》本就是你的主修${labelOf(owned)}，无需转修。`,
        renderParams: { outcome: !owned ? 'not_learned' : reason, name },
        options: switchable.map(e => `转修《${e.name}》`),
      };
    }

    const typeLabel = TYPE_LABELS[type] || '功法';
    const sets = { learned_techniques: JSON.stringify(list) };

    // 换主修心法：按新主修功法重算气海上限（当前修为超过新上限的部分散逸）
    let dissipateText = '';
    if (type === 'heart') {
      const newQiMax = techniques.recalcQiMax(character, list);
      const qiCur = character.qi_current || 0;
      sets.qi_max = newQiMax;
      if (qiCur > newQiMax) {
        sets.qi_current = newQiMax;
        dissipateText = ` 新路数与旧修为相冲，部分灵力散逸（修为 ${qiCur} → ${newQiMax}）。`;
      }
      return {
        deltas: {},
        sets,
        elapsedDays: days,
        resultText: `你用了${days}天将体内灵力按《${name}》的路数重新梳理周天。主修心法已转为《${name}》，气海上限随之变为 ${newQiMax}。${dissipateText}`,
        renderParams: { outcome: 'switched', name, type, qi_max: newQiMax },
        options: ['继续修炼', '外出历练一番', '前往坊市'],
      };
    }

    return {
      deltas: {},
      sets,
      elapsedDays: days,
      resultText: `你用了${days}天潜心揣摩《${name}》的关窍，将其奉为${typeLabel}主修——往后与此道相关的事务，它都会精进得更快。`,
      renderParams: { outcome: 'switched', name, type },
      options: ['继续修炼', '外出历练一番', '前往坊市'],
    };
  },
};
