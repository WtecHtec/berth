import { desktopGateway } from "../../app/services";
import type { FileDropEvent } from "../../domain/desktop/DesktopGateway";

interface NativePathDropTarget {
  onHoverChange(hovered: boolean): void;
  onDropPaths(paths: string[]): void;
}

let selectedTarget: { id: symbol; target: NativePathDropTarget } | null = null;
let stopListening: (() => void) | null = null;
let startListening: Promise<void> | null = null;

function routeNativeDropEvent(event: FileDropEvent) {
  const target = selectedTarget?.target;
  if (!target) return;
  if (event.type === "leave") {
    target.onHoverChange(false);
    return;
  }
  if (event.type === "drop") {
    target.onHoverChange(false);
    if (event.paths.length > 0) target.onDropPaths(event.paths);
    return;
  }
  target.onHoverChange(true);
}

function ensureListening() {
  if (stopListening || startListening) return;
  startListening = desktopGateway.subscribeToFileDrops(routeNativeDropEvent)
    .then((unlisten) => {
      startListening = null;
      if (!selectedTarget) unlisten();
      else stopListening = unlisten;
    })
    .catch(() => {
      startListening = null;
      selectedTarget?.target.onHoverChange(false);
    });
}

/** 原生窗口文件拖放只投递给当前选中终端，避免多面板重复接收。 */
export function registerNativePathDropTarget(target: NativePathDropTarget) {
  const id = Symbol("native-path-drop-target");
  selectedTarget?.target.onHoverChange(false);
  selectedTarget = { id, target };
  ensureListening();

  return () => {
    if (selectedTarget?.id !== id) return;
    selectedTarget.target.onHoverChange(false);
    selectedTarget = null;
    if (stopListening) {
      stopListening();
      stopListening = null;
    }
  };
}
