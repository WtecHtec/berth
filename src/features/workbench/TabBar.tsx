import type { PointerEvent as ReactPointerEvent } from "react";
import { FileCode2, FileDiff, FileText, GripVertical, SquareTerminal, X } from "lucide-react";
import type { WorkbenchPane } from "../../domain/workbench/models";
import { useWorkbenchStore } from "../../store/useWorkbenchStore";

interface TabBarProps {
  pane: WorkbenchPane;
  onPaneDragStart(paneId: string, event: ReactPointerEvent<HTMLButtonElement>): void;
}

export function TabBar({ pane, onPaneDragStart }: TabBarProps) {
  const activateTab = useWorkbenchStore((state) => state.activateTab);
  const closeTab = useWorkbenchStore((state) => state.closeTab);

  return (
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
            >
              <Icon size={13} />
              <span>{tab.title}</span>
              {tab.dirty ? <i className="dirty-dot" aria-label="未保存" /> : null}
              <span
                role="button"
                tabIndex={0}
                className="tab-close"
                aria-label={`关闭 ${tab.title}`}
                onClick={(event) => { event.stopPropagation(); closeTab(pane.id, tab.id); }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") closeTab(pane.id, tab.id);
                }}
              >
                <X size={11} />
              </span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className="pane-drag-handle"
        aria-label="拖动面板"
        onPointerDown={(event) => onPaneDragStart(pane.id, event)}
      >
        <GripVertical size={14} />
      </button>
    </div>
  );
}
