import { useEffect } from "react";
import { subscribeToPinnedTerminals } from "../infrastructure/persistence/pinnedTerminalRepository";
import { useWorkbenchStore } from "../store/useWorkbenchStore";

/** 多窗口共享置顶终端配置，但每个窗口仍维护自己的 PTY 生命周期。 */
export function usePinnedTerminalSync() {
  useEffect(() => subscribeToPinnedTerminals((records) => {
    useWorkbenchStore.getState().replacePinnedTerminals(records);
  }), []);
}
