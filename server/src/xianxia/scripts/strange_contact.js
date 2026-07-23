// 剧本：接触诡道现象 — 主动前往深渊裂隙/雾中村/虚海
const { regionOf, randf, rand } = require('./utils');
const techniques = require('../techniques');

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

    const newCorruption = Math.min(100, (character.strange_corruption || 0) + totalCorruption);
    const sets = { strange_corruption: newCorruption };
    const extraRewards = [];

    // 诡道功法授予链：异化度达到门槛即"自行习得"（不自动转主修，可用"转修"切换）
    // 虚海≥10《虚海心经》 / 雾中村≥10《雾中行》 / 虚海≥20《噬影法》 / 深渊裂隙≥40《虚质塑形》
    const STRANGE_ARTS = {
      '虚海': [['虚海心经', 10], ['噬影法', 20]],
      '雾中村': [['雾中行', 10]],
      '深渊裂隙': [['虚质塑形', 40]],
    };
    const STRANGE_ART_TEXT = {
      '虚海心经': ' 离海之际，一段不属于任何语言的经文在你识海中自行浮现——《虚海心经》。你不知道自己是什么时候"学会"的。',
      '噬影法': ' 你的影子在地上多停留了一瞬才跟上你。《噬影法》的法门随之烙进记忆，像它本来就在那里。',
      '雾中行': ' 雾散时，你发现自己记得一百种在雾中走丢的方法——《雾中行》。',
      '虚质塑形': ' 裂隙深处的虚质在你掌心凝成一瞬又散去。《虚质塑形》的诀窍随之而来，你无法向别人转述，却确实会了。',
    };
    let techniqueText = '';
    let workingChar = character;
    for (const [artName, threshold] of (STRANGE_ARTS[realm.name] || [])) {
      if (newCorruption < threshold) continue;
      const { list, learned } = techniques.learnTechnique(workingChar, artName, { makeMain: false, bypassReq: true });
      if (learned) {
        workingChar = { ...workingChar, learned_techniques: JSON.stringify(list) };
        sets.learned_techniques = JSON.stringify(list);
        extraRewards.push({ text: `习得《${artName}》`, tone: 'gain' });
        techniqueText += STRANGE_ART_TEXT[artName] || ` 你莫名习得《${artName}》。`;
      }
    }

    return {
      deltas: {},
      sets,
      items: extraItems,
      extraRewards,
      elapsedDays: rand(2, 4),
      resultText: `你走向${realm.name}。${realmBonus}（异化度 +${totalCorruption}）${extraCorruption > 0 ? ' 你的神念太弱，无法抵挡其中的一部分侵蚀。' : ''}${techniqueText}`,
      renderParams: { outcome: 'contact', realm: realm.name, corruptionGain: totalCorruption },
      options: ['深入探索', '记录所见', '离开此地'],
    };
  },
};
