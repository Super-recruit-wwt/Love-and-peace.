// 剧本：坊市交易 — 价格受名望修正，买卖简明判定
const { db } = require('../../db');
const { rand, pick, cultivationTier } = require('./utils');
const techniques = require('../techniques');
const PILLS = require('../seeds/pills.json');

const BUYABLES = [
  { name: '回气丹', item_type: 'pill', grade: '凡品', price: 30, effect: { qi_current: 20 } },
  { name: '轻身符', item_type: 'talisman', grade: '凡品', price: 20, effect: { travel_speed: 0.6 } },
  { name: '精铁剑', item_type: 'weapon', grade: '凡品', price: 50, slot: 'weapon', attack: 8 },
  { name: '养气散', item_type: 'pill', grade: '凡品', price: 15, effect: { qi_current: 10 } },
];

// 功法残页：购买后习得随机未学的术法/身法/秘术（凡品残页限购凡/灵品，灵品残页可到宝品）
const TECH_SCROLLS = [
  { scroll: true, grade: '凡品', price: 80, poolGrades: ['凡品', '灵品'], poolWeights: [0.7, 0.3] },
  { scroll: true, grade: '灵品', price: 260, poolGrades: ['凡品', '灵品', '宝品'], poolWeights: [0.35, 0.45, 0.2] },
];

// 丹药上架门槛：品级 vs 角色大境界层级（0=未入道 1=炼气 2=筑基 3=金丹 5=化神）
// 凡品/灵品随时可买；宝品需筑基；玄品需金丹；圣品（渡劫丹等）坊市不出售，保持稀缺
const GRADE_GATE = { '凡品': 0, '灵品': 0, '宝品': 2, '玄品': 3 };
function pillPoolFor(character) {
  const tier = cultivationTier(character);
  return PILLS
    .filter(p => p.buy_price && p.grade !== '圣品' && tier >= (GRADE_GATE[p.grade] ?? 0))
    .map(p => ({ name: p.name, item_type: 'pill', grade: p.grade, price: p.buy_price, effect: p.effect }));
}

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
    const fameMod = 1 + (character.fame || 0) / 200;
    const spiritVal = character.spirit || 30;
    const essence = character.essence || 40;
  const qiVal = character.qi || 40;

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
      // 合并杂货、功法残页与丹药池（丹药按角色境界上架，渡劫丹等圣品不出售）
      const pool = BUYABLES.concat(TECH_SCROLLS).concat(pillPoolFor(character));
      const item = pick(pool);
      const price = Math.max(1, Math.round(item.price * (2 - Math.min(fameMod, 1.25))));
      // 神高→讲价优惠
      let finalPrice = price;
      if (spiritVal >= 80) finalPrice = Math.max(1, Math.round(price * (1 - spiritVal / 400)));
  if (qiVal >= 80) finalPrice = Math.max(1, Math.round(finalPrice * (1 - qiVal / 400))); // 气高→灵力亲和，议价更易
      if ((character.spirit_stones || 0) < finalPrice) {
        return {
          deltas: {}, elapsedDays: 0.5,
          resultText: `你看中了${item.name || item.grade + '功法残页'}，摊主开价 ${finalPrice} 灵石——但你囊中羞涩，只能悻悻作罢。`,
          renderParams: { outcome: 'cant_afford', itemName: item.name || '功法残页', price: finalPrice },
          options: ['去卖些材料换钱', '看看别的摊位', '离开坊市'],
        };
      }

      // 功法残页：习得随机未学术法/身法/秘术；已无可学时摊主退款改推杂货
      // 黑水港黑市：默许邪修功法流通，且优先抽邪修残页
      if (item.scroll) {
        const isBlackMarket = (character.current_location || '').includes('黑水港');
        let art = null;
        if (isBlackMarket) {
          art = techniques.randomUnlearnedArt(character, {
            grades: item.poolGrades, gradeWeights: item.poolWeights, onlyEvil: true,
          });
        }
        if (!art) {
          art = techniques.randomUnlearnedArt(character, {
            grades: item.poolGrades, gradeWeights: item.poolWeights,
            excludeEvil: !isBlackMarket,
          });
        }
        if (art) {
          const { list, learned } = techniques.learnTechnique(character, art.name, { makeMain: false });
          if (learned) {
            const typeLabel = { spell: '术法', movement: '身法', secret: '秘术' }[art.type] || '功法';
            return {
              deltas: { spirit_stones: -finalPrice },
              sets: { learned_techniques: JSON.stringify(list) },
              extraRewards: [{ text: `习得《${art.name}》`, tone: 'gain' }],
              elapsedDays: 0.5,
              resultText: `你花 ${finalPrice} 灵石从一游商手中买下一卷残页，抖开一看——竟是${art.grade}${typeLabel}《${art.name}》！摊主嘿嘿一笑："货已离手，是宝是废纸，全看客官造化。"`,
              renderParams: { outcome: 'bought_scroll', technique: art.name, grade: art.grade, price: finalPrice },
              options: ['闭关参悟新功法', '再去别处逛逛', '离开坊市'],
            };
          }
        }
        // 池子已空：改买一件杂货兜底
        const fallback = pick(BUYABLES);
        return {
          deltas: { spirit_stones: -finalPrice },
          items: [{
            name: fallback.name, item_type: fallback.item_type, grade: fallback.grade,
            slot: fallback.slot || null, attack: fallback.attack || null, defense: fallback.defense || null,
            effect: fallback.effect ? JSON.stringify(fallback.effect) : null,
          }],
          elapsedDays: 0.5,
          resultText: `功法残页你已搜罗殆尽，摊主挠挠头，转而塞给你一件${fallback.name}抵价 ${finalPrice} 灵石。`,
          renderParams: { outcome: 'bought', itemName: fallback.name, price: finalPrice },
          options: ['再去别处逛逛', '出售一些材料', '离开坊市'],
        };
      }

      return {
        deltas: { spirit_stones: -finalPrice },
        items: [{
          name: item.name, item_type: item.item_type, grade: item.grade,
          slot: item.slot || null, attack: item.attack || null, defense: item.defense || null,
          effect: item.effect ? JSON.stringify(item.effect) : null,
        }],
        elapsedDays: 0.5,
        resultText: `你花 ${finalPrice} 灵石买下了${item.name}。摊主笑呵呵地送你出了摊位。`,
        renderParams: { outcome: 'bought', itemName: item.name, price: finalPrice },
        options: ['再去别处逛逛', '出售一些材料', '离开坊市'],
      };
    }

    // browse
    // 精高→多一个搬运打工option
    const browseOptions = ['出售材料', '购买补给', '离开坊市'];
    if (essence >= 80) browseOptions.splice(1, 0, '搬运重货打工——体力换灵石');
    // 高境界修士问起渡劫丹：有价无市
    const scarcityText = cultivationTier(character) >= 3
      ? '角落里一位修士正打听渡劫丹的下落，摊主们纷纷摇头——那等渡劫圣丹有价无市，只存在于传说与大人物的私藏之中。'
      : '';
    return {
      deltas: {}, elapsedDays: 0.5,
      resultText: `你在坊市里逛了一圈：丹药、符箓、法器琳琅满目，吆喝声此起彼伏。${scarcityText}`,
      renderParams: { outcome: 'browse' },
      options: browseOptions,
    };
  },
};
