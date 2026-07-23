// 剧本：施展秘术/诡术 — 付出代价换取非常规收益
// 触发示例："施展《血遁术》"、"使用搜魂术"、"运转燃命诀"
// 秘术使用中精进：每次施展 +10 深度经验；诡术不吃经验（随异化提升），每次施展加剧异化
const { rand, pick, regionOf, parseJson } = require('./utils');
const techniques = require('../techniques');

const REGION_MATERIALS = {
  '中州': ['茯苓', '朱砂', '铁木'],
  '北荒': ['寒铁', '雪参', '冰晶石'],
  '南疆': ['灵芝', '毒藤汁', '灵蛇蜕'],
  '东海': ['海灵草', '鲛珠', '珊瑚枝'],
  '西漠': ['赤铁矿', '沙金', '风蚀玉'],
};

module.exports = {
  id: 'technique_secret',

  match(actionText) {
    if (!/施展|使用.*秘术|使用.*诡术|运转.*诀|祭出|催动/.test(actionText)) return null;
    let name = null;
    const quoted = actionText.match(/《([^》]+)》/);
    if (quoted) {
      name = quoted[1].trim();
    } else {
      const m = actionText.match(/(?:施展|使用|运转|祭出|催动)\s*([一-龥A-Za-z0-9]{2,12})/);
      if (m && !/秘术|诡术|功法|全力/.test(m[1])) name = m[1].trim();
    }
    return { name };
  },

  resolve(character, { name }) {
    const secrets = techniques.learnedArts(character, 'secret')
      .concat(techniques.learnedArts(character, 'strange_art'));

    if (secrets.length === 0) {
      return {
        deltas: {}, elapsedDays: 0.5,
        resultText: '你并未习得任何秘术或诡术。这类非常手段，多在黑市、邪宗与诡道之地流传。',
        renderParams: { outcome: 'no_secret' },
        options: ['前往坊市打听', '继续修炼', '外出历练'],
      };
    }

    // 目标：指定名称（须已学的秘/诡术）；缺省时唯一一部自动选中，多部则列出
    let art = null;
    if (name) {
      art = secrets.find(s => s.name === name) || null;
      if (!art) {
        return {
          deltas: {}, elapsedDays: 0.5,
          resultText: `《${name}》不在你已学的秘术之列。你已掌握：${secrets.map(s => `《${s.name}》`).join('、')}。`,
          renderParams: { outcome: 'not_learned', name },
          options: secrets.slice(0, 3).map(s => `施展《${s.name}》`),
        };
      }
    } else if (secrets.length === 1) {
      art = secrets[0];
    } else {
      return {
        deltas: {}, elapsedDays: 0.5,
        resultText: `你已掌握 ${secrets.map(s => `《${s.name}》`).join('、')}。要施展哪一部？`,
        renderParams: { outcome: 'list' },
        options: secrets.slice(0, 3).map(s => `施展《${s.name}》`),
      };
    }

    const effect = art.effect;
    const cost = effect.cost || {};
    const isStrange = art.grade === '诡品';

    // 诡术异化门槛（如 噬影法 需异化度≥20）
    const tpl = techniques.getTemplate(art.name);
    const reqCorr = tpl && tpl.req ? Number(tpl.req.corruption) || 0 : 0;
    if (reqCorr > 0 && (character.strange_corruption || 0) < reqCorr) {
      return {
        deltas: {}, elapsedDays: 0.5,
        resultText: `你试图催动《${art.name}》，体内的东西却毫无反应——异化还不够深，它还不愿意理你。（需要异化度 ${reqCorr}）`,
        renderParams: { outcome: 'corruption_low', name: art.name, req: reqCorr },
        options: ['接触诡道现象', '暂且作罢'],
      };
    }

    // 代价校验：不足则施展失败（不扣数值）
    const qiCur = character.qi_current || 0;
    const costChecks = [
      ['health', character.health ?? 100, '生命'],
      ['spirit', character.spirit ?? 30, '神识'],
      ['lifespan', character.lifespan_remaining ?? 80, '寿元'],
      ['spirit_stones', character.spirit_stones ?? 0, '灵石'],
    ];
    for (const [key, cur, label] of costChecks) {
      if (cost[key] && cur <= cost[key]) {
        return {
          deltas: {}, elapsedDays: 0.5,
          resultText: `你正要施展《${art.name}》，却感到${label}已濒临枯竭——这一口气提不上来，法术散于无形。（${label}不足）`,
          renderParams: { outcome: 'cost_short', name: art.name, lack: label },
          options: ['回去休整', '暂且作罢'],
        };
      }
    }

    // 应用代价
    const deltas = {};
    const sets = {};
    const costText = [];
    if (cost.health) { deltas.health = -cost.health; costText.push(`生命 -${cost.health}`); }
    if (cost.spirit) { deltas.spirit = -cost.spirit; costText.push(`神 -${cost.spirit}`); }
    if (cost.lifespan) { deltas.lifespan_remaining = -cost.lifespan; costText.push(`寿元 -${cost.lifespan}年`); }
    if (cost.spirit_stones) { deltas.spirit_stones = -cost.spirit_stones; costText.push(`灵石 -${cost.spirit_stones}`); }
    if (cost.qi_current_ratio) {
      const qiCost = Math.round(qiCur * cost.qi_current_ratio);
      if (qiCost > 0) { deltas.qi_current = -qiCost; costText.push(`灵力 -${qiCost}`); }
    }

    // 应用收益
    const benefitText = [];
    const items = [];
    const extraRewards = [];
    const region = regionOf(character);

    if (effect.escape) {
      const discovered = parseJson(character.discovered_locations, []);
      const safe = discovered.filter(l => /城|镇|村/.test(l));
      const dest = safe.length > 0
        ? `${region}-${pick(safe)}`
        : `${region}-无名小镇`;
      sets.current_location = dest;
      benefitText.push(`你化作一道残影脱离险地，再落地时已在${dest}`);
    }
    if (effect.power_buff_pct) {
      sets.power_buff = JSON.stringify({ pct: effect.power_buff_pct });
      benefitText.push(`下一次交手战力临时提升 ${Math.round(effect.power_buff_pct * 100)}%`);
    }
    if (effect.breakthrough_spirit) {
      const buffs = parseJson(character.active_buffs, []);
      buffs.push({ stat: 'spirit', value: effect.breakthrough_spirit, remaining: 1, unit: 'breakthrough' });
      sets.active_buffs = JSON.stringify(buffs);
      benefitText.push(`卦象已成——下一次突破时神识增益 +${effect.breakthrough_spirit}`);
    }
    if (effect.heal) {
      deltas.health = (deltas.health || 0) + effect.heal;
      benefitText.push(`影子没入伤口，血肉以不属于人的方式蠕动愈合（生命 +${effect.heal}）`);
    }
    if (effect.spirit_stones) {
      const [lo, hi] = effect.spirit_stones;
      const stones = rand(lo, hi);
      deltas.spirit_stones = (deltas.spirit_stones || 0) + stones;
      benefitText.push(`从对方识海深处榨出 ${stones} 灵石的藏匿之处`);
    }
    if (effect.rob_item || effect.random_material) {
      const mat = pick(REGION_MATERIALS[region] || REGION_MATERIALS['中州']);
      items.push({ name: mat, item_type: 'material', grade: '凡品' });
      benefitText.push(effect.rob_item ? `顺手牵来一份材料：${mat}` : `虚质在你掌心凝成实物：${mat}——别问它原来是什么`);
    }

    // 诡术代价：异化加深
    if (effect.corruption) {
      sets.strange_corruption = Math.min(100, (character.strange_corruption || 0) + effect.corruption);
      costText.push(`异化 +${effect.corruption}`);
    }

    // 秘术使用中精进：所施秘术 +10 深度经验，其余秘术触类旁通三成（诡术随异化提升，不吃经验）
    let levelUpText = '';
    if (!isStrange) {
      const r = techniques.gainDepthExp(character, 10, { type: 'secret', boostName: art.name, boostMult: 1, otherMult: 0.3 });
      if (r.gains.length > 0) {
        sets.learned_techniques = JSON.stringify(r.list);
        for (const g of r.gains) {
          if (g.levelUps.length > 0) {
            const label = techniques.DEPTH_LABELS[g.levelUps[g.levelUps.length - 1]];
            levelUpText += ` 这一次施展格外圆熟——《${g.name}》的领悟踏入了${label}之境！`;
            extraRewards.push({ text: `《${g.name}》领悟·${label}`, tone: 'gain' });
          }
        }
      }
    }

    const costStr = costText.length > 0 ? `（${costText.join('，')}）` : '';
    return {
      deltas,
      sets: Object.keys(sets).length > 0 ? sets : undefined,
      items: items.length > 0 ? items : undefined,
      extraRewards: extraRewards.length > 0 ? extraRewards : undefined,
      elapsedDays: 0.5,
      resultText: `你掐诀施展《${art.name}》。${benefitText.join('；')}。${costStr}${levelUpText}`,
      renderParams: { outcome: 'cast', name: art.name, strange: isStrange },
      options: effect.escape ? ['查看四周', '找个地方休整', '继续赶路'] : ['继续修炼', '外出历练', '前往坊市'],
    };
  },
};
