// 剧本：切磋比试 — 精气神修正版（精影响减伤/逆转，气影响战力，神影响偷学）
const { power, randf, parseJson, effStat, consumeBuffs } = require('./utils');
const techniques = require('../techniques');

module.exports = {
  id: 'challenge_duel',

  match(actionText) {
    if (!/切磋|比试|挑战|决斗|讨教|较量/.test(actionText)) return null;
    return {};
  },

  resolve(character) {
    const essence = effStat(character, 'essence', 40);
    const spiritVal = effStat(character, 'spirit', 30);
    const qiVal = effStat(character, 'qi', 40);
    const qiDefense = qiVal / 200;
    // 战斗类丹药 buff（如金刚丹）：本场判定生效，切磋后消耗
    const battleBuffs = parseJson(character.active_buffs, []).filter(b => b.unit === 'battle');
    // 诡道力量增益：strange_use_power 写入的一次性切磋加成，生效后清除
    const buff = parseJson(character.power_buff, null);
    const buffPct = buff && buff.pct ? buff.pct : 0;
    // 战力计算用叠加 buff 后的属性（金刚丹等 battle 类生效）
    const buffedChar = { ...character, essence, qi: qiVal, spirit: spiritVal };
    const basePower = Math.max(10, power(buffedChar));
    let myPower = basePower;
    if (buffPct > 0) myPower = Math.round(myPower * (1 + buffPct));
    // 术法入战力：已学术法攻击总和 ×2；身法闪避与术法防御在受伤结算时减免
    const arts = techniques.combatArts(character);
    if (arts.attack > 0) myPower = Math.round(myPower + arts.attack * 2);
    // 对手按你的境界层级生成（不含术法/增益）——术法与临时增益构成真实优势
    const oppPower = basePower * randf(0.7, 1.4);
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

    // 诡道力量增益一次性生效，用后清除；战斗类丹药 buff 本次切磋后消耗
    const sets = {};
    if (buffPct > 0) sets.power_buff = null;
    if (battleBuffs.length > 0) sets.active_buffs = JSON.stringify(consumeBuffs(character, 'battle'));
    if (buffPct > 0) resultText += `（诡道力量加成 +${Math.round(buffPct * 100)}% 已生效）`;
    if (battleBuffs.length > 0) resultText += '（丹药之力激荡，此战过后药力消退）';

    // 术法防御与身法闪避：减免本次切磋受伤
    if (deltas.health < 0 && (arts.defense > 0 || arts.dodge > 0)) {
      const reduction = Math.min(0.5, arts.defense / 200) + arts.dodge;
      const mitigated = -Math.max(1, Math.round(-deltas.health * (1 - Math.min(0.8, reduction))));
      if (mitigated !== deltas.health) {
        resultText += '（术法护体、身法游走，伤势减轻）';
        deltas.health = mitigated;
      }
    }

    // 战斗砺术法：所有已学术法 +5 深度经验，主修术法 ×1.5
    const mainTech = techniques.getMainTechnique(character);
    const extraRewards = [];
    let curChar = character;
    {
      const spellMain = techniques.getMainOfType(character, 'spell');
      const sp = techniques.gainDepthExp(character, 5, {
        type: 'spell', boostName: spellMain && spellMain.name, boostMult: 1.5, otherMult: 1,
      });
      if (sp.gains.length > 0) {
        sets.learned_techniques = JSON.stringify(sp.list);
        curChar = { ...character, learned_techniques: JSON.stringify(sp.list) };
        for (const g of sp.gains) {
          if (g.levelUps.length > 0) {
            const label = techniques.DEPTH_LABELS[g.levelUps[g.levelUps.length - 1]];
            resultText += ` 实战中磨砺，你的《${g.name}》踏入了${label}之境！`;
            extraRewards.push({ text: `《${g.name}》领悟·${label}`, tone: 'gain' });
          }
        }
      }
    }

    // 战中顿悟：基础 15%（散修 25%），对手越强（diff<0）+10%——主修功法深度经验 +20
    if (mainTech) {
      const paths = parseJson(character.cultivation_paths, {});
      let insightChance = paths.wanderer ? 0.25 : 0.15;
      if (diff < 0) insightChance += 0.10;
      if (Math.random() < insightChance) {
        const r = techniques.addDepthExp(curChar, mainTech.name, 20);
        if (r.gained > 0) {
          sets.learned_techniques = JSON.stringify(r.list);
          if (r.levelUps.length > 0) sets.qi_max = techniques.recalcQiMax(character, r.list); // 顿悟升深后气海上限即时刷新
          extraRewards.push({ text: `战中顿悟：领悟 +${r.gained}`, tone: 'gain' });
          resultText += ` 交手间电光石火的一瞬，你对《${mainTech.name}》忽然有了一丝新的明悟。`;
          if (r.levelUps.length > 0) {
            const label = techniques.DEPTH_LABELS[r.levelUps[r.levelUps.length - 1]];
            resultText += ` 这一招的印证让你的领悟踏入了${label}之境！`;
            extraRewards.push({ text: `《${mainTech.name}》领悟·${label}`, tone: 'gain' });
          }
        }
      }
    }

    return {
      deltas,
      sets: Object.keys(sets).length > 0 ? sets : undefined,
      extraRewards: extraRewards.length > 0 ? extraRewards : undefined,
      elapsedDays: 0.2,
      resultText,
      renderParams: { outcome, buffPct },
      options,
    };
  },
};
