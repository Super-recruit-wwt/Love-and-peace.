// 剧本：突破尝试 — 小境界即时判定 / 大境界走突破锁（精气神修正 + 诡道支持）
const { cultivationTier, parseJson, nextXianStage, bigRealmOf, qiMaxForStage, effStat, consumeBuffs } = require('./utils');
const techniques = require('../techniques');

// 各阶突破基准分钟：修为越高所需时间越长（上限15分钟）
const TIER_MINUTES = [3, 4, 5, 6, 7, 8, 10, 12, 14, 15];

module.exports = {
  id: 'breakthrough_attempt',

  match(actionText) {
    if (!/突破|冲击瓶颈|冲击.*境|渡劫|闭关冲击|冲关/.test(actionText)) return null;
    return {};
  },

  resolve(character) {
    const tier = cultivationTier(character);
    const paths = parseJson(character.cultivation_paths, {});
    const essence = effStat(character, 'essence', 40);
    const spiritVal = effStat(character, 'spirit', 30);
    const qiVal = effStat(character, 'qi', 40);
    const qiCurrent = character.qi_current || 0;
    const qiMax = character.qi_max || 100;
    const corruption = character.strange_corruption || 0;
    const hasPath = Object.values(paths).some(Boolean);

    // 诡道路线走诡道突破（一律走突破锁）
    const isStrange = paths.strange && corruption > 0;

    // 精过低禁止突破
    if (!isStrange && essence < 30 && tier >= 1) {
      return {
        deltas: {},
        elapsedDays: 1,
        resultText: '你尝试感应瓶颈，却感到身体隐隐发虚——你的体魄太弱了，根本无法承受突破时的冲击。先想办法增强体魄吧。',
        renderParams: { outcome: 'not_ready_essence' },
        options: ['闭关修炼积累修为', '寻找增强体魄的方法', '外出历练'],
      };
    }

    // 修为必须修满（100%）方可冲击瓶颈
    if (!isStrange && qiMax > 0 && qiCurrent < qiMax && tier >= 1) {
      return {
        deltas: {},
        elapsedDays: 1,
        resultText: `你盘膝入定，却发现气海尚未充盈——修为距圆满还差 ${Math.round(qiMax - qiCurrent)} 点。此时冲击瓶颈只会白白耗损修为，还是先积累到圆满再说。`,
        renderParams: { outcome: 'not_ready_qi', gap: Math.round(qiMax - qiCurrent) },
        options: ['闭关修炼', '外出历练', '打听突破的机缘'],
      };
    }

    // 门槛
    if (!hasPath && qiCurrent < 30 && corruption === 0) {
      return {
        deltas: {},
        elapsedDays: 1,
        resultText: '你尝试感应瓶颈，却发现体内灵力浅薄得可怜——连门槛都摸不到，谈何突破。还是先好生修炼积累吧。',
        renderParams: { outcome: 'not_ready' },
        options: ['闭关修炼积累修为', '外出历练', '打听突破的机缘'],
      };
    }

    // 小境界突破（同一大境界内，如炼气中期→后期）：即时判定，不设突破锁
    const fromStage = paths.xiandao || null;
    const toStage = fromStage ? nextXianStage(fromStage) : null;
    const isSmallStage = !isStrange && fromStage && toStage
      && bigRealmOf(toStage) === bigRealmOf(fromStage) && toStage !== fromStage;

    if (isSmallStage) {
      // 突破类 buff（如三花聚顶丹）参与本次判定后消耗
      const afterConsume = parseJson(character.active_buffs, []).some(b => b.unit === 'breakthrough')
        ? JSON.stringify(consumeBuffs(character, 'breakthrough'))
        : null;
      const buffSet = afterConsume ? { active_buffs: afterConsume } : {};

      // 成功率：道心为基，精气神修正（比大境界宽松）
      let rate = Math.min(1, (character.dao_heart || 50) / 100);
      if (essence < 50) rate *= 0.9;
      if (spiritVal < 30) rate *= 0.6;
      if (qiVal < 30) rate *= 0.85;
      if ((character.health || 100) < 50) rate *= 0.8;
      rate = Math.min(0.95, rate + 0.1); // 小境界壁障较薄，基础加成
      // 气血翻涌未愈：连续硬闯成功率打七折
      const surging = /气血翻涌/.test(character.body_status || '');
      if (surging) rate *= 0.7;

      if (Math.random() < rate) {
        const newPaths = { ...paths, xiandao: toStage };
        // 小境界突破的境界基底：精/气/神各 +当前大境界层级（炼气+1、筑基+2……越往后越多）
        const tierGain = cultivationTier({ cultivation_paths: JSON.stringify(newPaths) });
        return {
          deltas: { health: -5, essence: tierGain, qi: tierGain, spirit: tierGain, comprehension: 1 }, // 破境顿悟：小境界 悟性 +1
          sets: {
            cultivation_paths: JSON.stringify(newPaths),
            qi_current: 0, // 破境后气海重塑，修为清零重新积累
            qi_max: Math.round(qiMaxForStage(toStage) * techniques.qiMaxMult(character)), // 修为上限随境界成长 × 主修功法倍率
            body_status: surging ? '恢复康健' : (character.body_status || '康健'),
            ...buffSet,
          },
          elapsedDays: 1,
          resultText: `你引导灵力向那道薄障发起冲击——壁障应声而碎。气息流转间，你已从${fromStage}踏入${toStage}，气海随之扩张，只觉周身空空荡荡，需重新积累修为。境界精进，道基愈发坚实，破境一瞬的顿悟让你心思澄明。（生命 -5，精气神各 +${tierGain}，悟性 +1）`,
          renderParams: { outcome: 'small_success', fromStage, toStage, newQiMax: qiMaxForStage(toStage) },
          options: ['继续修炼', '外出历练一番', '前往坊市'],
        };
      }
      return {
        deltas: { health: -10 },
        sets: {
          qi_current: 0, // 冲击失败修为散尽，需重新积累
          body_status: '气血翻涌：数日之内突破成功率降低，需静养平复',
          ...buffSet,
        },
        elapsedDays: 1,
        resultText: `你冲击${toStage}的壁障，灵力却在关头一散——辛苦积累的修为溃散一空，体内气血翻涌不止，受了些轻伤。境界仍是${fromStage}。（生命 -10，修为清零）`,
        renderParams: { outcome: 'small_fail', fromStage, toStage },
        options: ['静养休整', '继续修炼稳固', '外出走走'],
      };
    }

    // 大境界突破（如筑基→金丹）与诡道突破：走突破锁管线
    const timerType = isStrange ? 'strange_breakthrough' : 'breakthrough';

    // 精气神越高→突破越快；修为越高→所需时间越长
    const tierMinutes = TIER_MINUTES[Math.min(tier, TIER_MINUTES.length - 1)];
    const essenceMod = Math.max(0.3, 1 - essence / 300);
    const qiMod = Math.max(0.3, 1 - (character.qi || 40) / 300);
    const spiritMod = Math.max(0.3, 1 - (character.spirit || 30) / 300);
    const avgMod = (essenceMod + qiMod + spiritMod) / 3;
    let minutes = Math.round(tierMinutes * avgMod * 10) / 10;
    // 限幅：15秒~15分钟
    minutes = Math.min(15, Math.max(0.25, minutes));

    const narrativeText = isStrange
      ? '你闭上眼，不再抗拒体内的异化。它已经等这一刻很久了——你能感觉到它在你的骨头里动了。突破一旦开始，便只能看谁的意志更强。'
      : `你盘膝入定，开始冲击${toStage ? ` ${toStage} ` : ''}的壁障。体内灵力如潮水般涌向那道无形的界线——大境界的突破一旦开始，便只能静待结果。`;

    return {
      deltas: {},
      sets: isStrange ? {} : { qi_current: 0 }, // 冲击大境界：尝试即耗尽全身修为，成败皆从头积累（诡道不清）
      elapsedDays: 1,
      timer: { type: timerType, minutes, narrative: '突破进行中……天地间的气运在汇聚。' },
      resultText: narrativeText,
      renderParams: { outcome: 'started', minutes, isStrange, fromStage, toStage },
      options: [],
    };
  },
};
