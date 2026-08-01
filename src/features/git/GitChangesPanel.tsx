import { useState } from "react";
import type { GitChangeKind, GitDiffMode, GitFileChange, GitRepository } from "../../domain/git/models";
import { fileName, gitStatusLabel, gitStatusLetter, relativeParent } from "../../domain/git/status";
import { useGitActions } from "../../hooks/useGitWorkspace";
import { useGitStore } from "../../store/useGitStore";
import {
  ChevronRight,
  GitBranch,
  ListMinus,
  ListPlus,
  Plus,
  RefreshCw,
  Undo2,
} from "lucide-react";
import { IconButton } from "../../shared/ui/IconButton";

interface ChangeRowProps {
  repository: GitRepository;
  change: GitFileChange;
  mode: GitDiffMode;
  status: GitChangeKind;
  actions: ReturnType<typeof useGitActions>;
}

function ChangeRow({ repository, change, mode, status, actions }: ChangeRowProps) {
  const repositoryBusy = useGitStore((state) => Boolean(state.busyPaths[repository.root]));
  const busy = useGitStore((state) => state.busyPaths[change.path]);
  const parent = relativeParent(change.relativePath);
  const staged = mode === "staged";

  return (
    <div className="git-change-row">
      <button
        type="button"
        className="git-change-row__main"
        title={`${gitStatusLabel(status)} · ${change.relativePath}`}
        onClick={() => actions.openDiff(repository, change, mode)}
      >
        <span className="git-change-row__copy">
          <strong>{fileName(change.path)}</strong>
          {parent ? <small>{parent}</small> : null}
        </span>
        <span className={`git-change-status git-change-status--${status}`}>{gitStatusLetter(status)}</span>
      </button>
      <IconButton
        label={staged ? `取消暂存 ${fileName(change.path)}` : `暂存 ${fileName(change.path)}`}
        className={`git-change-row__action ${busy ? "is-busy" : ""}`}
        disabled={repositoryBusy || Boolean(busy)}
        onClick={() => void (staged
          ? actions.unstage(repository.root, change.path)
          : actions.stage(repository.root, change.path))}
      >
        {busy ? <RefreshCw size={12} /> : staged ? <Undo2 size={12} /> : <Plus size={12} />}
      </IconButton>
    </div>
  );
}

interface ChangeGroupProps {
  title: string;
  repository: GitRepository;
  mode: GitDiffMode;
  changes: Array<{ change: GitFileChange; status: GitChangeKind }>;
  actions: ReturnType<typeof useGitActions>;
}

function ChangeGroup({ title, repository, mode, changes, actions }: ChangeGroupProps) {
  if (changes.length === 0) return null;
  return (
    <section className="git-change-group" aria-label={`${repository.name} ${title}`}>
      <div className="git-change-group__heading">
        <span>{title}</span>
        <em>{changes.length}</em>
      </div>
      {changes.map(({ change, status }) => (
        <ChangeRow
          key={`${mode}:${change.path}`}
          repository={repository}
          change={change}
          mode={mode}
          status={status}
          actions={actions}
        />
      ))}
    </section>
  );
}

interface RepositorySectionProps {
  repository: GitRepository;
  expanded: boolean;
  onToggle(): void;
  actions: ReturnType<typeof useGitActions>;
}

function RepositorySection({ repository, expanded, onToggle, actions }: RepositorySectionProps) {
  const busy = useGitStore((state) => state.busyPaths[repository.root]);
  const working = repository.changes.flatMap((change) => (
    change.worktreeStatus ? [{ change, status: change.worktreeStatus }] : []
  ));
  const staged = repository.changes.flatMap((change) => (
    change.indexStatus ? [{ change, status: change.indexStatus }] : []
  ));
  const count = working.length + staged.length;

  return (
    <section className="git-repository">
      <div className="git-repository__heading">
        <button
          type="button"
          className="git-repository__toggle"
          aria-expanded={expanded}
          onClick={onToggle}
        >
          <ChevronRight size={12} className={expanded ? "is-open" : ""} />
          <span>
            <strong>{repository.name}</strong>
            <small><GitBranch size={10} />{repository.branch}</small>
          </span>
          <em>{count}</em>
        </button>
        <div className="git-repository__actions">
          <IconButton
            label={`暂存 ${repository.name} 的所有更改`}
            className={busy === "stage" ? "is-busy" : ""}
            disabled={Boolean(busy) || working.length === 0}
            onClick={() => void actions.stageAll(repository.root)}
          >
            {busy === "stage" ? <RefreshCw size={12} /> : <ListPlus size={13} />}
          </IconButton>
          <IconButton
            label={`取消暂存 ${repository.name} 的所有更改`}
            className={busy === "unstage" ? "is-busy" : ""}
            disabled={Boolean(busy) || staged.length === 0}
            onClick={() => void actions.unstageAll(repository.root)}
          >
            {busy === "unstage" ? <RefreshCw size={12} /> : <ListMinus size={13} />}
          </IconButton>
        </div>
      </div>
      {expanded ? (
        <div className="git-repository__content">
          <ChangeGroup title="已暂存的更改" repository={repository} mode="staged" changes={staged} actions={actions} />
          <ChangeGroup title="更改" repository={repository} mode="working" changes={working} actions={actions} />
          {count === 0 ? <div className="git-repository__clean">没有待处理的更改</div> : null}
        </div>
      ) : null}
    </section>
  );
}

interface GitChangesPanelProps {
  collapsed: boolean;
}

export function GitChangesPanel({ collapsed }: GitChangesPanelProps) {
  const repositories = useGitStore((state) => state.repositories);
  const loading = useGitStore((state) => state.loading);
  const refreshing = useGitStore((state) => state.refreshing);
  const error = useGitStore((state) => state.error);
  const warnings = useGitStore((state) => state.warnings);
  const setError = useGitStore((state) => state.setError);
  const actions = useGitActions();
  const [selectedRoot, setSelectedRoot] = useState("all");
  const [collapsedRoots, setCollapsedRoots] = useState<Record<string, true>>({});
  const activeRoot = selectedRoot === "all" || repositories.some((repository) => repository.root === selectedRoot)
    ? selectedRoot
    : "all";
  const visibleRepositories = activeRoot === "all"
    ? repositories
    : repositories.filter((repository) => repository.root === activeRoot);

  return (
    <aside className={`file-explorer git-changes-panel ${collapsed ? "is-collapsed" : ""}`} aria-label="源代码管理">
      <div className="sidebar-heading git-sidebar-heading">
        <div>
          <span className="sidebar-eyebrow">工作区</span>
          <h2>源代码管理</h2>
        </div>
        <div className="heading-actions">
          <IconButton
            label="刷新 Git 状态"
            className={`git-refresh-button ${refreshing ? "is-refreshing" : ""}`}
            disabled={loading || refreshing}
            onClick={() => void actions.refresh()}
          >
            <RefreshCw size={14} />
          </IconButton>
        </div>
      </div>
      {repositories.length > 1 ? (
        <div className="git-repository-filter">
          <select
            aria-label="筛选 Git 仓库"
            value={activeRoot}
            onChange={(event) => setSelectedRoot(event.target.value)}
          >
            <option value="all">全部仓库</option>
            {repositories.map((repository) => (
              <option key={repository.root} value={repository.root}>{repository.name}</option>
            ))}
          </select>
        </div>
      ) : null}
      <div className={`git-repository-list ${repositories.length > 1 ? "has-filter" : ""}`}>
        {loading ? <div className="git-sidebar-state"><RefreshCw size={15} className="is-spinning" />正在读取 Git 状态…</div> : null}
        {!loading && repositories.length === 0 && !error ? (
          <div className="git-sidebar-state">
            <GitBranch size={18} />
            <strong>当前工作区没有 Git 仓库</strong>
            <span>初始化仓库后重新刷新即可。</span>
          </div>
        ) : null}
        {visibleRepositories.map((repository) => (
          <RepositorySection
            key={repository.root}
            repository={repository}
            actions={actions}
            expanded={!collapsedRoots[repository.root]}
            onToggle={() => setCollapsedRoots((current) => {
              const next = { ...current };
              if (next[repository.root]) delete next[repository.root];
              else next[repository.root] = true;
              return next;
            })}
          />
        ))}
      </div>
      {error ? (
        <button type="button" className="git-sidebar-error" onClick={() => setError(null)}>{error}</button>
      ) : null}
      {!error && warnings.length > 0 ? (
        <div className="git-sidebar-warning" title={warnings.join("\n")}>{warnings[0]}</div>
      ) : null}
      <div className="file-explorer__footer git-sidebar-footer">
        <span>{repositories.length} 个 Git 仓库</span>
      </div>
    </aside>
  );
}
