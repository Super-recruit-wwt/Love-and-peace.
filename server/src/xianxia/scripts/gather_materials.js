// 剧本：采集 — 按地区材料池随机 1-3 种
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
    const count = rand(1, 3);
    const items = [];
    for (let i = 0; i < count; i++) {
      items.push({ name: pick(pool), item_type: 'material', grade: '凡品' });
    }
    const elapsedDays = rand(1, 2);
    const names = items.map(i => i.name).join('、');
    return {
      deltas: {},
      items,
      elapsedDays,
      resultText: `采集${elapsedDays}天，寻获 ${count} 份材料：${names}。`,
      renderParams: { count, materials: names },
      options: ['继续采集', '去坊市出售', '回去休整'],
    };
  },
};
