// 剧本：坊市交易 — 价格受名望修正，买卖简明判定
const { db } = require('../../db');
const { rand, pick } = require('./utils');

const BUYABLES = [
  { name: '回气丹', item_type: 'pill', grade: '凡品', price: 30 },
  { name: '轻身符', item_type: 'misc', grade: '凡品', price: 20 },
  { name: '精铁剑', item_type: 'treasure', grade: '凡品', price: 50 },
  { name: '养气散', item_type: 'pill', grade: '凡品', price: 15 },
];

module.exports = {
  id: 'trade',

  match(actionText) {
    if (!/坊市|交易|买卖|出售|购买|卖货|买|卖|摆摊/.test(actionText)) return null;
    // "离开坊市"类输入优先判为离开，避免落入 browse 分支造成情境不匹配
    if (/离开|走出|离去|脱身/.test(actionText) && /坊市|集市/.test(actionText)) return { mode: 'leave' };
    const isSell = /卖|出售|出手|摆摊/.test(actionText) && !/买/.test(actionText);
    const isBuy = /买|购买|购置|采购/.test(actionText) && !/卖|出售/.test(actionText);
    return { mode: isSell ? 'sell' : isBuy ? 'buy' : 'browse' };
  },

  resolve(character, { mode }) {
    const fameMod = 1 + (character.fame || 0) / 200; // 名望抬价

    if (mode === 'leave') {
      return {
        deltas: {}, elapsedDays: 0.5,
        resultText: '你离开坊市，回到落脚的客栈一带。街市的喧嚣渐渐被抛在身后。',
        renderParams: { outcome: 'leave' },
        options: ['回客栈歇脚', '出城走走', '探索四周'],
      };
    }

    if (mode === 'sell') {
      const stocks = db.prepare(
        "SELECT id, name FROM xianxia_items WHERE character_id = ? AND item_type = 'material' ORDER BY id LIMIT 3"
      ).all(character.id);
      if (stocks.length === 0) {
        return {
          deltas: {}, elapsedDays: 0.5,
          resultText: '你在坊市转了一圈，想卖点什么，却发现行囊里并没有什么拿得出手的材料。',
          renderParams: { outcome: 'nothing_to_sell' },
          options: ['去采集材料', '看看能买什么', '离开坊市'],
        };
      }
      let total = 0;
      for (const s of stocks) total += Math.round(rand(6, 14) * fameMod);
      return {
        deltas: { spirit_stones: total },
        removeItemIds: stocks.map(s => s.id),
        elapsedDays: 0.5,
        resultText: `你在坊市出手了 ${stocks.length} 份材料（${stocks.map(s => s.name).join('、')}），入账 ${total} 灵石。`,
        renderParams: { outcome: 'sold', count: stocks.length, total },
        options: ['再看看能买什么', '继续出售', '离开坊市'],
      };
    }

    if (mode === 'buy') {
      const item = pick(BUYABLES);
      const price = Math.max(1, Math.round(item.price * (2 - Math.min(fameMod, 1.25)))); // 名望高者享折扣
      if ((character.spirit_stones || 0) < price) {
        return {
          deltas: {}, elapsedDays: 0.5,
          resultText: `你看中了${item.name}，摊主开价 ${price} 灵石——但你囊中羞涩，只能悻悻作罢。`,
          renderParams: { outcome: 'cant_afford', itemName: item.name, price },
          options: ['去卖些材料换钱', '看看别的摊位', '离开坊市'],
        };
      }
      return {
        deltas: { spirit_stones: -price },
        items: [{ name: item.name, item_type: item.item_type, grade: item.grade }],
        elapsedDays: 0.5,
        resultText: `你花 ${price} 灵石买下了${item.name}。摊主笑呵呵地送你出了摊位。`,
        renderParams: { outcome: 'bought', itemName: item.name, price },
        options: ['再去别处逛逛', '出售一些材料', '离开坊市'],
      };
    }

    // browse
    return {
      deltas: {}, elapsedDays: 0.5,
      resultText: '你在坊市里逛了一圈：丹药、符箓、法器琳琅满目，吆喝声此起彼伏。',
      renderParams: { outcome: 'browse' },
      options: ['出售材料', '购买补给', '离开坊市'],
    };
  },
};
