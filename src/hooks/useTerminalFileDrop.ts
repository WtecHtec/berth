import { useNativePathDropTarget } from "./useNativePathDropTarget";

/**
 * 让当前选中终端独占原生窗口文件拖放；平台事件细节留在 DesktopGateway 后方，
 * 终端业务只接收最终路径列表。
 */
export function useTerminalFileDrop(
  selected: boolean,
  onDropPaths: (paths: string[]) => void,
) {
  return useNativePathDropTarget(selected, onDropPaths);
}
