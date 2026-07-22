// 剧本：切磋比试 — 战力差 → 优/均/劣 → 胜负与伤势声望
const { power, randf } = require('./utils');

module.exports = {
  id: 'challenge_duel',

  match(actionText) {
    if (!/切磋|比试|挑战|决斗|讨教|较量/.test(actionText)) return null;
    return {};
  },

  resolve(character) {
    const myPower = Math.max(10, power(character));
    const oppPower = myPower * randf(0.7, 1.4);
    const diff = (myPower - oppPower) / myPower;

    let deltas, outcome, resultText;
    if (diff > 0.12) {
      deltas = { fame: 10, health: -8 };
      outcome = 'win';
      resultText = '切磋得胜。对手技逊一筹，拱手捧让。你挂了些轻彩，但名头又响了几分。（名望 +10，生命 -8）';
    } else if (diff < -0.12) {
      deltas = { health: -30, fame: -3 };
      outcome = 'lose';
      resultText = '切磋落败。对方修为明显在你之上，你被震退数步，气血翻涌，伤势不轻。（生命 -30，名望 -3）';
    } else {
      deltas = { health: -15, fame: 3 };
      outcome = 'draw';
      resultText = '切磋战平。双方你来我往斗了个旗鼓相当，各自收手时都已带伤，却也有了几分惺惺相惜。（生命 -15，名望 +3）';
    }

    return {
      deltas,
      elapsedDays: 0.2,
      resultText,
      renderParams: { outcome },
      options: outcome === 'lose' ? ['回去疗伤', '回去闭关修炼', '日后再来讨教'] : ['再讨教一局', '回去总结感悟', '继续在此历练'],
    };
  },
};
