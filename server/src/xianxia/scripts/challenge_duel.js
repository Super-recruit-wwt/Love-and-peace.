// 剧本：切磋比试 — 精气神修正版（精影响减伤/逆转，气影响战力，神影响偷学）
const { power, randf, parseJson } = require('./utils');

module.exports = {
  id: 'challenge_duel',

  match(actionText) {
    if (!/切磋|比试|挑战|决斗|讨教|较量/.test(actionText)) return null;
    return {};
  },

  resolve(character) {
    const essence = character.essence || 40;
    const spiritVal = character.spirit || 30;
    const qiVal = character.qi || 40;
    const qiDefense = qiVal / 200;
    // 诡道力量增益：strange_use_power 写入的一次性切磋加成，生效后清除
    const buff = parseJson(character.power_buff, null);
    const buffPct = buff && buff.pct ? buff.pct : 0;
    let myPower = Math.max(10, power(character));
    if (buffPct > 0) myPower = Math.round(myPower * (1 + buffPct));
    const oppPower = myPower * randf(0.7, 1.4);
    const diff = (myPower - oppPower) / myPower;

    let deltas, outcome, resultText, extraOption = null;

    if (diff > 0.12) {
      outcome = 'win';
      const hpLoss = Math.round(8 * (1 - essence / 250) * (1 - qiDefense)); // 精越高受伤越轻，气流转也减伤
      deltas = { fame: 10, health: -Math.max(2, hpLoss) };
      resultText = `切磋得胜。对手技逊一筹，拱手捧让。名头又响了几分。（名望 +10，生命 -${Math.max(2, hpLoss)}）`;
    } else if (diff < -0.12) {
      outcome = 'lose';
      // 精≥80 可能逆转——名望不扣反+3
      if (essence >= 80) {
        const hpLoss = Math.round(30 * (1 - essence / 250) * (1 - qiDefense));
        deltas = { health: -Math.max(5, hpLoss), fame: 3 };
        resultText = `切磋交手。你技不如人，被震退数步——却凭着惊人的体魄硬是站着没倒。对方忍不住多看了你一眼。（名望 +3，生命 -${Math.max(5, hpLoss)}）`;
      } else {
        deltas = { health: -30, fame: -3 };
        resultText = '切磋落败。对方修为明显在你之上，你被震退数步，气血翻涌，伤势不轻。（生命 -30，名望 -3）';
      }
    } else {
      outcome = 'draw';
      const hpLoss = Math.round(15 * (1 - essence / 250) * (1 - qiDefense));
      deltas = { health: -Math.max(3, hpLoss), fame: 3 };
      // 神≥100 平局有30%概率偷学
      if (spiritVal >= 100 && Math.random() < 0.3) {
        extraOption = '你从对手身上悟到了一点东西';
        resultText = `切磋战平。旗鼓相当之际，你在对方的一招里看出了一点不同——说不清是什么，但你记住了。这比输赢更有价值。（生命 -${Math.max(3, hpLoss)}，名望 +3，领悟微增）`;
      } else {
        resultText = `切磋战平。双方你来我往斗了个旗鼓相当，各自收手时都已带伤，却也有了几分惺惺相惜。（生命 -${Math.max(3, hpLoss)}，名望 +3）`;
      }
    }

    const options = outcome === 'lose'
      ? ['回去疗伤', '回去闭关修炼', '日后再来讨教']
      : ['再讨教一局', '回去总结感悟', '继续在此历练'];
    if (extraOption) options.push(extraOption);

    // 诡道力量增益一次性生效，用后清除
    const sets = buffPct > 0 ? { power_buff: null } : undefined;
    if (buffPct > 0) resultText += `（诡道力量加成 +${Math.round(buffPct * 100)}% 已生效）`;

    return {
      deltas,
      sets,
      elapsedDays: 0.2,
      resultText,
      renderParams: { outcome, buffPct },
      options,
    };
  },
};
