import type { PointerEvent as ReactPointerEvent } from "react";
import type { WorkbenchPane } from "../../domain/workbench/models";
import { useWorkbenchStore } from "../../store/useWorkbenchStore";
import { FileViewer } from "../files/FileViewer";
import { TerminalPanel } from "../terminal/TerminalPanel";
import { TabBar } from "./TabBar";
import { FileText, SquareTerminal } from "../../shared/lib/icons";

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

  return (
    <article className="workbench-pane" onPointerDown={() => focusPane(pane.id)}>
      <TabBar pane={pane} onPaneDragStart={onPaneDragStart} />
      <div className="workbench-pane__content">
        {pane.tabs.map((tab) => (
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
            ) : (
              <FileViewer tab={tab} active={activePaneId === pane.id && tab.id === activeTab.id} />
            )}
          </div>
        ))}
      </div>
    </article>
  );
}
