// 剧本：接触诡道现象 — 主动前往深渊裂隙/雾中村/虚海
const { regionOf, randf, rand } = require('./utils');

const STRANGE_REALMS = {
  '北荒': { name: '深渊裂隙', corruption: [8, 15], bonus: '你在反光中看到了什么——你无法描述，但你知道那不是普通的幻象。' },
  '南疆': { name: '雾中村', corruption: [5, 10], bonus: '离开时你的行囊里多了几份材料。你不记得什么时候放进去的。' },
  '东海': { name: '虚海', corruption: [10, 15], bonus: '接下来的突破判定中，虚质会帮你。你不想深究它在通过什么方式帮你。' },
};

module.exports = {
  id: 'strange_contact',

  match(actionText) {
    if (!/接触.*诡异|靠近.*裂缝|走向.*雾|触碰.*镜子|深入.*虚海|探索.*异象|回应.*呼唤/.test(actionText)) return null;
    return {};
  },

  resolve(character) {
    const region = regionOf(character);
    const realm = STRANGE_REALMS[region];
    if (!realm) {
      return {
        deltas: {},
        elapsedDays: 3,
        resultText: '你循着那种感觉走，但它似乎不在这个方向上。这里的空气里没有那种气息。最近的诡道现象在${closestRealm}。',
        renderParams: { outcome: 'no_realm' },
        options: ['继续搜寻', '暂且作罢', '向前探索'],
      };
    }

    const corruptionGain = rand(realm.corruption[0], realm.corruption[1]);
    const spiritVal = character.spirit || 30;
  const qiVal = character.qi || 40;
    const essence = character.essence || 40;

    // 神低→额外异化
    let extraCorruption = 0;
    if (spiritVal < 40) extraCorruption = rand(3, 5);

    const totalCorruption = corruptionGain + extraCorruption;
    const realmBonus = realm.bonus;

    let extraItems = [];
    if (realm.name === '雾中村') {
      extraItems = [
        { name: '灵芝', item_type: 'material', grade: '凡品' },
        { name: '毒藤汁', item_type: 'material', grade: '凡品' },
      ];
    }

    return {
      deltas: {},
      sets: { strange_corruption: Math.min(100, (character.strange_corruption || 0) + totalCorruption) },
      items: extraItems,
      elapsedDays: rand(2, 4),
      resultText: `你走向${realm.name}。${realmBonus}（异化度 +${totalCorruption}）${extraCorruption > 0 ? ' 你的神念太弱，无法抵挡其中的一部分侵蚀。' : ''}`,
      renderParams: { outcome: 'contact', realm: realm.name, corruptionGain: totalCorruption },
      options: ['深入探索', '记录所见', '离开此地'],
    };
  },
};
