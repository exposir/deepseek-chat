import { createPortal } from 'react-dom';
import { useEffect } from 'react';
import type { ReactNode } from 'react';

const MENU_MARGIN = 8;

export interface MenuPos {
  left: number;
  bottom: number;
}

/**
 * 计算弹出菜单位置：右对齐 anchor 按钮、向上弹出，并 clamp 在视口内。
 * （按钮靠右时直接用按钮左边定位会溢出屏幕，移动端已验证 320px/390px）
 */
export function menuPosition(rect: DOMRect, menuW: number, vw: number, vh: number): MenuPos {
  const left = Math.min(Math.max(rect.right - menuW, MENU_MARGIN), vw - menuW - MENU_MARGIN);
  return { left: Math.round(left), bottom: Math.round(vh - rect.top + 6) };
}

interface PopoverProps {
  pos: MenuPos | null;
  /** 菜单宽度（px）：与 menuPosition 的 menuW 同一真相，避免 CSS 类与数字漂移 */
  width: number;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Portal 弹出层：遮罩 + fixed 菜单。
 * 必须 portal 到 body：Composer 的 backdrop-blur 会截断 fixed 定位，
 * 且菜单留在 Composer（z-20 context）内会被 body 层 z-40 遮罩盖住导致点击失效。
 */
export function Popover({ pos, width, onClose, children }: PopoverProps) {
  // Escape 关闭（与 Dialog 行为一致）
  useEffect(() => {
    if (!pos) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pos, onClose]);

  if (!pos) return null;
  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        role="menu"
        className="fixed z-50 rounded-xl border border-border bg-panel-2 p-1.5 shadow-xl"
        style={{ left: pos.left, bottom: pos.bottom, width }}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}
