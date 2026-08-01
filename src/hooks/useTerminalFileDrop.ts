import { useNativePathDropTarget } from "./useNativePathDropTarget";

/**
 * Gives the selected terminal sole ownership of native window file-drop events.
 * Platform event details stay behind DesktopGateway; the terminal only receives paths.
 */
export function useTerminalFileDrop(
  selected: boolean,
  onDropPaths: (paths: string[]) => void,
) {
  return useNativePathDropTarget(selected, onDropPaths);
}
