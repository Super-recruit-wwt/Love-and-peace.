// 剧本：旅行 — 精气神修正 + 轻身符骨特殊装备
const { regionOf, rand, isValidLocation, parseJson, optionsForLocation } = require('./utils');
const techniques = require('../techniques');

const REGIONS = ['中州', '北荒', '南疆', '东海', '西漠'];
const TRAILING_WORDS = /(休整|休息|歇脚|一趟|看看|走走|逛逛|一圈|玩玩|一下)$/;

function extractDestination(actionText) {
  const m = actionText.match(/(?:前往|赶赴|赶去|动身去|去|返回|回)([一-龥]{2,8}?)(?:$|，|。|、|\s|看看|一趟)/);
  if (!m) return null;
  let dest = m[1];
  let prev;
  do { prev = dest; dest = dest.replace(TRAILING_WORDS, ''); }
  while (dest !== prev && dest.length > 0);
  return dest || null;
}

module.exports = {
  id: 'travel',

  match(actionText) {
    if (!/前往|赶去|出发|跋涉|动身|赶路|远行|^去|回城|返回/.test(actionText)) return null;
    const destination = extractDestination(actionText);
    if (destination && !isValidLocation(destination)) return null;
    return { destination };
  },

  resolve(character, { destination }) {
    const from = regionOf(character);
    if (destination && !isValidLocation(destination)) {
      console.warn(`[travel] 拒绝非法目的地 "${destination}"`);
      destination = null;
    }
    const destRegion = destination ? (REGIONS.find(r => destination.includes(r)) || null) : null;
    const crossRegion = destRegion && destRegion !== from;
    const essence = character.essence || 40;
    const spiritVal = character.spirit || 30;
  const qiVal = character.qi || 40;

    let days;
    if (crossRegion) days = rand(20, 60);
    else if (destination && /城|宗|宫|山|阁|门/.test(destination)) days = rand(5, 15);
    else days = rand(2, 5);

    // 精高缩短旅程
    days = Math.max(1, Math.round(days * (1 - essence / 400) * (1 - qiVal / 400)));

    // 身法提速：已学身法中 speed 最高者按倍率缩短旅程
    const movement = techniques.movementSpeed(character);
    if (movement.speed > 1) days = Math.max(1, Math.round(days / movement.speed));

    // 轻身符骨特殊装备：时间减半
    const specialEquip = parseJson(character.special_equipment, []);
    const hasLightBody = specialEquip.some(e => e === 'light_body');
    if (hasLightBody) days = Math.max(1, Math.ceil(days / 2));

    const encounter = Math.random() < 0.2;
    const deltas = {};
    let encounterText = '';
    if (encounter) {
      if (Math.random() < 0.5 && (character.spirit_stones || 0) > 0) {
        let lost = Math.min(character.spirit_stones, Math.max(1, Math.round(character.spirit_stones * 0.1)));
        // 精≥100 反杀劫匪
        if (essence >= 100) {
          const seized = rand(10, 30);
          deltas.spirit_stones = seized;
          encounterText = `途中遭遇剪径蟊贼。你三拳两脚把毛贼撂倒，反而搜出 ${seized} 灵石。`;
        } else {
          if (hasLightBody) lost = Math.min(character.spirit_stones, lost * 2); // 轻身符骨代价：劫匪损失翻倍
          deltas.spirit_stones = -lost;
          encounterText = `途中遭遇剪径蟊贼，损失 ${lost} 灵石。`;
        }
      } else {
        if (hasLightBody) {
          encounterText = '你脚步太快，地上的宝箱根本没看见。';
        } else {
          const found = rand(5, 20);
          deltas.spirit_stones = found;
          encounterText = `途中拾得一处前人遗落的行囊，得 ${found} 灵石。`;
        }
      }
    }

    // 神≥80 旅途中获得情报
    let clueText = '';
    if (spiritVal >= 80 && Math.random() < 0.3) {
      clueText = '途中遇到一个商队，闲聊中得知了附近某处秘境的传闻。';
    }

    const dest = destination || `${from}-邻地`;
    const sets = { current_location: crossRegion ? `${destRegion}-${destination}` : dest };

    // 赶路砺身法：所有已学身法按旅程天数积累深度经验，主修身法 ×1.5
    const moveMain = techniques.getMainOfType(character, 'movement');
    const mv = techniques.gainDepthExp(character, Math.max(2, Math.round(days)), {
      type: 'movement', boostName: moveMain && moveMain.name, boostMult: 1.5, otherMult: 1,
    });
    let moveUpText = '';
    const extraRewards = [];
    if (mv.gains.length > 0) {
      sets.learned_techniques = JSON.stringify(mv.list);
      const ups = mv.gains.filter(g => g.levelUps.length > 0);
      for (const g of ups) {
        const label = techniques.DEPTH_LABELS[g.levelUps[g.levelUps.length - 1]];
        extraRewards.push({ text: `《${g.name}》领悟·${label}`, tone: 'gain' });
      }
      if (ups.length > 0) moveUpText = ` 长途跋涉间，你的${ups.map(g => `《${g.name}》`).join('、')}愈发纯熟。`;
    }

    const movementText = movement.speed > 1 ? `你施展《${movement.name}》赶路，身法如风。` : '';
    return {
      deltas,
      sets,
      extraRewards: extraRewards.length > 0 ? extraRewards : undefined,
      elapsedDays: days,
      resultText: `${movementText}跋涉${days}天，你抵达了${dest}。${encounterText}${clueText}${moveUpText}`,
      renderParams: { destination: dest, days, encounterText, clueText, movement: movement.name },
      options: optionsForLocation({ current_location: dest }), // 到达后选项贴合新地点
    };
  },
};
