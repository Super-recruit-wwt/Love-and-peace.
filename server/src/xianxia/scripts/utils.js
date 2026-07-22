// 剧本共享工具

const CN_NUM = { '半': 0.5, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };

function parseJson(val, fallback) {
  if (val == null) return fallback;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return fallback; }
}

/** 平均灵根资质（无灵根按 30 计） */
function avgRoot(character) {
  const roots = parseJson(character.spirit_roots, {});
  const vals = Object.values(roots).map(Number).filter(n => !isNaN(n));
  return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 30;
}

/** 仙道境界层级 0-9（0=未入道） */
function cultivationTier(character) {
  const c = parseJson(character.cultivation_paths, {});
  const stages = ['炼气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体', '大乘', '渡劫'];
  const x = c.xiandao || '';
  for (let i = stages.length - 1; i >= 0; i--) {
    if (x.includes(stages[i])) return i + 1;
  }
  return 0;
}

/** 综合战力（用于切磋判定） */
function power(character) {
  return cultivationTier(character) * 100
    + (character.qi_current || 0) * 0.5
    + (character.health || 100) * 0.3
    + (character.dao_heart || 50) * 0.2;
}

/** 所在大区（中州/北荒/南疆/东海/西漠） */
function regionOf(character) {
  return (character.current_location || '中州').split('-')[0];
}

function rand(min, max) { // 整数 [min, max]
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randf(min, max) {
  return Math.random() * (max - min) + min;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** 从行动文本推断耗时（天），如"闭关15天""修炼三个月"；缺省 def，clamp 0.1~365 */
function parseDurationDays(text, def) {
  const m = text.match(/([0-9]+(?:\.[0-9]+)?|半|一|二|两|三|四|五|六|七|八|九|十)\s*(?:个)?(时辰|天|日|月|年)/);
  if (!m) return def;
  let v = parseFloat(m[1]);
  if (isNaN(v)) v = CN_NUM[m[1]] || 1;
  const unit = m[2];
  let days;
  if (unit === '时辰') days = v / 12;
  else if (unit === '月') days = v * 30;
  else if (unit === '年') days = v * 365;
  else days = v;
  return Math.min(365, Math.max(0.1, days));
}

/** 合法地名后缀 */
const LOCATION_SUFFIX = /(城|镇|村|山|宗|门|阁|宫|谷|港|寺|寨|客栈|坊市|府|岛|林|湖|原)$/;

/** 地名中不得出现的动作/游玩词（防"城休整""坊市逛逛"这类脏数据） */
const LOCATION_BAD_WORDS = /休整|休息|歇脚|走走|看看|一趟|逛逛|玩玩|打听|探索/;

/**
 * 校验是否为可写入 current_location 的合法地名：
 * 1) 大区格式 "中州-xxx"；或
 * 2) 长度 2-20、以地名后缀结尾、且不含动作/游玩词
 */
function isValidLocation(loc) {
  if (!loc || typeof loc !== 'string') return false;
  if (/^(中州|北荒|南疆|东海|西漠)-.{1,18}$/.test(loc)) return true;
  if (loc.length < 2 || loc.length > 20) return false;
  if (LOCATION_BAD_WORDS.test(loc)) return false;
  return LOCATION_SUFFIX.test(loc);
}

module.exports = { parseJson, avgRoot, cultivationTier, power, regionOf, rand, randf, pick, parseDurationDays, CN_NUM, isValidLocation };
