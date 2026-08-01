import type { GitDiffResult, GitWorkspaceStatus } from "./models";

/** Git-specific application boundary, kept separate from general desktop I/O. */
export interface GitGateway {
  workspaceStatus(roots: string[]): Promise<GitWorkspaceStatus>;
  ignoredPaths(roots: string[], paths: string[]): Promise<string[]>;
  fileDiff(repositoryRoot: string, path: string, staged: boolean): Promise<GitDiffResult>;
  stage(repositoryRoot: string, path: string): Promise<void>;
  unstage(repositoryRoot: string, path: string): Promise<void>;
  stageAll(repositoryRoot: string): Promise<void>;
  unstageAll(repositoryRoot: string): Promise<void>;
}
