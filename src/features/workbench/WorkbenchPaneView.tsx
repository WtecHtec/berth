import type { PointerEvent as ReactPointerEvent } from "react";
import type { WorkbenchPane } from "../../domain/workbench/models";
import { useWorkbenchStore } from "../../store/useWorkbenchStore";
import { FileViewer } from "../files/FileViewer";
import { TerminalPanel } from "../terminal/TerminalPanel";
import { TabBar } from "./TabBar";
import { FileText, SquareTerminal } from "../../shared/lib/icons";
import { GitDiffView } from "../git/GitDiffView";

interface WorkbenchPaneViewProps {
  pane: WorkbenchPane;
  onPaneDragStart(paneId: string, event: ReactPointerEvent<HTMLButtonElement>): void;
}

export function WorkbenchPaneView({ pane, onPaneDragStart }: WorkbenchPaneViewProps) {
  const sessions = useWorkbenchStore((state) => state.sessions);
  const activePaneId = useWorkbenchStore((state) => state.activePaneId);
  const focusPane = useWorkbenchStore((state) => state.focusPane);
  const createTerminal = useWorkbenchStore((state) => state.createTerminal);
  const activeTab = pane.tabs.find((tab) => tab.id === pane.activeTabId) ?? pane.tabs[0];

  if (!activeTab) {
    return (
      <article className="workbench-pane workbench-pane--empty" onPointerDown={() => focusPane(pane.id)}>
        <div className="empty-pane">
          <div className="empty-pane__icons"><FileText size={18} /><SquareTerminal size={18} /></div>
          <h2>工作区已打开</h2>
          <p>从文件树选择文件，或启动一个终端。</p>
          <button type="button" onClick={createTerminal}>新建终端</button>
        </div>
      </article>
    );
  }

  // 终端标签必须常驻，才能保留 PTY 进程和 xterm 缓冲区；普通文件与 Diff 可按需重建。
  // 未保存文件是例外：即使切到后台也继续挂载，避免组件卸载导致草稿丢失。
  const mountedTabs = pane.tabs.filter((tab) => (
    tab.id === activeTab.id || tab.kind === "terminal" || tab.dirty
  ));

  return (
    <article className="workbench-pane" onPointerDown={() => focusPane(pane.id)}>
      <TabBar pane={pane} onPaneDragStart={onPaneDragStart} />
      <div className="workbench-pane__content">
        {mountedTabs.map((tab) => (
          <div
            className={`workbench-view ${tab.id === activeTab.id ? "is-active" : ""}`}
            key={tab.id}
            aria-hidden={tab.id !== activeTab.id}
          >
            {tab.kind === "terminal" ? (
              <TerminalPanel
                tab={tab}
                session={sessions.find((session) => session.id === tab.sessionId)}
                selected={activePaneId === pane.id && tab.id === activeTab.id}
              />
            ) : tab.kind === "git-diff" ? (
              <GitDiffView tab={tab} active={activePaneId === pane.id && tab.id === activeTab.id} />
            ) : (
              <FileViewer tab={tab} active={activePaneId === pane.id && tab.id === activeTab.id} />
            )}
          </div>
        ))}
      </div>
    </article>
  );
}
