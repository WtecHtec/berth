import type { GitGateway } from "../../domain/git/GitGateway";

const unavailable = () => Promise.reject(new Error("Git 操作仅在桌面应用中可用"));

/** Browser previews intentionally expose no fabricated repositories or changes. */
export const browserGitGateway: GitGateway = {
  async workspaceStatus() {
    return { repositories: [], warnings: [] };
  },
  async ignoredPaths() {
    return [];
  },
  fileDiff: unavailable,
  stage: unavailable,
  unstage: unavailable,
  stageAll: unavailable,
  unstageAll: unavailable,
};
