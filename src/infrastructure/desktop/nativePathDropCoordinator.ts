import { desktopGateway } from "../../app/services";
import type { FileDropEvent } from "../../domain/desktop/DesktopGateway";

interface NativePathDropTarget {
  onHoverChange(hovered: boolean): void;
  onDropPaths(paths: string[]): void;
  containsPosition?(position: { x: number; y: number }): boolean;
}

const targets: Array<{ id: symbol; target: NativePathDropTarget }> = [];
let hoveredTargetId: symbol | null = null;
let stopListening: (() => void) | null = null;
let startListening: Promise<void> | null = null;

function routeNativeDropEvent(event: FileDropEvent) {
  if (event.type === "leave") {
    targets.find((item) => item.id === hoveredTargetId)?.target.onHoverChange(false);
    hoveredTargetId = null;
    return;
  }
  // 有命中区域的目标优先；其余区域继续交给当前终端这个默认目标。
  const located = [...targets].reverse().find((item) => item.target.containsPosition?.(event.position))
    ?? [...targets].reverse().find((item) => !item.target.containsPosition);
  if (!located) return;
  if (hoveredTargetId !== located.id) {
    targets.find((item) => item.id === hoveredTargetId)?.target.onHoverChange(false);
    located.target.onHoverChange(true);
    hoveredTargetId = located.id;
  }
  if (event.type === "drop") {
    located.target.onHoverChange(false);
    hoveredTargetId = null;
    if (event.paths.length > 0) located.target.onDropPaths(event.paths);
    return;
  }
}

function ensureListening() {
  if (stopListening || startListening) return;
  startListening = desktopGateway.subscribeToFileDrops(routeNativeDropEvent)
    .then((unlisten) => {
      startListening = null;
      if (targets.length === 0) unlisten();
      else stopListening = unlisten;
    })
    .catch(() => {
      startListening = null;
      targets.forEach((item) => item.target.onHoverChange(false));
    });
}

/** 原生窗口拖放按命中区域路由；没有区域约束时回退给当前选中的终端。 */
export function registerNativePathDropTarget(target: NativePathDropTarget) {
  const id = Symbol("native-path-drop-target");
  targets.push({ id, target });
  ensureListening();

  return () => {
    const index = targets.findIndex((item) => item.id === id);
    if (index < 0) return;
    targets[index].target.onHoverChange(false);
    targets.splice(index, 1);
    if (hoveredTargetId === id) hoveredTargetId = null;
    if (targets.length === 0 && stopListening) {
      stopListening();
      stopListening = null;
    }
  };
}
