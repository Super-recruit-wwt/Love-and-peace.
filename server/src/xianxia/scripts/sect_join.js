// 剧本：拜入宗门 — 精气神修正 + 欺天面特殊装备
const { db } = require('../../db');
const { avgRoot, regionOf, rand, parseJson } = require('./utils');
const techniques = require('../techniques');

const REGION_SECTS = {
  '中州': '太虚剑宗',
  '北荒': '铁骨门',
  '南疆': '青木宗',
  '东海': '碧水宫',
  '西漠': '搬山宗',
};

// 站在哪个山门前就拜哪个宗门（当前地点含宗门名时优先于区域默认）
const KNOWN_SECTS = ['太虚剑宗', '浑天宗', '金刚寺', '万兽山', '铁骨门', '寒冰宗', '血河宗',
  '万毒教', '蛊神宗', '青木宗', '碧水宫', '搬山宗', '白骨观'];

// 邪修宗派：入门看恶名，清白者须歃血为誓
const EVIL_SECTS = ['万毒教', '蛊神宗', '白骨观', '血河宗'];

function sectAt(character) {
  const loc = character.current_location || '';
  for (const s of KNOWN_SECTS) {
    if (loc.includes(s)) return s;
  }
  return REGION_SECTS[regionOf(character)] || '太虚剑宗';
}

module.exports = {
  id: 'sect_join',

  match(actionText) {
    if (!/拜师|拜入|入门|加入.*宗|求道|投师|拜山门/.test(actionText)) return null;
    return {};
  },

  resolve(character) {
    const region = regionOf(character);
    const sect = sectAt(character);
    const isEvil = EVIL_SECTS.includes(sect);
    const essence = character.essence || 40;
    const qiMax = character.qi_max || 100;
    const corr = character.strange_corruption || 0;
    const infamy = character.infamy || 0;

    // 诡道异化者禁止入门
    if (corr >= 41) {
      return {
        deltas: {},
        elapsedDays: 1,
        resultText: `验灵碑前，你体内的异化气息刚刚接触到碑面——整块碑就发出了刺耳的尖鸣。执事的脸色瞬间变了。`,
        renderParams: { sect, success: false, reason: 'strange_corruption' },
        options: ['离开此地', '打听其他门路', '尝试解释'],
      };
    }

    // 分数：灵根 × 0.5 + 气 × 0.0015 + 悟性 × 0.3（邪派额外看重恶名）
    let score = avgRoot(character) * 0.5 + qiMax * 0.0015 + (character.comprehension || 50) * 0.3;
    if (isEvil) score += infamy * 0.5;
    let success = score >= 55 || Math.random() < score / 120;

    // 精≥100 体修破格录取
    const physicalAdmit = essence >= 100 && ['铁骨门','搬山宗'].includes(sect);

    // 欺天面：强制成功（一次性碎裂）
    const specialEquip = parseJson(character.special_equipment, []);
    const hasDeceiveHeaven = specialEquip.some(e => e === 'deceive_heaven');
    if (hasDeceiveHeaven) {
      success = true;
      // 标记欺天面已使用
      character.special_equipment = JSON.stringify(specialEquip.filter(e => e !== 'deceive_heaven'));
    }

    const elapsedDays = rand(1, 3);

    if (success || physicalAdmit) {
      const leader = db.prepare('SELECT id FROM xianxia_npcs WHERE faction = ? AND is_alive = 1 ORDER BY id LIMIT 1').get(sect);
      const affectionDelta = hasDeceiveHeaven ? -20 : 20;
      const reason = physicalAdmit ? '体修破格录取' : (hasDeceiveHeaven ? '欺天入门' : '拜入宗门');
      const extraSets = {};
      if (hasDeceiveHeaven) extraSets.special_equipment = character.special_equipment;

      // 邪派入门：恶名替代名望；清白之身须歃血为誓（生命 -15，恶名 +10）
      const joinDeltas = isEvil ? { infamy: 5 } : { fame: 5 };
      let bloodOathText = '';
      if (isEvil && infamy < 10 && !hasDeceiveHeaven) {
        joinDeltas.health = -15;
        joinDeltas.infamy = 15; // 歃血 +10 与入门 +5
        bloodOathText = '执事狞笑着递来一碗血酒："清白身子也想进门？歃血为誓，断了退路再说。"你一饮而尽，从此世间多了一名邪修。（生命 -15，恶名 +10）';
      }

      // 入门授业：传功堂授予本宗入门心法（灵品）；宗门无种子功法时授予散修《青云心法》
      // 同时授予本宗入门杂学（凡/灵品术法与身法，各至多一部）
      const entryTpl = techniques.entryTechniqueOfFaction(sect) || techniques.getTemplate('青云心法');
      const grantQueue = [];
      if (entryTpl) grantQueue.push(entryTpl);
      const artTpls = techniques.factionArts(sect);
      const firstSpell = artTpls.find(t => t.type === 'spell');
      const firstMovement = artTpls.find(t => t.type === 'movement');
      if (firstSpell) grantQueue.push(firstSpell);
      if (firstMovement && grantQueue.length < 3) grantQueue.push(firstMovement);

      const extraRewards = [];
      let techniqueText = '';
      let learnedList = null;
      for (const tpl of grantQueue) {
        const base = learnedList
          ? { ...character, learned_techniques: JSON.stringify(learnedList) }
          : character;
        const { list, learned, becameMain } = techniques.learnTechnique(base, tpl.name, { bypassReq: true });
        if (!learned) continue;
        learnedList = list;
        extraRewards.push({ text: `习得《${tpl.name}》`, tone: 'gain' });
        techniqueText += tpl.type === 'heart'
          ? `传功堂长老翻出一册《${tpl.name}》交到你手中："入门心法，勤加修习，莫要坠了宗门名声。"`
          : `临别时，执事又塞给你一卷《${tpl.name}》："宗门的${tpl.type === 'spell' ? '术法' : '身法'}，拿去防身。"`;
        if (becameMain) {
          // 新主修心法的底蕴直接重算气海上限（境界基数 × 功法倍率）
          const mult = Number(tpl.effect && tpl.effect.qi_max) > 0
            ? Number(tpl.effect.qi_max) / techniques.BASE_QI_MAX : 1;
          const { qiMaxForStage } = require('./utils');
          const stage = (parseJson(character.cultivation_paths, {}).xiandao) || '炼气初期';
          extraSets.qi_max = Math.round(qiMaxForStage(stage) * mult);
        }
      }
      if (learnedList) extraSets.learned_techniques = JSON.stringify(learnedList);

      return {
        deltas: joinDeltas,
        sets: Object.keys(extraSets).length > 0 ? extraSets : undefined,
        npcEffects: leader ? [{ npcId: leader.id, delta: affectionDelta, reason }] : [],
        extraRewards,
        elapsedDays,
        resultText: (hasDeceiveHeaven
          ? `${sect}的验灵碑不知为何放你进去了。但掌门的眼神带着审视——你能感觉到。`
          : physicalAdmit
          ? `${sect}的执事摇了摇头:"灵根不够。"但另一位长老捏了捏你的手臂——"这体魄，收。"（体修破格录取，名望 +5）`
          : isEvil
          ? `${sect}的山门阴风阵阵。守门的弟子打量你半晌，侧身让开一条路——你被录为外门弟子。（恶名 +5）${bloodOathText}`
          : `${sect}的入门测试持续了${elapsedDays}天。你的资质通过了验灵碑的检验，被录为外门弟子。（名望 +5）`) + techniqueText,
        renderParams: { sect, success: true, score: Math.round(score), physicalAdmit, deceived: hasDeceiveHeaven, evil: isEvil, bloodOath: bloodOathText !== '', technique: entryTpl ? entryTpl.name : null },
        options: ['前往传功堂参悟功法', '熟悉宗门环境', '拜见诸位师长'],
      };
    }

    return {
      deltas: {},
      elapsedDays,
      resultText: isEvil
        ? `${sect}的守门弟子挡在你面前："就这点恶名也想进门？先去外头做几票狠的，再来谈入门。"（提示：恶名 ≥10 或资质足够方可入邪派）`
        : `${sect}的入门测试持续了${elapsedDays}天。验灵碑前，执事摇了摇头——你的资质，还入不了${sect}的法眼。`,
      renderParams: { sect, success: false, score: Math.round(score), evil: isEvil },
      options: isEvil ? ['去坊市打听狠活儿', '回去继续修炼再试', '离开此地'] : ['回去继续修炼再试', '打听其他宗门的门路', '离开此地'],
    };
  },
};
