import { useCallback, useEffect, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

interface TabDragDescriptor {
  tabId: string;
  title: string;
  sourcePaneId: string;
}

interface UseTabDragOptions {
  onDrop(tabId: string, sourcePaneId: string, targetPaneId: string): void;
}

const DRAG_THRESHOLD_SQUARED = 64;

/** 为标签提供直接拖放交互；高频坐标只写 DOM，避免拖动期间触发 React 重渲染。 */
export function useTabDrag({ onDrop }: UseTabDragOptions) {
  const cleanupRef = useRef<(() => void) | null>(null);
  const suppressClickRef = useRef(false);

  useEffect(() => () => cleanupRef.current?.(), []);

  const startTabDrag = useCallback((
    descriptor: TabDragDescriptor,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest(".tab-close")) return;
    const handle = event.currentTarget;
    const bounds = handle.getBoundingClientRect();
    const origin = { x: event.clientX, y: event.clientY };
    const grabOffset = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    let dragging = false;
    let ghost: HTMLDivElement | null = null;
    let targetElement: HTMLElement | null = null;
    let targetPaneId: string | null = null;
    let frame = 0;
    let latestPoint = origin;
    handle.setPointerCapture(event.pointerId);

    const clearTarget = () => {
      targetElement?.classList.remove("is-tab-drop-target");
      targetElement = null;
      targetPaneId = null;
    };
    const renderPosition = () => {
      frame = 0;
      if (!ghost) return;
      ghost.style.transform = `translate3d(${latestPoint.x - grabOffset.x}px, ${latestPoint.y - grabOffset.y}px, 0)`;
    };
    const startDragging = () => {
      dragging = true;
      suppressClickRef.current = true;
      handle.classList.add("is-dragging");
      handle.setAttribute("aria-grabbed", "true");
      document.documentElement.classList.add("is-tab-dragging");
      ghost = document.createElement("div");
      ghost.className = "tab-drag-ghost";
      ghost.textContent = descriptor.title;
      ghost.style.width = `${Math.min(190, Math.max(100, bounds.width))}px`;
      document.body.appendChild(ghost);
    };
    const updateTarget = (point: { x: number; y: number }) => {
      const paneElement = document
        .elementFromPoint(point.x, point.y)
        ?.closest<HTMLElement>("[data-workbench-pane-id]") ?? null;
      const paneId = paneElement?.dataset.workbenchPaneId ?? null;
      const nextElement = paneId && paneId !== descriptor.sourcePaneId ? paneElement : null;
      if (nextElement === targetElement) return;
      clearTarget();
      if (!nextElement || !paneId) return;
      targetElement = nextElement;
      targetPaneId = paneId;
      targetElement.classList.add("is-tab-drop-target");
    };
    const handleMove = (moveEvent: PointerEvent) => {
      if (!dragging) {
        const deltaX = moveEvent.clientX - origin.x;
        const deltaY = moveEvent.clientY - origin.y;
        if ((deltaX * deltaX) + (deltaY * deltaY) < DRAG_THRESHOLD_SQUARED) return;
        startDragging();
      }
      moveEvent.preventDefault();
      latestPoint = { x: moveEvent.clientX, y: moveEvent.clientY };
      if (!frame) frame = requestAnimationFrame(renderPosition);
      updateTarget(latestPoint);
    };
    const cleanup = () => {
      handle.removeEventListener("pointermove", handleMove);
      handle.removeEventListener("pointerup", finish);
      handle.removeEventListener("pointercancel", cancel);
      if (frame) cancelAnimationFrame(frame);
      clearTarget();
      ghost?.remove();
      handle.classList.remove("is-dragging");
      handle.removeAttribute("aria-grabbed");
      document.documentElement.classList.remove("is-tab-dragging");
      cleanupRef.current = null;
    };
    const finish = () => {
      const destination = targetPaneId;
      cleanup();
      if (dragging && destination) onDrop(descriptor.tabId, descriptor.sourcePaneId, destination);
      window.setTimeout(() => { suppressClickRef.current = false; }, 0);
    };
    const cancel = () => {
      cleanup();
      window.setTimeout(() => { suppressClickRef.current = false; }, 0);
    };

    cleanupRef.current?.();
    cleanupRef.current = cleanup;
    handle.addEventListener("pointermove", handleMove);
    handle.addEventListener("pointerup", finish, { once: true });
    handle.addEventListener("pointercancel", cancel, { once: true });
  }, [onDrop]);

  const shouldSuppressClick = useCallback(() => suppressClickRef.current, []);
  return { startTabDrag, shouldSuppressClick };
}
