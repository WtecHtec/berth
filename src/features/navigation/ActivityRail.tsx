import { Folder, GitBranch, PanelLeftClose, Settings2, Terminal } from "lucide-react";
import { IconButton } from "../../shared/ui/IconButton";
import { useWorkbenchStore } from "../../store/useWorkbenchStore";

export function ActivityRail() {
  // Atomic selectors keep React 19's external-store snapshot referentially stable.
  const sessionsCollapsed = useWorkbenchStore((state) => state.sessionsCollapsed);
  const filesCollapsed = useWorkbenchStore((state) => state.filesCollapsed);
  const sidebarView = useWorkbenchStore((state) => state.sidebarView);
  const toggleSessions = useWorkbenchStore((state) => state.toggleSessions);
  const toggleFiles = useWorkbenchStore((state) => state.toggleFiles);
  const toggleSidebarView = useWorkbenchStore((state) => state.toggleSidebarView);
  const setSettingsOpen = useWorkbenchStore((state) => state.setSettingsOpen);

  return (
    <nav className="activity-rail" aria-label="工作台区域">
      <div className="activity-rail__top">
        <IconButton label="运行中的终端" className={!sessionsCollapsed ? "is-active" : ""} onClick={toggleSessions}>
          <Terminal size={18} />
        </IconButton>
        <IconButton
          label="文件"
          className={!filesCollapsed && sidebarView === "files" ? "is-active" : ""}
          onClick={() => toggleSidebarView("files")}
        >
          <Folder size={18} />
        </IconButton>
        <IconButton
          label="源代码管理"
          className={!filesCollapsed && sidebarView === "git" ? "is-active" : ""}
          onClick={() => toggleSidebarView("git")}
        >
          <GitBranch size={18} />
        </IconButton>
      </div>
      <div className="activity-rail__bottom">
        <IconButton label="收起全部侧栏" onClick={() => {
          if (!sessionsCollapsed) toggleSessions();
          if (!filesCollapsed) toggleFiles();
        }}>
          <PanelLeftClose size={18} />
        </IconButton>
        <IconButton label="设置" onClick={() => setSettingsOpen(true)}>
          <Settings2 size={18} />
        </IconButton>
      </div>
    </nav>
  );
}
