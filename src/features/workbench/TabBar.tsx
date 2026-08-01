import { useCallback, useState } from "react";
import { FileCode2, FileDiff, FileText, SquareTerminal, X } from "lucide-react";
import type { WorkbenchPane } from "../../domain/workbench/models";
import { useWorkbenchStore } from "../../store/useWorkbenchStore";
import { TabContextMenu } from "./TabContextMenu";
import { useTabCloseController } from "./TabCloseController";

interface TabBarProps {
  pane: WorkbenchPane;
}

export function TabBar({ pane }: TabBarProps) {
  const activateTab = useWorkbenchStore((state) => state.activateTab);
  const { requestCloseTab, requestCloseOtherTabs } = useTabCloseController();
  const [contextMenu, setContextMenu] = useState<{ tabId: string; title: string; x: number; y: number } | null>(null);
  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  return (
    <>
      <div className="tabbar" role="tablist" aria-label="面板标签页">
        <div className="tabbar__scroll">
          {pane.tabs.map((tab) => {
            const active = pane.activeTabId === tab.id;
            const Icon = tab.kind === "terminal"
              ? SquareTerminal
              : tab.kind === "markdown"
                ? FileText
                : tab.kind === "git-diff"
                  ? FileDiff
                  : FileCode2;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={`workbench-tab ${active ? "is-active" : ""}`}
                onClick={() => activateTab(pane.id, tab.id)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  activateTab(pane.id, tab.id);
                  setContextMenu({ tabId: tab.id, title: tab.title, x: event.clientX, y: event.clientY });
                }}
              >
                <Icon size={13} />
                <span>{tab.title}</span>
                {tab.dirty ? <i className="dirty-dot" aria-label="未保存" /> : null}
                <span
                  role="button"
                  tabIndex={0}
                  className="tab-close"
                  aria-label={`关闭 ${tab.title}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    requestCloseTab(pane.id, tab.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    event.stopPropagation();
                    requestCloseTab(pane.id, tab.id);
                  }}
                >
                  <X size={11} />
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {contextMenu ? (
        <TabContextMenu
          title={contextMenu.title}
          x={contextMenu.x}
          y={contextMenu.y}
          canCloseOthers={pane.tabs.some((tab) => tab.id !== contextMenu.tabId)}
          onClose={closeContextMenu}
          onCloseCurrent={() => {
            closeContextMenu();
            requestCloseTab(pane.id, contextMenu.tabId);
          }}
          onCloseOthers={() => {
            closeContextMenu();
            requestCloseOtherTabs(pane.id, contextMenu.tabId);
          }}
        />
      ) : null}
    </>
  );
}
