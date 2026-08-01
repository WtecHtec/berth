import { useEffect, useState } from "react";
import { registerNativePathDropTarget } from "../infrastructure/desktop/nativePathDropCoordinator";

/**
 * Registers only the selected terminal for window-level Tauri drag events.
 * Native subscriptions stay outside presentation components.
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
