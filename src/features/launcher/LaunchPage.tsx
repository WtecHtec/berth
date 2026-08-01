import { ArrowRight, Clock3, FolderOpen, LayoutPanelLeft } from "lucide-react";
import { useWorkspaceLauncher } from "../../hooks/useWorkspaceLauncher";

function formatRecentDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(date);
}

export function LaunchPage() {
  const { loading, error, recentWorkspaces, openFolder, openPaths } = useWorkspaceLauncher();

  return (
    <section className="launch-page">
      <div className="launch-page__content">
        <div className="launch-brand" aria-hidden="true"><LayoutPanelLeft size={24} strokeWidth={1.8} /></div>
        <h1>Berth</h1>
        <p>打开一个文件夹，开始管理文件与终端。</p>
        <button className="open-folder-button" type="button" onClick={() => void openFolder()} disabled={loading}>
          <FolderOpen size={16} />
          <span>{loading ? "正在打开…" : "打开文件夹"}</span>
        </button>
        {error ? <div className="launch-error" role="alert">{error}</div> : null}

        <div className="recent-workspaces">
          <div className="recent-workspaces__heading">
            <span><Clock3 size={13} />最近窗口</span>
            <span>{recentWorkspaces.length > 0 ? `${recentWorkspaces.length} 个记录` : "暂无记录"}</span>
          </div>
          {recentWorkspaces.length > 0 ? (
            <div className="recent-workspaces__list">
              {recentWorkspaces.map((workspace) => (
                <button key={workspace.id} type="button" onClick={() => void openPaths(workspace.roots)}>
                  <span className="recent-workspace-icon"><FolderOpen size={14} /></span>
                  <span className="recent-workspace-copy">
                    <strong>{workspace.name}</strong>
                    <small>{workspace.roots.join(" · ")}</small>
                  </span>
                  <time>{formatRecentDate(workspace.lastOpenedAt)}</time>
                  <ArrowRight size={13} />
                </button>
              ))}
            </div>
          ) : (
            <div className="recent-workspaces__empty">打开过的窗口会显示在这里。</div>
          )}
        </div>
      </div>
      <footer className="launch-footer">轻量终端工作台 · macOS</footer>
    </section>
  );
}
