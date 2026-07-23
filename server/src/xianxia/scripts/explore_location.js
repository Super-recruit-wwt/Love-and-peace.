// 剧本：探索 — 精气神修正（精-受伤，气-灵石，神-线索发现）
const { regionOf, rand, randf, pick } = require('./utils');
const techniques = require('../techniques');
const fortuneEvent = require('./fortune_event');

const CLUES = [
  '你无意中听到路人提起：苍梧山脉深处近来有异光冲天，深夜尤甚。',
  '茶摊老板说，最近总有陌生修士在打听"古丹方"的下落。',
  '你在墙角发现一枚刻着古怪纹路的残破玉简，似乎与某处秘境有关。',
  '有行商低声谈论：某地出现了不该出现的东西，懂行的人都绕道走。',
];

const REGION_MATERIALS = {
  '中州': ['茯苓', '朱砂', '铁木'],
  '北荒': ['寒铁', '雪参', '冰晶石'],
  '南疆': ['灵芝', '毒藤汁', '灵蛇蜕'],
  '东海': ['海灵草', '鲛珠', '珊瑚枝'],
  '西漠': ['赤铁矿', '沙金', '风蚀玉'],
};

module.exports = {
  id: 'explore_location',

  match(actionText) {
    if (!/探索|探查|搜寻|四处|转转|逛逛|查看周围|观察四周|环顾/.test(actionText)) return null;
    return {};
  },

  resolve(character) {
    // 15% 概率探索途中撞上机缘事件（fortune_event 同一套事件库与真实结算）
    if (Math.random() < 0.15) {
      const fr = fortuneEvent.resolve(character);
      if (fr.renderParams && fr.renderParams.outcome !== 'no_event') {
        fr.renderParams.passive = 'explore';
        return fr;
      }
    }

    const essence = character.essence || 40;
    const spiritVal = character.spirit || 30;
  const qiVal = character.qi || 40;
    const qiMax = character.qi_max || 100;
    const fortune = character.fortune ?? 50;
    const roll = randf(0, 1) * (0.7 + (fortune / 100) * 0.6);
    const region = regionOf(character);
    const elapsedDays = rand(1, 3);
    // 伤判定：精低更容易探索受伤
    const injuryChance = 0.3 * (1 - essence / 150);
    const injured = Math.random() < injuryChance;
    const injuryDelta = injured ? -rand(3, 8) : 0;

    // 7% 功法残卷（奇遇：习得未掌握的术法/身法/秘术，凡50% 灵35% 宝15%）
    if (roll > 0.93) {
      const art = techniques.randomUnlearnedArt(character);
      if (art) {
        const { list, learned } = techniques.learnTechnique(character, art.name, { makeMain: false });
        if (learned) {
          const deltas = {};
          if (injured) deltas.health = injuryDelta;
          const typeLabel = { spell: '术法', movement: '身法', secret: '秘术' }[art.type] || '功法';
          return {
            deltas,
            sets: { learned_techniques: JSON.stringify(list) },
            extraRewards: [{ text: `习得《${art.name}》`, tone: 'gain' }],
            elapsedDays,
            resultText: `探索${elapsedDays}天，你在一处坍塌的石龛里摸到半卷残页——竟是${art.grade}${typeLabel}《${art.name}》！你如获至宝，日夜揣摩，已初窥门径。${injured ? ` 途中被落石砸伤——生命 ${injuryDelta}` : ''}`,
            renderParams: { outcome: 'technique_scroll', technique: art.name, grade: art.grade, injured },
            options: ['闭关参悟新功法', '继续探索', '回去休整'],
          };
        }
      }
      // 无可学功法时落入线索分支
    }
    // 15% 线索（高神加成）
    if (roll > 0.78) {
      const clue = pick(CLUES);
      const deltas = {};
      if (injured) deltas.health = injuryDelta;
      return {
        deltas,
        elapsedDays,
        resultText: `探索${elapsedDays}天。${clue}（获得一条奇遇线索）${injured ? ` 途中踩滑摔了一跤——生命 ${injuryDelta}` : ''}`,
        renderParams: { outcome: 'clue', clue, injured },
        options: ['追踪这条线索', '继续探索', '暂且记下，日后再说'],
      };
    }
    // 20% 灵石（气加成数量）
    if (roll > 0.6) {
      const qiMod = 1 + qiMax / 300;
      const stones = Math.round(rand(5, 30) * qiMod);
      const deltas = { spirit_stones: stones };
      if (injured) deltas.health = injuryDelta;
      return {
        deltas,
        elapsedDays,
        resultText: `探索${elapsedDays}天，在一处隐蔽的石缝里摸到了 ${stones} 块灵石。${injured ? ` 过程中被碎石划伤了——生命 ${injuryDelta}` : ''}`,
        renderParams: { outcome: 'stones', stones, injured },
        options: ['继续深入探索', '前往坊市', '回去休整'],
      };
    }
    // 25% 材料
    if (roll > 0.35) {
      const name = pick(REGION_MATERIALS[region] || REGION_MATERIALS['中州']);
      const deltas = {};
      if (injured) deltas.health = injuryDelta;
      return {
        deltas,
        items: [{ name, item_type: 'material', grade: '凡品' }],
        elapsedDays,
        resultText: `探索${elapsedDays}天，寻获一份材料：${name}。${injured ? ` 采集时被植被划伤——生命 ${injuryDelta}` : ''}`,
        renderParams: { outcome: 'material', material: name, injured },
        options: ['继续采集', '去坊市出售', '回去休整'],
      };
    }
    // 40% 无获
    const deltas = {};
    if (injured) deltas.health = injuryDelta;
    return {
      deltas,
      elapsedDays,
      resultText: `探索${elapsedDays}天，一无所获。这一带似乎平静得有些过分。${injured ? ` 还不慎扭了脚——生命 ${injuryDelta}` : ''}`,
      renderParams: { outcome: 'nothing', injured },
      options: ['换个方向再探', '回去休整', '找人打听消息'],
    };
  },
};
