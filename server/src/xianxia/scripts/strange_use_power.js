// 剧本：使用诡道力量 — 主动释放异化获得巨大战斗力
const { rand } = require('./utils');

module.exports = {
  id: 'strange_use_power',

  match(actionText, character) {
    if (!/使用.*诡道|释放.*力量|召唤.*它|借用.*力量|运用.*异化|打开.*通道|显现.*本质/.test(actionText)) return null;
    const corr = character.strange_corruption || 0;
    if (corr === 0) return null;
    return {};
  },

  resolve(character) {
    const corruption = character.strange_corruption || 0;
    const spiritVal = character.spirit || 30;
  const qiVal = character.qi || 40;
    const essence = character.essence || 40;

    let powerBonusPct, costHealth, costSpirit, corruptionGain, narrative;

    if (corruption <= 20) {
      powerBonusPct = 0.15;
      corruptionGain = 3;
      costHealth = -3;
      narrative = '你让那个东西出来一小会儿。它不太情愿——你们还不太熟。但它留下的力量在你经脉里游走，蓄势待发。';
    } else if (corruption <= 60) {
      powerBonusPct = 0.3;
      corruptionGain = 5;
      costHealth = -8;
      costSpirit = -2;
      narrative = '你不再需要召唤它了。它已经在等着你。你感觉到它在你的指尖上——冰凉，但对你没有敌意。至少现在没有。';
    } else {
      powerBonusPct = 0.5;
      corruptionGain = 8;
      costHealth = -12;
      costSpirit = -5;
      narrative = '你不再是一个人在战斗。你也不是两个人。你是什么你自己也说不清了。但你知道这股力量——它替你粉碎了挡在你面前的东西。它为你打碎敌人之前，先打碎了你体内的一部分。';
    }

    const deltas = { health: costHealth };
    if (costSpirit) deltas.spirit = costSpirit;

    return {
      deltas,
      sets: {
        strange_corruption: Math.min(100, corruption + corruptionGain),
        // 落地为一次性切磋加成标记，challenge_duel 判定后清除
        power_buff: JSON.stringify({ pct: powerBonusPct }),
      },
      elapsedDays: 0.3,
      resultText: `${narrative}（异化度 +${corruptionGain}，下一次切磋战力 +${Math.round(powerBonusPct * 100)}%）`,
      renderParams: { outcome: 'used', corruptionGain, powerBonusPct },
      options: corruption >= 96
        ? ['做最后一件事', '接受它的引导', '最后一次挣扎']
        : ['继续使用力量', '尝试收敛力量', '接受它的引导'],
    };
  },
};
