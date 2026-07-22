// 剧本：旅行 — 按距离档位耗时，小概率路途遭遇
const { regionOf, rand, isValidLocation } = require('./utils');

const REGIONS = ['中州', '北荒', '南疆', '东海', '西漠'];

// 目的地尾部常见的动作/游玩词，捕获后需剥掉（如"坊市逛逛"→"坊市"、"城休整"→"城"）
const TRAILING_WORDS = /(休整|休息|歇脚|一趟|看看|走走|逛逛|一圈|玩玩|一下)$/;

/** 从行动文本提取目的地并消毒；无法提取或消毒后为空返回 null */
function extractDestination(actionText) {
  const m = actionText.match(/(?:前往|赶赴|赶去|动身去|去|返回|回)([\u4e00-\u9fa5]{2,8}?)(?:$|，|。|、|\s|看看|一趟)/);
  if (!m) return null;
  let dest = m[1];
  let prev;
  do {
    prev = dest;
    dest = dest.replace(TRAILING_WORDS, '');
  } while (dest !== prev && dest.length > 0);
  return dest || null;
}

module.exports = {
  id: 'travel',

  match(actionText) {
    if (!/前往|赶去|出发|跋涉|动身|赶路|远行|^去|回城|返回/.test(actionText)) return null;
    const destination = extractDestination(actionText);
    // 抓到了目的地但不是合法地名（如"回城休整"→"城"）：不接管，交自由叙事通道
    if (destination && !isValidLocation(destination)) return null;
    return { destination };
  },

  resolve(character, { destination }) {
    const from = regionOf(character);
    // 兜底再校验一次：非法目的地不写入 current_location
    if (destination && !isValidLocation(destination)) {
      console.warn(`[travel] 拒绝非法目的地 "${destination}"，按邻近区域处理`);
      destination = null;
    }
    const destRegion = destination ? (REGIONS.find(r => destination.includes(r)) || null) : null;
    const crossRegion = destRegion && destRegion !== from;

    // 距离档位
    let days;
    if (crossRegion) days = rand(20, 60);
    else if (destination && /城|宗|宫|山|阁|门/.test(destination)) days = rand(5, 15);
    else days = rand(2, 5);

    // 路途遭遇 20%
    const encounter = Math.random() < 0.2;
    const deltas = {};
    let encounterText = '';
    if (encounter) {
      if (Math.random() < 0.5 && (character.spirit_stones || 0) > 0) {
        const lost = Math.min(character.spirit_stones, Math.max(1, Math.round(character.spirit_stones * 0.1)));
        deltas.spirit_stones = -lost;
        encounterText = `途中遭遇剪径蟊贼，损失 ${lost} 灵石。`;
      } else {
        const found = rand(5, 20);
        deltas.spirit_stones = found;
        encounterText = `途中拾得一处前人遗落的行囊，得 ${found} 灵石。`;
      }
    }

    const dest = destination || `${from}-邻地`;
    const sets = { current_location: crossRegion ? `${destRegion}-${destination}` : dest };

    return {
      deltas,
      sets,
      elapsedDays: days,
      resultText: `跋涉${days}天，你抵达了${dest}。${encounterText}`,
      renderParams: { destination: dest, days, encounterText },
      options: ['探索此地', '寻找客栈落脚', '向当地人打听消息'],
    };
  },
};
