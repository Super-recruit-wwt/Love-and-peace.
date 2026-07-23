import { useState, useLayoutEffect, useEffect, useRef } from 'react';

/**
 * 可复用悬浮层：以 trigger 元素的 getBoundingClientRect() 为锚，
 * 用 position: fixed 渲染到视口坐标系，不受面板 overflow:auto/hidden 裁剪。
 *
 * 展开方向策略：
 * - prefer='left'（右侧面板）：优先向 trigger 左侧展开；左侧空间不足时翻转到下方/上方
 * - prefer='right'：优先向右侧展开；不足时同样翻转
 * - 垂直方向贴齐 trigger 顶边，整体超出视口底部时向上收；下方展开时底部不足则向上翻
 * - 面板滚动 / 窗口 resize 时调用 onClose 直接隐藏（简单可靠，不跟随滚动）
 *
 * 视觉样式由调用方 className 提供，本组件只管定位。
 */
export default function HoverTip({ rect, width = 240, prefer = 'left', className = '', onClose, children }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);

  // 滚动 / resize：直接隐藏（capture 监听，面板内部滚动也能捕获）
  useEffect(() => {
    if (!onClose) return undefined;
    const hide = () => onClose();
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [onClose]);

  // 首帧先隐藏渲染量出真实高度，再计算落点（避免闪烁）
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !rect) return;
    const w = width;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const next = {};
    if (prefer === 'left' && rect.left - 8 - w >= 8) {
      // 向左侧展开，顶边贴齐 trigger，越底则上移
      next.left = rect.left - 8 - w;
      next.top = Math.max(8, Math.min(rect.top, vh - h - 8));
    } else if (prefer === 'right' && rect.right + 8 + w <= vw - 8) {
      next.left = rect.right + 8;
      next.top = Math.max(8, Math.min(rect.top, vh - h - 8));
    } else {
      // 下方展开，水平居中于 trigger 并夹在视口内；底部空间不足则向上翻
      const left = rect.left + rect.width / 2 - w / 2;
      next.left = Math.max(8, Math.min(left, vw - w - 8));
      if (rect.bottom + 8 + h <= vh - 8) next.top = rect.bottom + 8;
      else next.top = Math.max(8, rect.top - 8 - h);
    }
    setPos(next);
  }, [rect, width, prefer]);

  if (!rect) return null;
  const style = pos
    ? { position: 'fixed', left: pos.left, top: pos.top, width, zIndex: 1200 }
    : { position: 'fixed', left: -9999, top: 0, width, zIndex: 1200, visibility: 'hidden' };
  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  );
}
