import { useEffect, useState } from 'react';

/**
 * 软键盘遮挡高度（像素）。
 *
 * 背景：iOS Safari（含 26）不支持 viewport meta 的 interactive-widget=resizes-content，
 * 键盘弹出时 layout viewport 不收缩，absolute bottom-0 的输入区会被键盘盖住。
 * 通过 visualViewport 计算键盘遮挡量，供外层把 app-shell 高度压缩同样像素：
 * - iOS：offset = 键盘高度，布局随之下移，输入区自动浮到键盘上方
 * - Android Chrome 108+（interactive-widget 生效）：视口已收缩，offset 恒为 0，无副作用
 * - Android 旧版 overlay 键盘：与 iOS 同理，offset 生效
 *
 * 注意 WebKit 在键盘事件期间可能报告陈旧值（bugs.webkit.org 237851），
 * 因此一律在 requestAnimationFrame 回调里读取。
 */
export function useKeyboardOffset(): number {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    let raf = 0;
    const place = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const next = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
        setOffset((prev) => (Math.abs(prev - next) > 1 ? next : prev));
      });
    };

    vv.addEventListener('resize', place);
    vv.addEventListener('scroll', place);
    window.addEventListener('orientationchange', place);
    place();

    return () => {
      cancelAnimationFrame(raf);
      vv.removeEventListener('resize', place);
      vv.removeEventListener('scroll', place);
      window.removeEventListener('orientationchange', place);
    };
  }, []);

  return offset;
}
