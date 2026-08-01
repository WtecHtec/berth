export type SessionStatus = "running" | "waiting" | "exited";

/** A terminal session Berth observes. It is deliberately provider-agnostic. */
export interface TerminalSession {
  id: string;
  title: string;
  project: string;
  cwd: string;
  branch: string;
  status: SessionStatus;
  processLabel: string;
  lastActivity: string;
  color: string;
  aiSession?: Pick<AiSessionSummary, "id" | "provider">;
}

/** One editable input payload waiting to be written to a specific PTY. */
export interface TerminalInputRequest {
  id: string;
  content: string;
  submit: boolean;
}

export type AiSessionProvider = "claude" | "codex";

/** Metadata-only history row. Conversation turns never enter frontend state. */
export interface AiSessionSummary {
  id: string;
  provider: AiSessionProvider;
  rootPath: string;
  title: string;
  updatedAt: number;
  branch?: string;
}

export interface AiSessionListResponse {
  sessions: AiSessionSummary[];
  warnings: string[];
}

export type GitStatus = "modified" | "added" | "deleted";
export type TreeNodeKind = "root" | "folder" | "file" | "history" | "session";

export interface TreeNode {
  id: string;
  name: string;
  path: string;
  kind: TreeNodeKind;
  depth: number;
  expanded?: boolean;
  gitStatus?: GitStatus;
  children?: TreeNode[];
  meta?: string;
}

export type TabKind = "terminal" | "file" | "markdown" | "welcome";

export interface WorkbenchTab {
  id: string;
  title: string;
  kind: TabKind;
  sessionId?: string;
  filePath?: string;
  dirty?: boolean;
}

export interface WorkbenchPane {
  id: string;
  tabs: WorkbenchTab[];
  activeTabId: string;
}

export type WorkbenchLayoutAxis = "horizontal" | "vertical";
export type WorkbenchPaneDropZone = "left" | "right" | "top" | "bottom" | "center";
export type WorkbenchLayoutPreset =
  | "single"
  | "columns"
  | "rows"
  | "main-left"
  | "main-right"
  | "main-top"
  | "quad";

export interface WorkbenchGridLayout {
  rows: number;
  columns: number;
}

/** A recursive split tree keeps layout independent from pane business state. */
export type WorkbenchLayoutNode =
  | {
      type: "pane";
      paneId: string;
    }
  | {
      type: "split";
      id: string;
      axis: WorkbenchLayoutAxis;
      ratio: number;
      children: [WorkbenchLayoutNode, WorkbenchLayoutNode];
    };

export interface QuickPhrase {
  id: string;
  prefix: string;
  title: string;
  content: string;
  category: string;
}

export type QuickPhraseDraft = Omit<QuickPhrase, "id">;

export type QuickPhraseActionResult =
  | { ok: true }
  | { ok: false; error: string };

export interface WorkspaceRecord {
  id: string;
  name: string;
  roots: string[];
  lastOpenedAt: string;
}
