import { useEffect, useRef, useState, type RefObject } from "react";
import { isPointInsideRect, subscribeToInternalPathDrag } from "../shared/lib/internalPathDrag";

/** 只在拖拽进入/离开目标时更新 React，不跟随每次指针移动重渲染。 */
export function useInternalPathDropTarget(
  targetRef: RefObject<HTMLElement | null>,
  onDropPaths: (paths: string[]) => void,
) {
  const [isPathOver, setIsPathOver] = useState(false);
  const isPathOverRef = useRef(false);

  const updateHover = (nextValue: boolean) => {
    if (isPathOverRef.current === nextValue) return;
    isPathOverRef.current = nextValue;
    setIsPathOver(nextValue);
  };

  useEffect(() => subscribeToInternalPathDrag((event) => {
    if (event.type === "cancel") {
      updateHover(false);
      return;
    }
    const bounds = targetRef.current?.getBoundingClientRect();
    const isInside = Boolean(bounds && isPointInsideRect(event.position, bounds));
    if (event.type === "move") {
      updateHover(isInside);
      return;
    }
    updateHover(false);
    if (isInside) onDropPaths(event.paths);
  }), [onDropPaths, targetRef]);

  return isPathOver;
}
