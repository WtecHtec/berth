import { useCallback, useMemo, useState } from "react";
import { CirclePlus, Ellipsis, Pin, SquareTerminal } from "../../shared/lib/icons";
import type { PinnedTerminalRecord, TerminalSession } from "../../domain/workbench/models";
import { isSameOrDescendantPath } from "../../shared/utils/path";
import { IconButton } from "../../shared/ui/IconButton";
import { useWorkbenchStore } from "../../store/useWorkbenchStore";
import { AiSessionList } from "./AiSessionList";
import { TerminalContextMenu } from "./TerminalContextMenu";
import { TerminalRenameDialog } from "./TerminalRenameDialog";

interface RunningSessionsRailProps {
  collapsed: boolean;
}

type MenuTarget =
  | { kind: "session"; id: string; title: string; description: string; pinned: boolean; canPin: boolean; x: number; y: number }
  | { kind: "cached"; id: string; title: string; description: string; pinned: true; canPin: true; x: number; y: number };

type RenameTarget = Omit<MenuTarget, "x" | "y" | "pinned" | "canPin">;

const statusLabels = { running: "运行中", waiting: "等待输入", exited: "已退出" } as const;

function pathName(path: string) {
  return path.split(/[\\/]/u).filter(Boolean).at(-1) ?? path;
}

interface SessionRowProps {
  session: TerminalSession;
  active: boolean;
  pinned: boolean;
  onOpen(): void;
  onMenu(x: number, y: number): void;
}

function SessionRow({ session, active, pinned, onOpen, onMenu }: SessionRowProps) {
  return (
    <div className="session-row-shell">
      <button
        type="button"
        className={`session-row ${active ? "is-active" : ""}`}
        onClick={onOpen}
        onContextMenu={(event) => { event.preventDefault(); onMenu(event.clientX, event.clientY); }}
        aria-label={`${session.title}，${statusLabels[session.status]}${pinned ? "，已置顶" : ""}`}
      >
        <span className={`session-status session-status--${session.status}`} style={{ "--session-color": session.color } as React.CSSProperties}>
          <SquareTerminal size={14} />
        </span>
        <span className="session-row__content">
          <span className="session-row__title"><span>{session.title}</span>{pinned ? <Pin size={9} aria-label="已置顶" /> : null}</span>
          <span className="session-row__meta">
            <span>{session.project}</span>
            {session.branch ? <><span className="meta-dot">·</span><span>{session.branch}</span></> : null}
          </span>
        </span>
        <span className="session-row__time">{session.lastActivity}</span>
      </button>
      <button
        type="button"
        className="session-row__menu"
        aria-label={`${session.title} 操作`}
        onClick={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          onMenu(bounds.right - 4, bounds.bottom + 3);
        }}
      >
        <Ellipsis size={14} />
      </button>
    </div>
  );
}

interface CachedTerminalRowProps {
  record: PinnedTerminalRecord;
  onOpen(): void;
  onMenu(x: number, y: number): void;
}

function CachedTerminalRow({ record, onOpen, onMenu }: CachedTerminalRowProps) {
  return (
    <div className="session-row-shell">
      <button
        type="button"
        className="session-row is-cached"
        onClick={onOpen}
        onContextMenu={(event) => { event.preventDefault(); onMenu(event.clientX, event.clientY); }}
        aria-label={`打开置顶终端 ${record.title}`}
        title={record.cwd}
      >
        <span className="session-status session-status--cached"><SquareTerminal size={14} /></span>
        <span className="session-row__content">
          <span className="session-row__title"><span>{record.title}</span><Pin size={9} aria-label="已置顶" /></span>
          <span className="session-row__meta"><span>{pathName(record.cwd)}</span></span>
        </span>
        <span className="session-row__time">点击打开</span>
      </button>
      <button
        type="button"
        className="session-row__menu"
        aria-label={`${record.title} 操作`}
        onClick={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          onMenu(bounds.right - 4, bounds.bottom + 3);
        }}
      >
        <Ellipsis size={14} />
      </button>
    </div>
  );
}

export function RunningSessionsRail({ collapsed }: RunningSessionsRailProps) {
  const sessions = useWorkbenchStore((state) => state.sessions);
  const pinnedTerminals = useWorkbenchStore((state) => state.pinnedTerminals);
  const workspaceRoots = useWorkbenchStore((state) => state.workspaceRoots);
  const focusSession = useWorkbenchStore((state) => state.focusSession);
  const createTerminal = useWorkbenchStore((state) => state.createTerminal);
  const openPinnedTerminal = useWorkbenchStore((state) => state.openPinnedTerminal);
  const pinTerminal = useWorkbenchStore((state) => state.pinTerminal);
  const unpinTerminal = useWorkbenchStore((state) => state.unpinTerminal);
  const removePinnedTerminal = useWorkbenchStore((state) => state.removePinnedTerminal);
  const renameTerminal = useWorkbenchStore((state) => state.renameTerminal);
  const renamePinnedTerminal = useWorkbenchStore((state) => state.renamePinnedTerminal);
  const activeSessionId = useWorkbenchStore((state) => {
    const pane = state.panes.find((item) => item.id === state.activePaneId);
    return pane?.tabs.find((tab) => tab.id === pane.activeTabId)?.sessionId;
  });
  const [menuTarget, setMenuTarget] = useState<MenuTarget | null>(null);
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const closeMenu = useCallback(() => setMenuTarget(null), []);
  const visiblePinnedTerminals = useMemo(() => pinnedTerminals.filter((record) => (
    workspaceRoots.some((root) => isSameOrDescendantPath(record.cwd, root))
  )), [pinnedTerminals, workspaceRoots]);
  const sessionByPinnedId = useMemo(() => new Map(sessions.flatMap((session) => (
    session.pinnedTerminalId ? [[session.pinnedTerminalId, session] as const] : []
  ))), [sessions]);
  const pinnedSessions = visiblePinnedTerminals.flatMap((record) => {
    const session = sessionByPinnedId.get(record.id);
    return session ? [session] : [];
  });
  const pinnedSessionIds = new Set(pinnedSessions.map((session) => session.id));
  const regularSessions = sessions.filter((session) => !pinnedSessionIds.has(session.id));
  const cachedTerminals = visiblePinnedTerminals.filter((record) => !sessionByPinnedId.has(record.id));

  const openSessionMenu = (session: TerminalSession, x: number, y: number) => {
    setActionError(null);
    setMenuTarget({
      kind: "session",
      id: session.id,
      title: session.title,
      description: session.cwd,
      pinned: Boolean(session.pinnedTerminalId),
      canPin: !session.ssh && !session.aiSession,
      x,
      y,
    });
  };

  const openCachedMenu = (record: PinnedTerminalRecord, x: number, y: number) => {
    setActionError(null);
    setMenuTarget({ kind: "cached", id: record.id, title: record.title, description: record.cwd, pinned: true, canPin: true, x, y });
  };

  const showResult = (result: { ok: true } | { ok: false; error: string }) => {
    if (!result.ok) setActionError(result.error);
    return result;
  };

  return (
    <aside className={`sessions-rail ${collapsed ? "is-collapsed" : ""}`} aria-label="运行中的终端">
      <div className="sidebar-heading">
        <div>
          <span className="sidebar-eyebrow">终端管理</span>
          <h2>终端</h2>
        </div>
        <IconButton label="新建终端" onClick={createTerminal}>
          <CirclePlus size={16} />
        </IconButton>
      </div>
      <div className="session-list">
        {visiblePinnedTerminals.length > 0 ? (
          <section className="session-list-section" aria-labelledby="pinned-terminal-heading">
            <div className="session-list-section__heading"><span id="pinned-terminal-heading">置顶</span><em>{visiblePinnedTerminals.length}</em></div>
            {pinnedSessions.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                active={activeSessionId === session.id}
                pinned
                onOpen={() => focusSession(session.id)}
                onMenu={(x, y) => openSessionMenu(session, x, y)}
              />
            ))}
            {cachedTerminals.map((record) => (
              <CachedTerminalRow
                key={record.id}
                record={record}
                onOpen={() => showResult(openPinnedTerminal(record.id))}
                onMenu={(x, y) => openCachedMenu(record, x, y)}
              />
            ))}
          </section>
        ) : null}
        {regularSessions.length > 0 ? (
          <section className="session-list-section" aria-labelledby="running-terminal-heading">
            <div className="session-list-section__heading"><span id="running-terminal-heading">运行中</span><em>{regularSessions.length}</em></div>
            {regularSessions.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                active={activeSessionId === session.id}
                pinned={Boolean(session.pinnedTerminalId)}
                onOpen={() => focusSession(session.id)}
                onMenu={(x, y) => openSessionMenu(session, x, y)}
              />
            ))}
          </section>
        ) : null}
        {sessions.length === 0 && visiblePinnedTerminals.length === 0 ? <div className="session-list__empty">尚未启动终端</div> : null}
        <AiSessionList />
      </div>
      {actionError ? <div className="session-action-error" role="alert" title={actionError}>{actionError}</div> : null}
      <div className="sessions-rail__footer">
        <span className="session-summary"><i />{sessions.filter((item) => item.status === "running").length} 活跃</span>
      </div>
      {menuTarget ? (
        <TerminalContextMenu
          title={menuTarget.title}
          x={menuTarget.x}
          y={menuTarget.y}
          pinned={menuTarget.pinned}
          canPin={menuTarget.canPin}
          onClose={closeMenu}
          onRename={() => {
            setRenameTarget({ kind: menuTarget.kind, id: menuTarget.id, title: menuTarget.title, description: menuTarget.description });
            closeMenu();
          }}
          onTogglePin={() => {
            const result = menuTarget.kind === "cached"
              ? removePinnedTerminal(menuTarget.id)
              : menuTarget.pinned
                ? unpinTerminal(menuTarget.id)
                : pinTerminal(menuTarget.id);
            showResult(result);
            closeMenu();
          }}
        />
      ) : null}
      {renameTarget ? (
        <TerminalRenameDialog
          title={renameTarget.title}
          description={renameTarget.description}
          onCancel={() => setRenameTarget(null)}
          onSubmit={(title) => showResult(renameTarget.kind === "session"
            ? renameTerminal(renameTarget.id, title)
            : renamePinnedTerminal(renameTarget.id, title))}
        />
      ) : null}
    </aside>
  );
}
