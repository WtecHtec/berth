export interface DragPoint {
  x: number;
  y: number;
}

export type InternalPathDragEvent =
  | { type: "move"; paths: string[]; position: DragPoint }
  | { type: "drop"; paths: string[]; position: DragPoint }
  | { type: "cancel" };

type Listener = (event: InternalPathDragEvent) => void;

const listeners = new Set<Listener>();
let activePaths: string[] = [];

function emit(event: InternalPathDragEvent) {
  listeners.forEach((listener) => listener(event));
}

export function beginInternalPathDrag(paths: string[]) {
  activePaths = [...paths];
}

export function moveInternalPathDrag(position: DragPoint) {
  if (activePaths.length === 0) return;
  emit({ type: "move", paths: activePaths, position });
}

export function dropInternalPathDrag(position: DragPoint) {
  if (activePaths.length === 0) return;
  emit({ type: "drop", paths: activePaths, position });
  activePaths = [];
}

export function cancelInternalPathDrag() {
  if (activePaths.length === 0) return;
  activePaths = [];
  emit({ type: "cancel" });
}

export function subscribeToInternalPathDrag(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isPointInsideRect(point: DragPoint, rect: Pick<DOMRect, "left" | "right" | "top" | "bottom">) {
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
}
