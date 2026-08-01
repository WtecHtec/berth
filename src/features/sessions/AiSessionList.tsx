import { useMemo } from "react";
import type { AiSessionProvider, AiSessionSummary } from "../../domain/workbench/models";
import { Bot, Folder, RefreshCw, Sparkles } from "../../shared/lib/icons";
import { IconButton } from "../../shared/ui/IconButton";
import { AI_SESSION_LIMIT_PER_PROVIDER, useAiSessions } from "../../hooks/useAiSessions";
import { useWorkbenchStore } from "../../store/useWorkbenchStore";

const providerLabels: Record<AiSessionProvider, string> = {
  claude: "Claude Code",
  codex: "Codex",
};

const relativeTime = new Intl.RelativeTimeFormat("zh-CN", { numeric: "auto" });
const calendarDate = new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" });

function pathName(path: string) {
  return path.split(/[\\/]/u).filter(Boolean).at(-1) ?? path;
}

function formatSessionTime(timestamp: number) {
  const elapsedSeconds = Math.round((timestamp - Date.now()) / 1000);
  if (Math.abs(elapsedSeconds) < 60) return "刚刚";
  const elapsedMinutes = Math.round(elapsedSeconds / 60);
  if (Math.abs(elapsedMinutes) < 60) return relativeTime.format(elapsedMinutes, "minute");
  const elapsedHours = Math.round(elapsedMinutes / 60);
  if (Math.abs(elapsedHours) < 24) return relativeTime.format(elapsedHours, "hour");
  const elapsedDays = Math.round(elapsedHours / 24);
  if (Math.abs(elapsedDays) < 14) return relativeTime.format(elapsedDays, "day");
  return calendarDate.format(timestamp);
}

function ProviderIcon({ provider }: { provider: AiSessionProvider }) {
  return provider === "claude" ? <Sparkles size={13} /> : <Bot size={13} />;
}

function AiSessionRow({ session, running }: { session: AiSessionSummary; running: boolean }) {
  const openAiSession = useWorkbenchStore((state) => state.openAiSession);
  const providerLabel = providerLabels[session.provider];
  return (
    <button
      type="button"
      className={`ai-session-row ${running ? "is-running" : ""}`}
      onClick={() => openAiSession(session)}
      aria-label={`${running ? "切换到" : "恢复"} ${providerLabel} 会话 ${session.title}`}
    >
      <span className={`ai-session-provider ai-session-provider--${session.provider}`}>
        <ProviderIcon provider={session.provider} />
      </span>
      <span className="ai-session-row__content">
        <strong>{session.title}</strong>
        <small>
          <span>{providerLabel}</span>
          {session.branch ? <><i>·</i><span>{session.branch}</span></> : null}
        </small>
      </span>
      <span className="ai-session-row__state">{running ? "已打开" : formatSessionTime(session.updatedAt)}</span>
    </button>
  );
}

export function AiSessionList() {
  const roots = useWorkbenchStore((state) => state.workspaceRoots);
  const terminals = useWorkbenchStore((state) => state.sessions);
  const { sessions, refreshing, refreshPhase, error, refresh } = useAiSessions();
  const runningKeys = useMemo(() => new Set(terminals.flatMap((session) => (
    session.aiSession ? [`${session.aiSession.provider}:${session.aiSession.id}`] : []
  ))), [terminals]);
  const groups = useMemo(() => roots.map((root) => ({
    root,
    sessions: sessions.filter((session) => session.rootPath === root),
  })), [roots, sessions]);
  const refreshStatus = refreshPhase === "refreshing"
    ? "正在同步最新会话…"
    : refreshPhase === "complete"
      ? `已更新 · 每个工具最近 ${AI_SESSION_LIMIT_PER_PROVIDER} 条`
      : `仅元数据 · 每个工具最近 ${AI_SESSION_LIMIT_PER_PROVIDER} 条`;

  return (
    <section
      className={`ai-session-section is-${refreshPhase}`}
      aria-labelledby="ai-session-heading"
      aria-busy={refreshing}
    >
      <div className="ai-session-heading">
        <div>
          <span className="sidebar-eyebrow">项目记录</span>
          <h3 id="ai-session-heading">AI 会话</h3>
        </div>
        <IconButton
          label={refreshing ? "正在刷新 AI 会话" : "刷新 AI 会话"}
          className="ai-session-refresh-button"
          disabled={refreshing}
          onClick={() => void refresh()}
        >
          <RefreshCw className="ai-session-refresh-icon" size={14} />
        </IconButton>
      </div>
      <div className="ai-session-limit" role="status" aria-live="polite" aria-atomic="true">
        {refreshStatus}
      </div>
      <div className="ai-session-refresh-track" aria-hidden="true"><span /></div>
      {error ? <div className="ai-session-error" role="alert" title={error}>{error}</div> : null}
      {groups.map((group) => (
        <div className="ai-session-root" key={group.root}>
          <div className="ai-session-root__label" title={group.root}>
            <Folder size={12} /><span>{pathName(group.root)}</span><em>{group.sessions.length}</em>
          </div>
          {group.sessions.length > 0 ? group.sessions.map((session) => (
            <AiSessionRow
              key={`${session.provider}:${session.id}`}
              session={session}
              running={runningKeys.has(`${session.provider}:${session.id}`)}
            />
          )) : (
            <div className="ai-session-empty">{refreshing ? "正在获取会话…" : "暂无 Claude Code 或 Codex 会话"}</div>
          )}
        </div>
      ))}
    </section>
  );
}
