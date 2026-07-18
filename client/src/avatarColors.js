/*
 * 青白头像色 —— 低饱和传统色
 * 旧版高饱和色（数据库存量）映射到青白色板；新值原样通过。
 */
const LEGACY_MAP = {
  '#f472b6': '#B58490', // 豆沙 · 小暖
  '#fbbf24': '#C9A86B', // 缃杏 · 阿星
  '#6366f1': '#7C8A99', // 黛蓝 · 屿白
  '#f87171': '#C07A6B', // 朱磦 · 小野
  '#818cf8': '#8AA39B', // 青瓷 · 暮暮
  '#fb923c': '#A98B72', // 沉香 · 酥酥
};

export const QB_AVATAR_PALETTE = ['#B58490', '#C9A86B', '#7C8A99', '#C07A6B', '#8AA39B', '#A98B72'];

export function qbAvatarColor(color) {
  if (!color) return '#B8A89A'; // 藕荷兜底
  return LEGACY_MAP[color.toLowerCase()] || color;
}
