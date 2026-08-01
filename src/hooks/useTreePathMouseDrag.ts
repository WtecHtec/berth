import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import {
  beginInternalPathDrag,
  cancelInternalPathDrag,
  dropInternalPathDrag,
  moveInternalPathDrag,
} from "../shared/lib/internalPathDrag";

const DRAG_THRESHOLD_SQUARED = 25;
const DRAGGING_CLASS = "is-tree-path-dragging";

function setGlobalDragCursor(active: boolean) {
  document.documentElement.classList.toggle(DRAGGING_CLASS, active);
}

/**
 * 不依赖 HTML5 DnD 或 Pointer Capture 实现应用内路径拖拽；
 * 通过 window 监听器持续接收整个 WebView 范围内的鼠标坐标。
 */
export function useTreePathMouseDrag(path: string) {
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const draggingRef = useRef(false);
  const suppressClickRef = useRef(false);
  const cleanupListenersRef = useRef<() => void>(() => {});
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => () => {
    cleanupListenersRef.current();
    if (draggingRef.current) cancelInternalPathDrag();
    setGlobalDragCursor(false);
  }, []);

  return {
    isDragging,
    onMouseDown(event: ReactMouseEvent<HTMLButtonElement>) {
      if (event.button !== 0) return;
      event.preventDefault();
      originRef.current = { x: event.clientX, y: event.clientY };

      const cleanup = () => {
        window.removeEventListener("mousemove", handleMouseMove, true);
        window.removeEventListener("mouseup", handleMouseUp, true);
        window.removeEventListener("blur", handleCancel);
        cleanupListenersRef.current = () => {};
      };
      const finish = () => {
        cleanup();
        originRef.current = null;
        draggingRef.current = false;
        setIsDragging(false);
        setGlobalDragCursor(false);
        // mouseup 合成的 click 会在下一个任务前触发并被抑制；随后立即复位，
        // 避免误吞用户下一次真实点击。
        if (suppressClickRef.current) {
          window.setTimeout(() => {
            suppressClickRef.current = false;
          }, 0);
        }
      };
      const handleMouseMove = (moveEvent: MouseEvent) => {
        const origin = originRef.current;
        if (!origin) return;
        if (!draggingRef.current) {
          const deltaX = moveEvent.clientX - origin.x;
          const deltaY = moveEvent.clientY - origin.y;
          if ((deltaX * deltaX) + (deltaY * deltaY) < DRAG_THRESHOLD_SQUARED) return;
          draggingRef.current = true;
          suppressClickRef.current = true;
          beginInternalPathDrag([path]);
          setIsDragging(true);
          setGlobalDragCursor(true);
        }
        moveEvent.preventDefault();
        moveInternalPathDrag({ x: moveEvent.clientX, y: moveEvent.clientY });
      };
      const handleMouseUp = (upEvent: MouseEvent) => {
        if (draggingRef.current) {
          upEvent.preventDefault();
          dropInternalPathDrag({ x: upEvent.clientX, y: upEvent.clientY });
        }
        finish();
      };
      const handleCancel = () => {
        if (draggingRef.current) cancelInternalPathDrag();
        finish();
      };

      cleanupListenersRef.current();
      cleanupListenersRef.current = cleanup;
      window.addEventListener("mousemove", handleMouseMove, true);
      window.addEventListener("mouseup", handleMouseUp, true);
      window.addEventListener("blur", handleCancel);
    },
    suppressClick(event: ReactMouseEvent<HTMLButtonElement>) {
      if (!suppressClickRef.current) return false;
      suppressClickRef.current = false;
      event.preventDefault();
      event.stopPropagation();
      return true;
    },
  };
}
