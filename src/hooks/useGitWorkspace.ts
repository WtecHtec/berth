import { useCallback, useEffect, useMemo, useRef } from "react";
import { gitGateway } from "../app/services";
import type { GitDiffMode, GitFileChange, GitRepository } from "../domain/git/models";
import type { TreeNode } from "../domain/workbench/models";
import { useGitStore } from "../store/useGitStore";
import { useWorkbenchStore } from "../store/useWorkbenchStore";

let refreshSequence = 0;
let ignoreSequence = 0;

function errorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
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
export async function refreshGitWorkspace(roots: string[], initial = false) {
  if (roots.length === 0) {
    useGitStore.getState().clear();
    return;
  }
  const request = ++refreshSequence;
  useGitStore.getState().beginRefresh(initial);
  try {
    const result = await gitGateway.workspaceStatus(roots);
    if (request !== refreshSequence) return;
    useGitStore.getState().finishRefresh(result);
  } catch (reason) {
    if (request !== refreshSequence) return;
    useGitStore.getState().failRefresh(errorMessage(reason));
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
  const revision = useGitStore((state) => state.revision);
  const rootKey = roots.join("\0");
  const loadedPaths = useMemo(() => {
    const paths: string[] = [];
    collectLoadedPaths(tree, paths);
    return paths;
  }, [tree]);
  const loadedPathKey = loadedPaths.join("\0");
  const rootsRef = useRef(roots);

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
