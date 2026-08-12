import { ActivityRail } from "../features/navigation/ActivityRail";
import { FileExplorer } from "../features/files/FileExplorer";
import { GitChangesPanel } from "../features/git/GitChangesPanel";
import { RunningSessionsRail } from "../features/sessions/RunningSessionsRail";
import { StatusBar } from "../features/status/StatusBar";
import { TitleBar } from "../features/titlebar/TitleBar";
import { WorkbenchLayout } from "../features/workbench/WorkbenchLayout";
import { LaunchPage } from "../features/launcher/LaunchPage";
import { useWorkbenchStore } from "../store/useWorkbenchStore";
import { useGitWorkspace } from "../hooks/useGitWorkspace";
import { SshExplorer } from "../features/ssh/SshExplorer";

export function AppShell() {
  useGitWorkspace();
  const sessionsCollapsed = useWorkbenchStore((state) => state.sessionsCollapsed);
  const filesCollapsed = useWorkbenchStore((state) => state.filesCollapsed);
  const sidebarView = useWorkbenchStore((state) => state.sidebarView);
  const hasWorkspace = useWorkbenchStore((state) => state.workspaceRoots.length > 0);

  if (!hasWorkspace) {
    return (
      <main className="app-shell app-shell--launcher">
        <TitleBar />
        <LaunchPage />
      </main>
    );
  }

  return (
    <main className="app-shell">
      <TitleBar />
      <div className="app-body">
        <ActivityRail />
        <RunningSessionsRail collapsed={sessionsCollapsed} />
        {sidebarView === "files" ? <FileExplorer collapsed={filesCollapsed} /> : null}
        {sidebarView === "git" ? <GitChangesPanel collapsed={filesCollapsed} /> : null}
        {sidebarView === "ssh" ? <SshExplorer collapsed={filesCollapsed} /> : null}
        <WorkbenchLayout />
      </div>
      <StatusBar />
    </main>
  );
}
