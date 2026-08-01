import { CirclePlus, Ellipsis, SquareTerminal } from "../../shared/lib/icons";
import { IconButton } from "../../shared/ui/IconButton";
import { useWorkbenchStore } from "../../store/useWorkbenchStore";

interface RunningSessionsRailProps {
  collapsed: boolean;
}

const statusLabels = { running: "运行中", waiting: "等待输入", exited: "已退出" } as const;

export function RunningSessionsRail({ collapsed }: RunningSessionsRailProps) {
  const allSessions = useWorkbenchStore((state) => state.sessions);
  const sessions = allSessions;
  const focusSession = useWorkbenchStore((state) => state.focusSession);
  const createTerminal = useWorkbenchStore((state) => state.createTerminal);
  const panes = useWorkbenchStore((state) => state.panes);
  const activeSessionId = panes.flatMap((pane) => pane.tabs)
    .find((tab) => panes.some((pane) => pane.activeTabId === tab.id))?.sessionId;

  return (
    <aside className={`sessions-rail ${collapsed ? "is-collapsed" : ""}`} aria-label="运行中的终端">
      <div className="sidebar-heading">
        <div>
          <span className="sidebar-eyebrow">运行中</span>
          <h2>终端</h2>
        </div>
        <IconButton label="新建终端" onClick={createTerminal}>
          <CirclePlus size={16} />
        </IconButton>
      </div>
      <div className="session-list">
        {sessions.length === 0 ? <div className="session-list__empty">尚未启动终端</div> : null}
        {sessions.map((session) => (
          <button
            key={session.id}
            type="button"
            className={`session-row ${activeSessionId === session.id ? "is-active" : ""}`}
            onClick={() => focusSession(session.id)}
            aria-label={`${session.title}，${statusLabels[session.status]}`}
          >
            <span className={`session-status session-status--${session.status}`} style={{ "--session-color": session.color } as React.CSSProperties}>
              <SquareTerminal size={14} />
            </span>
            <span className="session-row__content">
              <span className="session-row__title">{session.title}</span>
              <span className="session-row__meta">
                <span>{session.project}</span>
                {session.branch ? <><span className="meta-dot">·</span><span>{session.branch}</span></> : null}
              </span>
            </span>
            <span className="session-row__time">{session.lastActivity}</span>
          </button>
        ))}
      </div>
      <div className="sessions-rail__footer">
        <span className="session-summary"><i />{sessions.filter((item) => item.status === "running").length} 活跃</span>
        <IconButton label="会话菜单"><Ellipsis size={16} /></IconButton>
      </div>
    </aside>
  );
}
