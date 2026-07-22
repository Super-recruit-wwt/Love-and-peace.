// 修仙模拟 — 时间格式化（与服务端 llm.js formatGameAge 保持一致）

/** 浮点年龄 → 「21岁3个月」 */
export function formatAge(age) {
  if (age == null) return '';
  const a = Number(age) || 0;
  const y = Math.floor(a);
  const m = Math.round((a - y) * 12);
  if (m <= 0) return `${y}岁`;
  if (m >= 12) return `${y + 1}岁`;
  return `${y}岁${m}个月`;
}

/** 浮点年数（寿元） → 「58年2个月」 */
export function formatYears(years) {
  if (years == null) return '';
  const a = Number(years) || 0;
  const y = Math.floor(a);
  const m = Math.round((a - y) * 12);
  if (m <= 0) return `${y}年`;
  if (m >= 12) return `${y + 1}年`;
  return `${y}年${m}个月`;
}
