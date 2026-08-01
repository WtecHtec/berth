import type { TerminalSession, WorkbenchTab } from "../../domain/workbench/models";
import { ExternalLink, GitBranch } from "../../shared/lib/icons";
import { useOpenSystemTerminal } from "../../hooks/useOpenSystemTerminal";
import { IconButton } from "../../shared/ui/IconButton";
import { QuickPhraseComposer } from "./QuickPhraseComposer";
import { TerminalSurface } from "./TerminalSurface";

interface TerminalPanelProps {
  tab: WorkbenchTab;
  session?: TerminalSession;
  selected: boolean;
}

export function TerminalPanel({ tab, session, selected }: TerminalPanelProps) {
  const systemTerminal = useOpenSystemTerminal(session?.cwd);

  return (
    <div className="terminal-panel">
      <div className="panel-toolbar terminal-toolbar">
        <div className="terminal-context">
          <span className={`process-indicator process-indicator--${session?.status ?? "running"}`} />
          <strong>{session?.processLabel ?? "shell"}</strong>
          <span className="toolbar-separator" />
          <span>{session?.cwd}</span>
          {session?.branch ? <span className="branch-label"><GitBranch size={12} />{session.branch}</span> : null}
        </div>
        <div className="panel-toolbar__actions">
          <IconButton
            label={systemTerminal.opening ? "正在打开系统终端" : "在系统终端中打开"}
            disabled={!session || systemTerminal.opening}
            onClick={() => void systemTerminal.open()}
          >
            <ExternalLink size={14} />
          </IconButton>
        </div>
      </div>
      <div className="terminal-stage">
        <TerminalSurface session={session} selected={selected} />
        {systemTerminal.error ? <div className="terminal-action-error" role="alert">{systemTerminal.error}</div> : null}
      </div>
      <QuickPhraseComposer sessionId={session?.id ?? tab.id} />
    </div>
  );
}
