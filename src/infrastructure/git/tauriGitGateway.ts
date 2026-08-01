import type { GitGateway } from "../../domain/git/GitGateway";

async function invokeTauri<T>(command: string, arguments_: Record<string, unknown>) {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, arguments_);
}

export const tauriGitGateway: GitGateway = {
  workspaceStatus(roots) {
    return invokeTauri("git_workspace_status", { roots });
  },
  ignoredPaths(roots, paths) {
    return invokeTauri("git_ignored_paths", { roots, paths });
  },
  fileDiff(repositoryRoot, path, staged) {
    return invokeTauri("git_file_diff", { repositoryRoot, path, staged });
  },
  stage(repositoryRoot, path) {
    return invokeTauri("git_stage", { repositoryRoot, path });
  },
  unstage(repositoryRoot, path) {
    return invokeTauri("git_unstage", { repositoryRoot, path });
  },
  stageAll(repositoryRoot) {
    return invokeTauri("git_stage_all", { repositoryRoot });
  },
  unstageAll(repositoryRoot) {
    return invokeTauri("git_unstage_all", { repositoryRoot });
  },
};
