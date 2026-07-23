// 剧本：求教师长 — 消耗宗门 NPC 好感，换取主修功法深度经验
// 触发示例："向长老求教功法"、"请师长指点心法"
// 规则：好感度 ≥30 方可指点，一次 -10 好感；凡/灵品可带至圆满，宝/玄/圣品只能带到大成
const { db } = require('../../db');
const { rand } = require('./utils');
const techniques = require('../techniques');

const AFFECTION_REQ = 30;
const AFFECTION_COST = 10;

module.exports = {
  id: 'technique_mentor',

  match(actionText) {
    if (!/(求教|请教|指点|求学|赐教).{0,8}(功法|心法|修行关隘)|拜见师长/.test(actionText)) return null;
    return {};
  },

  resolve(character) {
    const main = techniques.getMainTechnique(character);
    if (!main) {
      return {
        deltas: {},
        elapsedDays: 1,
        resultText: '你连主修功法都没有，师长见了你也无从下手。',
        renderParams: { outcome: 'no_technique' },
        options: ['继续修炼', '拜入宗门', '前往坊市'],
      };
    }

    const tpl = techniques.getTemplate(main.name);

    // 诡品/无宗门传承的功法：无人可指点
    if (!tpl || tpl.grade === '诡品' || !tpl.faction) {
      return {
        deltas: {},
        elapsedDays: 1,
        resultText: tpl && tpl.grade === '诡品'
          ? `《${main.name}》的经文在你识海中游走，连你自己都说不清它的来路——这世上没有人能指点你，也没有人敢。`
          : `《${main.name}》并无宗门传承，天底下没有现成的师长可以请教，只能靠自己参悟。`,
        renderParams: { outcome: 'no_mentor', name: main.name },
        options: ['闭关参悟', '继续修炼', '外出历练一番'],
      };
    }

    // 找本宗存活 NPC（取第一个，通常为掌门/长老）
    const npc = db.prepare('SELECT * FROM xianxia_npcs WHERE faction = ? AND is_alive = 1 ORDER BY id LIMIT 1').get(tpl.faction);
    if (!npc) {
      return {
        deltas: {},
        elapsedDays: 1,
        resultText: `${tpl.faction}如今山门冷清，竟寻不到一位可以请教的师长。`,
        renderParams: { outcome: 'no_npc', faction: tpl.faction },
        options: ['闭关参悟', '外出历练一番'],
      };
    }

    // 好感度校验
    const rel = db.prepare('SELECT affection FROM xianxia_relationships WHERE character_id = ? AND npc_id = ?')
      .get(character.id, npc.id);
    const affection = rel ? rel.affection : 0;
    if (affection < AFFECTION_REQ) {
      return {
        deltas: {},
        elapsedDays: 1,
        resultText: `你向${npc.identity}${npc.name}求教《${main.name}》的关隘，对方只是淡淡看了你一眼，三言两语便把你打发了——交情尚浅，师长还不愿为你费心。（需要好感度 ${AFFECTION_REQ}，当前 ${Math.round(affection)}）`,
        renderParams: { outcome: 'low_affection', npcName: npc.name, affection },
        options: ['与师长攀谈', '闭关参悟', '告辞离开'],
      };
    }

    // 品级上限：凡/灵品可带至圆满(3)，宝/玄/圣品只能带到大成(2)
    const capDepth = ['凡品', '灵品'].includes(tpl.grade) ? 3 : 2;
    const entry = techniques.getLearned(character).find(e => e.name === main.name);
    if ((entry ? entry.depth : 0) >= capDepth) {
      return {
        deltas: {},
        elapsedDays: 1,
        resultText: `${npc.name}听完你的疑惑，抚须一笑："《${main.name}》你已登堂入室，老夫能教的都教了——往后的路，要你自己走了。"`,
        renderParams: { outcome: 'cap_reached', name: main.name, capDepth },
        options: ['闭关参悟', '外出历练一番', '继续修炼'],
      };
    }

    const days = rand(2, 5);
    const comp = character.comprehension || 50;
    const expGain = 40 * (comp / 50);
    const r = techniques.addDepthExp(character, main.name, expGain, { capDepth });

    const sets = {};
    if (r.gained > 0) sets.learned_techniques = JSON.stringify(r.list);
    if (r.levelUps.length > 0) sets.qi_max = techniques.recalcQiMax(character, r.list); // 深度提升后气海上限即时刷新

    let levelUpText = '';
    const extraRewards = [{ text: `领悟 +${r.gained}`, tone: 'gain' }];
    if (r.levelUps.length > 0) {
      const label = techniques.DEPTH_LABELS[r.levelUps[r.levelUps.length - 1]];
      levelUpText = ` 一语点醒梦中人——《${main.name}》的领悟踏入了${label}之境！`;
      extraRewards.push({ text: `《${main.name}》领悟·${label}`, tone: 'gain' });
    }

    return {
      deltas: {},
      sets: Object.keys(sets).length > 0 ? sets : undefined,
      npcEffects: [{ npcId: npc.id, delta: -AFFECTION_COST, reason: '耗费师长心力指点功法' }],
      extraRewards,
      elapsedDays: days,
      resultText: `${npc.identity}${npc.name}闭关前抽出${days}天，为你逐句拆解《${main.name}》的关窍。那些你苦思不得的地方，在师长口中不过是轻描淡写的一句"应当如此"。（好感 -${AFFECTION_COST}）${levelUpText}`,
      renderParams: { outcome: 'mentored', npcName: npc.name, name: main.name, expGain: r.gained, levelUps: r.levelUps },
      options: ['继续参悟', '回去修炼', '拜谢师长'],
    };
  },
};
