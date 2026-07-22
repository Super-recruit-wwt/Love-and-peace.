// 剧本：探索当前位置 — 按气运加权从发现池掷结果
const { regionOf, rand, randf, pick } = require('./utils');

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
    const fortune = character.fortune ?? 50; // 隐藏气运加权
    const roll = randf(0, 1) * (0.7 + (fortune / 100) * 0.6);
    const region = regionOf(character);
    const elapsedDays = rand(1, 3);

    // 15% 线索（高气运加成后更易落入此档）
    if (roll > 0.85) {
      const clue = pick(CLUES);
      return {
        deltas: {},
        elapsedDays,
        resultText: `探索${elapsedDays}天。${clue}（获得一条奇遇线索）`,
        renderParams: { outcome: 'clue', clue },
        options: ['追踪这条线索', '继续探索', '暂且记下，日后再说'],
      };
    }
    // 20% 灵石
    if (roll > 0.6) {
      const stones = rand(5, 30);
      return {
        deltas: { spirit_stones: stones },
        elapsedDays,
        resultText: `探索${elapsedDays}天，在一处隐蔽的石缝里摸到了 ${stones} 块灵石。`,
        renderParams: { outcome: 'stones', stones },
        options: ['继续深入探索', '前往坊市', '回去休整'],
      };
    }
    // 25% 材料
    if (roll > 0.35) {
      const name = pick(REGION_MATERIALS[region] || REGION_MATERIALS['中州']);
      return {
        deltas: {},
        items: [{ name, item_type: 'material', grade: '凡品' }],
        elapsedDays,
        resultText: `探索${elapsedDays}天，寻获一份材料：${name}。`,
        renderParams: { outcome: 'material', material: name },
        options: ['继续采集', '去坊市出售', '回去休整'],
      };
    }
    // 40% 无获
    return {
      deltas: {},
      elapsedDays,
      resultText: `探索${elapsedDays}天，一无所获。这一带似乎平静得有些过分。`,
      renderParams: { outcome: 'nothing' },
      options: ['换个方向再探', '回去休整', '找人打听消息'],
    };
  },
};
