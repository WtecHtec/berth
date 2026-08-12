import { useEffect, useState } from "react";
import { registerNativePathDropTarget } from "../infrastructure/desktop/nativePathDropCoordinator";

/**
 * 注册窗口级 Tauri 路径拖拽目标；可选命中区域用于在终端与 SFTP 之间精确路由。
 */
export function useNativePathDropTarget(
  enabled: boolean,
  onDropPaths: (paths: string[]) => void,
  containsPosition?: (position: { x: number; y: number }) => boolean,
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
      containsPosition,
    });
  }, [containsPosition, enabled, onDropPaths]);

  return isPathOver;
}
