// 剧本：机缘历练 — 固定事件库（仿写素材，seeds/fortune_events.json）
// 结算完全由代码完成：事件按境界分档 + 修炼路径 + 异化度门槛过滤，权重抽取，
// 属性判定成败，收益/代价真实落库；LLM 只负责把已定结果渲染成叙事。
const fs = require('fs');
const path = require('path');
const { regionOf, rand, randf, parseJson, cultivationTier } = require('./utils');
const techniques = require('../techniques');

let EVENTS = null;
function loadEvents() {
  if (!EVENTS) {
    EVENTS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'seeds', 'fortune_events.json'), 'utf8'));
  }
  return EVENTS;
}

const PHYSICAL_STAGES = ['铜皮', '铁骨', '银血', '金身', '玉髓', '金刚', '不灭', '万象', '肉身成圣'];
const STRANGE_STAGES = ['初触', '共生', '同化', '深渊', '化诡', '噬主', '规则掌控'];

function tierIndex(stages, val) {
  for (let i = stages.length - 1; i >= 0; i--) {
    if ((val || '').includes(stages[i])) return i + 1;
  }
  return 0;
}

/** 事件分档：mortal(未入道) / low(炼气-筑基) / mid(金丹-元婴) / high(化神及以上)，取三条路径最高层级 */
function bandOf(character) {
  const c = parseJson(character.cultivation_paths, {});
  const tier = Math.max(
    cultivationTier(character),
    tierIndex(PHYSICAL_STAGES, c.physical),
    tierIndex(STRANGE_STAGES, c.strange)
  );
  if (tier <= 0) return 'mortal';
  if (tier <= 2) return 'low';
  if (tier <= 4) return 'mid';
  return 'high';
}

// 判定属性默认值（fortune 默认 50，其余按角色通用默认 40）
const STAT_DEFAULTS = { fortune: 50 };

module.exports = {
  id: 'fortune_event',

  match(actionText) {
    if (!/历练|机缘|碰运气|撞运气|闯荡|历险|外出走走|外出逛逛/.test(actionText)) return null;
    return {};
  },

  resolve(character) {
    const events = loadEvents();
    const band = bandOf(character);
    const region = regionOf(character);
    const corruption = character.strange_corruption || 0;
    const triggered = new Set(parseJson(character.fortune_events, []));
    const paths = parseJson(character.cultivation_paths, {});
    const onPath = p => p === 'any' || !!paths[p];

    const pool = events.filter(e =>
      e.band.includes(band) &&
      (e.paths || ['any']).some(onPath) &&
      (!e.regions || e.regions.includes(region)) &&
      corruption >= (e.min_corruption || 0) &&
      !(e.once && triggered.has(e.id))
    );

    const elapsedDays = rand(2, 7);
    if (pool.length === 0) {
      return {
        deltas: {},
        elapsedDays,
        resultText: `历练${elapsedDays}天，你走了不少路，也访了几处旧闻之地，却没有遇到什么特别的机缘。机缘一事，果然强求不得。`,
        renderParams: { outcome: 'no_event' },
        options: ['继续历练', '回去修炼', '探索四周'],
      };
    }

    // 权重抽取
    const total = pool.reduce((s, e) => s + (e.weight || 10), 0);
    let roll = Math.random() * total;
    let event = pool[pool.length - 1];
    for (const e of pool) {
      roll -= (e.weight || 10);
      if (roll <= 0) { event = e; break; }
    }

    // 属性判定：属性值 + 0~60 浮动 ≥ DC 则成功
    let success = true;
    if (event.check) {
      const statVal = character[event.check.stat] ?? STAT_DEFAULTS[event.check.stat] ?? 40;
      success = statVal + randf(0, 60) >= event.check.dc;
    }
    const branch = success ? event.success : (event.failure || event.success);

    const deltas = { ...(branch.deltas || {}) };
    // 物品 effect 统一序列化为字符串（落库列要求）
    const items = branch.items
      ? branch.items.map(i => ({ ...i, effect: i.effect ? JSON.stringify(i.effect) : null }))
      : undefined;
    const extraRewards = [...(branch.extraRewards || [])];
    const sets = {};
    if (event.once) sets.fortune_events = JSON.stringify([...triggered, event.id]);

    // 传承类事件：授予一部未习得的术法/身法/秘术（无可授时转为悟性补偿）
    if (success && branch.grantArt) {
      const art = techniques.randomUnlearnedArt(character);
      if (art) {
        const { list, learned } = techniques.learnTechnique(character, art.name, { makeMain: false });
        if (learned) {
          sets.learned_techniques = JSON.stringify(list);
          extraRewards.push({ text: `习得《${art.name}》`, tone: 'gain' });
        }
      }
      if (!sets.learned_techniques) {
        deltas.comprehension = (deltas.comprehension || 0) + 2;
        extraRewards.push({ text: '悟性 +2', tone: 'gain' });
      }
    }

    return {
      deltas,
      sets,
      items,
      extraRewards,
      elapsedDays,
      resultText: `${event.setup}${branch.text}`,
      renderParams: { eventId: event.id, eventTitle: event.title, outcome: success ? 'success' : 'failure' },
      options: branch.options || ['继续历练', '回去修炼', '探索四周'],
    };
  },

  // 供测试与调试使用
  _internals: { loadEvents, bandOf },
};
