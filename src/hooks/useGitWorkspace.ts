import { useCallback, useEffect, useMemo, useRef } from "react";
import { gitGateway } from "../app/services";
import type { GitDiffMode, GitFileChange, GitRepository } from "../domain/git/models";
import type { TreeNode } from "../domain/workbench/models";
import { useGitStore } from "../store/useGitStore";
import { useWorkbenchStore } from "../store/useWorkbenchStore";
import { subscribeToTerminalCommandSubmitted } from "../infrastructure/events/terminalCommandEvents";
import { sameGitWorkspaceStatus } from "../domain/git/status";

let refreshSequence = 0;
let ignoreSequence = 0;
let automaticRefreshInFlight = false;
const GIT_POLL_MIN_INTERVAL_MS = 2_500;
const GIT_POLL_MAX_INTERVAL_MS = 15_000;
const TERMINAL_REFRESH_DELAY_MS = 650;

function errorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}

function canRunAutomaticRefresh() {
  return document.visibilityState === "visible" && document.hasFocus();
}

function collectLoadedPaths(nodes: TreeNode[], output: string[]) {
  for (const node of nodes) {
    if (node.kind === "root" || node.kind === "folder" || node.kind === "file") {
      output.push(node.path);
    }
    if (node.children) collectLoadedPaths(node.children, output);
  }
}

/** Coalesces repository refreshes so an older Git process cannot overwrite newer state. */
export async function refreshGitWorkspace(roots: string[], initial = false, silent = false) {
  if (roots.length === 0) {
    useGitStore.getState().clear();
    return false;
  }
  if (silent && automaticRefreshInFlight) return false;
  if (silent) automaticRefreshInFlight = true;
  const request = ++refreshSequence;
  useGitStore.getState().beginRefresh(initial, !silent);
  try {
    const result = await gitGateway.workspaceStatus(roots);
    if (request !== refreshSequence) return false;
    const current = useGitStore.getState();
    const changed = !sameGitWorkspaceStatus(
      { repositories: current.repositories, warnings: current.warnings },
      result,
    );
    useGitStore.getState().finishRefresh(result);
    return changed;
  } catch (reason) {
    if (request !== refreshSequence) return false;
    useGitStore.getState().failRefresh(errorMessage(reason), !silent);
    return false;
  } finally {
    if (silent) automaticRefreshInFlight = false;
  }
}

async function refreshIgnoredPaths(roots: string[], paths: string[]) {
  const request = ++ignoreSequence;
  if (paths.length === 0) {
    useGitStore.getState().replaceIgnoredPaths([]);
    return;
  }
  try {
    const ignored = await gitGateway.ignoredPaths(roots, paths);
    if (request === ignoreSequence) useGitStore.getState().replaceIgnoredPaths(ignored);
  } catch {
    // Ignore decoration is supplementary; repository status remains usable if this check fails.
  }
}

/** Keeps Git status synchronized with workspace roots, lazy tree expansion, and app focus. */
export function useGitWorkspace() {
  const roots = useWorkbenchStore((state) => state.workspaceRoots);
  const tree = useWorkbenchStore((state) => state.tree);
  const sidebarView = useWorkbenchStore((state) => state.sidebarView);
  const filesCollapsed = useWorkbenchStore((state) => state.filesCollapsed);
  const revision = useGitStore((state) => state.revision);
  const rootKey = roots.join("\0");
  const loadedPaths = useMemo(() => {
    const paths: string[] = [];
    collectLoadedPaths(tree, paths);
    return paths;
  }, [tree]);
  const loadedPathKey = loadedPaths.join("\0");
  const rootsRef = useRef(roots);
  const gitPanelVisible = sidebarView === "git" && !filesCollapsed;

  useEffect(() => { rootsRef.current = roots; }, [roots]);

  useEffect(() => {
    void refreshGitWorkspace(roots, true);
  }, [rootKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void refreshIgnoredPaths(roots, loadedPaths);
  }, [rootKey, loadedPathKey, revision]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const refreshOnFocus = () => void refreshGitWorkspace(rootsRef.current);
    window.addEventListener("focus", refreshOnFocus);
    return () => window.removeEventListener("focus", refreshOnFocus);
  }, []);

  useEffect(() => {
    if (!gitPanelVisible || roots.length === 0) return;
    let cancelled = false;
    let timer = 0;
    let interval = GIT_POLL_MIN_INTERVAL_MS;

    const poll = async () => {
      const { loading, refreshing } = useGitStore.getState();
      let changed = false;
      if (canRunAutomaticRefresh() && !loading && !refreshing) {
        changed = await refreshGitWorkspace(rootsRef.current, false, true);
      }
      interval = changed
        ? GIT_POLL_MIN_INTERVAL_MS
        : Math.min(GIT_POLL_MAX_INTERVAL_MS, interval * 2);
      if (!cancelled) timer = window.setTimeout(poll, interval);
    };

    timer = window.setTimeout(poll, interval);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [gitPanelVisible, rootKey]);

  useEffect(() => {
    if (!gitPanelVisible) return;
    let timer = 0;
    const unsubscribe = subscribeToTerminalCommandSubmitted(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const { loading, refreshing } = useGitStore.getState();
        if (canRunAutomaticRefresh() && !loading && !refreshing) {
          void refreshGitWorkspace(rootsRef.current, false, true);
        }
      }, TERMINAL_REFRESH_DELAY_MS);
    });
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, [gitPanelVisible]);
}

async function runMutation(
  operation: "stage" | "unstage",
  roots: string[],
  repositoryRoot: string,
  path: string,
) {
  const store = useGitStore.getState();
  store.beginOperation(path, operation);
  try {
    if (operation === "stage") await gitGateway.stage(repositoryRoot, path);
    else await gitGateway.unstage(repositoryRoot, path);
    await refreshGitWorkspace(roots);
  } catch (reason) {
    useGitStore.getState().setError(errorMessage(reason));
  } finally {
    useGitStore.getState().finishOperation(path);
  }
}

async function runRepositoryMutation(
  operation: "stage" | "unstage",
  roots: string[],
  repositoryRoot: string,
) {
  const store = useGitStore.getState();
  store.beginOperation(repositoryRoot, operation);
  try {
    if (operation === "stage") await gitGateway.stageAll(repositoryRoot);
    else await gitGateway.unstageAll(repositoryRoot);
    await refreshGitWorkspace(roots);
  } catch (reason) {
    useGitStore.getState().setError(errorMessage(reason));
  } finally {
    useGitStore.getState().finishOperation(repositoryRoot);
  }
}

export function useGitActions() {
  const roots = useWorkbenchStore((state) => state.workspaceRoots);
  const openGitDiff = useWorkbenchStore((state) => state.openGitDiff);

  const openDiff = useCallback((repository: GitRepository, change: GitFileChange, mode: GitDiffMode) => {
    openGitDiff({
      repositoryRoot: repository.root,
      path: change.path,
      relativePath: change.relativePath,
      mode,
    });
  }, [openGitDiff]);

  return {
    refresh: useCallback(() => refreshGitWorkspace(roots), [roots]),
    openDiff,
    stage: useCallback(
      (repositoryRoot: string, path: string) => runMutation("stage", roots, repositoryRoot, path),
      [roots],
    ),
    unstage: useCallback(
      (repositoryRoot: string, path: string) => runMutation("unstage", roots, repositoryRoot, path),
      [roots],
    ),
    stageAll: useCallback(
      (repositoryRoot: string) => runRepositoryMutation("stage", roots, repositoryRoot),
      [roots],
    ),
    unstageAll: useCallback(
      (repositoryRoot: string) => runRepositoryMutation("unstage", roots, repositoryRoot),
      [roots],
    ),
  };
}
