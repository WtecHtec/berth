import type { GitChangeKind, GitFileChange, GitRepository, GitWorkspaceStatus } from "./models";

const STATUS_PRIORITY: Record<GitChangeKind, number> = {
  conflicted: 6,
  deleted: 5,
  added: 4,
  untracked: 3,
  renamed: 2,
  modified: 1,
};

export function gitStatusLetter(status: GitChangeKind) {
  switch (status) {
    case "modified": return "M";
    case "added": return "A";
    case "deleted": return "D";
    case "renamed": return "R";
    case "untracked": return "U";
    case "conflicted": return "!";
  }
}

export function gitStatusLabel(status: GitChangeKind) {
  switch (status) {
    case "modified": return "已修改";
    case "added": return "已添加";
    case "deleted": return "已删除";
    case "renamed": return "已重命名";
    case "untracked": return "未跟踪";
    case "conflicted": return "存在冲突";
  }
}

export function fileName(path: string) {
  return path.split(/[\\/]/u).filter(Boolean).at(-1) ?? path;
}

export function relativeParent(relativePath: string) {
  const segments = relativePath.split(/[\\/]/u);
  return segments.length > 1 ? segments.slice(0, -1).join("/") : "";
}

export function visibleChangeStatus(change: GitFileChange) {
  return change.worktreeStatus ?? change.indexStatus;
}

export function findGitChange(repositories: GitRepository[], path: string) {
  for (const repository of repositories) {
    const change = repository.changes.find((candidate) => candidate.path === path);
    if (change) return { repository, change };
  }
  return null;
}

/** 文件返回精确状态；包含变更的目录返回聚合状态 `changed`。 */
export function gitTreeStatus(
  repositories: GitRepository[],
  path: string,
): GitChangeKind | "changed" | null {
  const exact = findGitChange(repositories, path)?.change;
  if (exact) return visibleChangeStatus(exact);

  const prefix = path.endsWith("/") ? path : `${path}/`;
  let strongest: GitChangeKind | null = null;
  for (const repository of repositories) {
    for (const change of repository.changes) {
      if (!change.path.startsWith(prefix)) continue;
      const status = visibleChangeStatus(change);
      if (!status) continue;
      if (!strongest || STATUS_PRIORITY[status] > STATUS_PRIORITY[strongest]) strongest = status;
    }
  }
  return strongest ? "changed" : null;
}

function sameChange(left: GitFileChange, right: GitFileChange) {
  return left.path === right.path
    && left.relativePath === right.relativePath
    && left.indexStatus === right.indexStatus
    && left.worktreeStatus === right.worktreeStatus;
}

function sameRepository(left: GitRepository, right: GitRepository) {
  return left.root === right.root
    && left.name === right.name
    && left.branch === right.branch
    && left.workspaceRoots.length === right.workspaceRoots.length
    && left.workspaceRoots.every((root, index) => root === right.workspaceRoots[index])
    && left.changes.length === right.changes.length
    && left.changes.every((change, index) => sameChange(change, right.changes[index]));
}

/** 静默轮询结果未变化时复用旧引用，避免文件树重复渲染。 */
export function sameGitWorkspaceStatus(left: GitWorkspaceStatus, right: GitWorkspaceStatus) {
  return left.warnings.length === right.warnings.length
    && left.warnings.every((warning, index) => warning === right.warnings[index])
    && left.repositories.length === right.repositories.length
    && left.repositories.every((repository, index) => sameRepository(repository, right.repositories[index]));
}
