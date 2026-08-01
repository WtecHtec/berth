import { useMemo } from "react";
import type { WorkbenchTab } from "../../domain/workbench/models";
import { parseUnifiedDiff } from "../../domain/git/diff";
import { findGitChange } from "../../domain/git/status";
import { useGitActions } from "../../hooks/useGitWorkspace";
import { useGitDiff } from "../../hooks/useGitDiff";
import { useGitStore } from "../../store/useGitStore";
import { GitBranch, Minus, Plus, RefreshCw } from "lucide-react";
import { IconButton } from "../../shared/ui/IconButton";

export function GitDiffView({ tab, active }: { tab: WorkbenchTab; active: boolean }) {
  const target = tab.gitDiffTarget;
  if (!target) return <div className="content-state content-state--error">Diff 目标无效</div>;
  return <GitDiffContent target={target} active={active} />;
}

function GitDiffContent({ target, active }: {
  target: NonNullable<WorkbenchTab["gitDiffTarget"]>;
  active: boolean;
}) {
  const repositories = useGitStore((state) => state.repositories);
  const revision = useGitStore((state) => state.revision);
  const busy = useGitStore((state) => state.busyPaths[target.path]);
  const operationError = useGitStore((state) => state.error);
  const repository = repositories.find((candidate) => candidate.root === target.repositoryRoot);
  const located = findGitChange(repositories, target.path);
  const change = located?.change;
  const actions = useGitActions();
  const diff = useGitDiff(target, revision, active);
  const parsed = useMemo(() => parseUnifiedDiff(diff.content), [diff.content]);
  const canStage = target.mode === "working" && Boolean(change?.worktreeStatus);
  const canUnstage = target.mode === "staged" && Boolean(change?.indexStatus);

  return (
    <div className="git-diff-view">
      <div className="panel-toolbar git-diff-toolbar">
        <div className="git-diff-identity" title={target.path}>
          <span>{target.relativePath}</span>
          <small><GitBranch size={10} />{repository?.branch ?? "Git"}</small>
        </div>
        <div className="panel-toolbar__actions">
          <span className={`git-diff-mode git-diff-mode--${target.mode}`}>
            {target.mode === "staged" ? "已暂存 ↔ HEAD" : "工作区 ↔ 暂存区"}
          </span>
          {canStage ? (
            <button
              type="button"
              className="git-diff-action"
              disabled={Boolean(busy)}
              onClick={() => void actions.stage(target.repositoryRoot, target.path)}
            >
              {busy ? <RefreshCw size={12} className="is-spinning" /> : <Plus size={12} />}
              暂存
            </button>
          ) : null}
          {canUnstage ? (
            <button
              type="button"
              className="git-diff-action"
              disabled={Boolean(busy)}
              onClick={() => void actions.unstage(target.repositoryRoot, target.path)}
            >
              {busy ? <RefreshCw size={12} className="is-spinning" /> : <Minus size={12} />}
              取消暂存
            </button>
          ) : null}
          <IconButton label="重新加载 Diff" onClick={() => void diff.reload()} disabled={diff.loading}>
            <RefreshCw size={13} className={diff.loading ? "is-spinning" : ""} />
          </IconButton>
        </div>
      </div>
      <div className="git-diff-content">
        {diff.loading && parsed.lines.length === 0 ? (
          <div className="content-state"><RefreshCw size={16} className="is-spinning" />正在生成 Diff…</div>
        ) : null}
        {diff.error ? <div className="content-state content-state--error">{diff.error}</div> : null}
        {!diff.loading && !diff.error && parsed.lines.length <= 1 ? (
          <div className="git-diff-empty">
            <strong>{target.mode === "working" ? "没有未暂存的更改" : "没有已暂存的更改"}</strong>
            {target.mode === "working" && change?.indexStatus && repository ? (
              <button type="button" onClick={() => actions.openDiff(repository, change, "staged")}>查看已暂存更改</button>
            ) : null}
          </div>
        ) : null}
        {!diff.error && parsed.lines.length > 1 ? (
          <pre className="unified-diff" aria-label={`${target.relativePath} Git Diff`}>
            {parsed.lines.map((line, index) => (
              <span className={`diff-line diff-line--${line.kind}`} key={`${index}:${line.content}`}>
                <i>{line.oldLine ?? ""}</i>
                <i>{line.newLine ?? ""}</i>
                <code>{line.content || " "}</code>
              </span>
            ))}
          </pre>
        ) : null}
        {diff.truncated || parsed.lineLimitReached ? (
          <div className="git-diff-truncated">Diff 内容较大，已停止继续渲染。</div>
        ) : null}
        {operationError ? <div className="git-diff-operation-error">{operationError}</div> : null}
      </div>
    </div>
  );
}
