export type GitChangeKind =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "untracked"
  | "conflicted";

export type GitDiffMode = "working" | "staged";

/** One path can have independent index and working-tree changes. */
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
