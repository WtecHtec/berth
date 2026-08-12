import type { GitDiffTarget } from "../git/models";

export type SessionStatus = "running" | "waiting" | "exited";

/** Berth 管理的终端会话模型，刻意保持与 Claude/Codex 等工具无关。 */
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
  ssh?: {
    siteId: string;
    remotePath: string;
    /** Berth 创建的 SSH 主连接套接字；SFTP 通过它复用终端内已经完成的认证。 */
    controlPath?: string;
  };
}

/** 等待写入指定 PTY 的一次可编辑输入请求。 */
export interface TerminalInputRequest {
  id: string;
  content: string;
  submit: boolean;
}

export type AiSessionProvider = "claude" | "codex";

/** 只包含元数据的历史会话；完整对话内容不会进入前端状态。 */
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

export type TreeNodeKind = "root" | "folder" | "file" | "history" | "session";

export interface TreeNode {
  id: string;
  name: string;
  path: string;
  kind: TreeNodeKind;
  depth: number;
  expanded?: boolean;
  children?: TreeNode[];
  meta?: string;
}

export type TabKind = "terminal" | "file" | "markdown" | "git-diff" | "sftp-file" | "welcome";

export interface SftpFileReference {
  siteId: string;
  path: string;
  controlPath?: string;
  size: number;
  modified: string;
}

export interface WorkbenchTab {
  id: string;
  title: string;
  kind: TabKind;
  sessionId?: string;
  filePath?: string;
  sftpFile?: SftpFileReference;
  gitDiffTarget?: GitDiffTarget;
  dirty?: boolean;
}

export interface WorkbenchPane {
  id: string;
  tabs: WorkbenchTab[];
  activeTabId: string;
}

export type WorkbenchLayoutAxis = "horizontal" | "vertical";
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

/** 递归分割树只描述布局，使其与面板业务状态保持独立。 */
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
