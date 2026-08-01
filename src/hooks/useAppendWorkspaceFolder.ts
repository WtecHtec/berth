import { useState } from "react";
import { desktopGateway } from "../app/services";
import { rememberWorkspace } from "../infrastructure/persistence/workspaceHistory";
import { useWorkbenchStore } from "../store/useWorkbenchStore";

/** 将用户选择的文件夹追加为当前窗口的新根目录。 */
export function useAppendWorkspaceFolder() {
  const appendWorkspaceRoot = useWorkbenchStore((state) => state.appendWorkspaceRoot);
  const setRecentWorkspaces = useWorkbenchStore((state) => state.setRecentWorkspaces);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chooseAndAppend = async () => {
    setError(null);
    try {
      const path = await desktopGateway.pickFolder();
      if (!path || useWorkbenchStore.getState().workspaceRoots.includes(path)) return;
      setLoading(true);
      const children = await desktopGateway.listDirectory(path);
      appendWorkspaceRoot(path, children);
      setRecentWorkspaces(rememberWorkspace(useWorkbenchStore.getState().workspaceRoots));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  };

  return { loading, error, chooseAndAppend, clearError: () => setError(null) };
}
