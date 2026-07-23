// 剧本：采集 — 精气神修正
const { regionOf, rand, pick } = require('./utils');

const REGION_POOLS = {
  '中州': ['茯苓', '朱砂', '铁木', '青云草', '百年黄精'],
  '北荒': ['寒铁', '雪参', '冰晶石', '冻土苔'],
  '南疆': ['灵芝', '毒藤汁', '灵蛇蜕', '雾隐花'],
  '东海': ['海灵草', '鲛珠', '珊瑚枝', '潮汐贝'],
  '西漠': ['赤铁矿', '沙金', '风蚀玉', '驼铃藤'],
};

module.exports = {
  id: 'gather_materials',

  match(actionText) {
    if (!/采集|采药|收集|挖矿|采些|摘取/.test(actionText)) return null;
    return {};
  },

  resolve(character) {
    const region = regionOf(character);
    const pool = REGION_POOLS[region] || REGION_POOLS['中州'];
    const essence = character.essence || 40;
    const spiritVal = character.spirit || 30;
  const qiVal = character.qi || 40;
    const corruption = character.strange_corruption || 0;

    let count = rand(1, 3);
    if (essence >= 60) count++;
    if (essence >= 120) count++;
  if (qiVal >= 80) count++;
  if (qiVal >= 120) count++;
    count = Math.min(count, 5);

    const items = [];
    for (let i = 0; i < count; i++) {
      items.push({ name: pick(pool), item_type: 'material', grade: '凡品' });
    }

    // 神高→稀有材料加成
    if (spiritVal >= 100 && Math.random() < 0.3) {
      items.push({ name: pick(pool), item_type: 'material', grade: '凡品' });
    }

    const elapsedDays = rand(1, 2);
    const names = items.map(i => i.name).join('、');

    let corruptText = '';
    if (corruption >= 41 && Math.random() < 0.2) {
      corruptText = ' 你注意到有一株植物在你靠近时微微颤抖——不是在风中，是你靠近之后才开始的。';
    }

    return {
      deltas: {},
      items,
      elapsedDays,
      resultText: `采集${elapsedDays}天，寻获 ${items.length} 份材料：${names}。${corruptText}`,
      renderParams: { count: items.length, materials: names },
      options: ['继续采集', '去坊市出售', '回去休整'],
    };
  },
};
