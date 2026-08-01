import type { GitGateway } from "../../domain/git/GitGateway";

const unavailable = () => Promise.reject(new Error("Git 操作仅在桌面应用中可用"));

/** 浏览器预览适配器不伪造仓库或变更数据。 */
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
