import { useCallback, useEffect } from "react";
import { desktopGateway } from "../app/services";
import { loadWorkspaceHistory, rememberWorkspace } from "../infrastructure/persistence/workspaceHistory";
import { useWorkbenchStore } from "../store/useWorkbenchStore";

export function useWorkspaceLauncher() {
  const loading = useWorkbenchStore((state) => state.workspaceLoading);
  const error = useWorkbenchStore((state) => state.workspaceError);
  const recentWorkspaces = useWorkbenchStore((state) => state.recentWorkspaces);
  const setRecentWorkspaces = useWorkbenchStore((state) => state.setRecentWorkspaces);
  const setWorkspaceLoading = useWorkbenchStore((state) => state.setWorkspaceLoading);
  const setWorkspaceError = useWorkbenchStore((state) => state.setWorkspaceError);
  const loadWorkspace = useWorkbenchStore((state) => state.loadWorkspace);
  const appendWorkspaceRoot = useWorkbenchStore((state) => state.appendWorkspaceRoot);
  const restoreWorkspaceLayout = useWorkbenchStore((state) => state.restoreWorkspaceLayout);

  useEffect(() => {
    setRecentWorkspaces(loadWorkspaceHistory());
  }, [setRecentWorkspaces]);

  const openPaths = useCallback(async (paths: string[]) => {
    if (paths.length === 0) return;
    setWorkspaceLoading(true);
    setWorkspaceError(null);
    try {
      const [firstPath, ...remainingPaths] = paths;
      const firstChildren = await desktopGateway.listDirectory(firstPath);
      loadWorkspace(firstPath, firstChildren);
      for (const path of remainingPaths) {
        const children = await desktopGateway.listDirectory(path);
        appendWorkspaceRoot(path, children);
      }
      restoreWorkspaceLayout(paths);
      setRecentWorkspaces(rememberWorkspace(paths));
    } catch (cause) {
      setWorkspaceLoading(false);
      setWorkspaceError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [appendWorkspaceRoot, loadWorkspace, restoreWorkspaceLayout, setRecentWorkspaces, setWorkspaceError, setWorkspaceLoading]);

  const openPath = useCallback((path: string) => openPaths([path]), [openPaths]);

  const openFolder = useCallback(async () => {
    setWorkspaceError(null);
    try {
      const path = await desktopGateway.pickFolder();
      if (path) await openPath(path);
    } catch (cause) {
      setWorkspaceError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [openPath, setWorkspaceError]);

  return { loading, error, recentWorkspaces, openFolder, openPath, openPaths };
}
