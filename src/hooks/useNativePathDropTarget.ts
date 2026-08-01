import { useEffect, useState } from "react";
import { registerNativePathDropTarget } from "../infrastructure/desktop/nativePathDropCoordinator";

/**
 * 只为当前选中终端注册窗口级 Tauri 拖拽事件，
 * 并把原生订阅生命周期隔离在展示组件之外。
 */
export function useNativePathDropTarget(
  enabled: boolean,
  onDropPaths: (paths: string[]) => void,
) {
  const [isPathOver, setIsPathOver] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setIsPathOver(false);
      return;
    }
    return registerNativePathDropTarget({
      onHoverChange: setIsPathOver,
      onDropPaths,
    });
  }, [enabled, onDropPaths]);

  return isPathOver;
}
