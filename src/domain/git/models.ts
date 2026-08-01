export type GitChangeKind =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "untracked"
  | "conflicted";

export type GitDiffMode = "working" | "staged";

/** 同一路径可以同时拥有暂存区与工作区两套独立状态。 */
export interface GitFileChange {
  path: string;
  relativePath: string;
  indexStatus: GitChangeKind | null;
  worktreeStatus: GitChangeKind | null;
}

export interface GitRepository {
  root: string;
  name: string;
  branch: string;
  workspaceRoots: string[];
  changes: GitFileChange[];
}

export interface GitWorkspaceStatus {
  repositories: GitRepository[];
  warnings: string[];
}

export interface GitDiffResult {
  content: string;
  truncated: boolean;
}

export interface GitDiffTarget {
  repositoryRoot: string;
  path: string;
  relativePath: string;
  mode: GitDiffMode;
}
