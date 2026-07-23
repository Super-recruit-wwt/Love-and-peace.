// 剧本：诡道内视冥想 — 诡道路线的日常修炼
const { parseJson } = require('./utils');

module.exports = {
  id: 'strange_ponder',

  match(actionText, character) {
    if (!/冥想|内视|感知.*体内|接触.*它|感应|内观|审视.*自己|倾听.*声音/.test(actionText)) return null;
    const corr = character.strange_corruption || 0;
    if (corr === 0) return null; // 无诡道→走自由叙事
    return {};
  },

  resolve(character, params, actionText) {
    const corruption = character.strange_corruption || 0;
    const spiritVal = character.spirit || 30;
  const qiVal = character.qi || 40;
    const essence = character.essence || 40;

    if (corruption === 0) {
      return {
        deltas: {},
        elapsedDays: 1,
        resultText: '你闭上眼睛尝试感知什么。什么都没有。你体内没有任何异样的东西。也许只是你的错觉。',
        renderParams: { outcome: 'nothing' },
        options: ['继续修炼', '探索四周', '前往坊市'],
      };
    }

    // 压制 vs 共鸣
    const isSuppress = /对抗|压制|抵抗|压制/.test(actionText);
    const isResonate = /融合|接受|倾听|交流|共生/.test(actionText);

    if (isSuppress) {
      // 压制：减缓异化，但代价是神
      const suppressSuccess = spiritVal >= 30;
      if (suppressSuccess) {
        return {
          deltas: { spirit: -5 },
          elapsedDays: 3,
          resultText: '你闭上眼睛，用神念包裹住体内的那个东西。它在挣扎，但你硬生生把它按了回去。这一次对抗消耗了你的心神。（神 -5）',
          renderParams: { outcome: 'suppress_success' },
          options: ['继续内视', '修炼巩固', '外出走走'],
        };
      }
      return {
        deltas: {},
        elapsedDays: 1,
        resultText: '你试图压制它。它不理会你。你的神念太弱了——像一个孩子在推一座山。',
        renderParams: { outcome: 'suppress_fail' },
        options: ['尝试与它共鸣', '继续修炼', '外出走走'],
      };
    }

    if (isResonate) {
      const resonance = Math.min(5, 2 + Math.floor(corruption / 20));
      return {
        deltas: { health: -5 },
        elapsedDays: 2,
        resultText: `你不再抗拒。你静静地听着它——听它在你骨头里的低语。你听不太懂，但你的身体在回应。它与你更近了一步。（异化度 +${resonance}，生命 -5）`,
        renderParams: { outcome: 'resonate', corruptionGain: resonance },
        sets: { strange_corruption: Math.min(100, corruption + resonance) },
        options: ['继续共鸣', '开始压制', '正常修炼'],
      };
    }

    // 默认：提供两个选项
    return {
      deltas: {},
      elapsedDays: 1,
      resultText: `你闭上眼睛，感受体内的那个东西。它${corruption < 20 ? '很安静。' : corruption < 60 ? '在动——不是心跳，是一种缓慢的、有力的蠕动。' : '在看着你——你闭着眼睛，但你感觉得到它在注视你。不是从里面，是从一个你正在成为的方向。'}`,
      renderParams: { outcome: 'ponder', corruption },
      options: ['试图压制它', '尝试与它共鸣', '暂时不去管它'],
    };
  },
};
