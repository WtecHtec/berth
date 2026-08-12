import type { AiSessionListResponse, TreeNode } from "../workbench/models";
import type { CommandEnvironmentSettings } from "../environment/models";
import type { SftpDirectory, SftpEntryKind, SftpTextFile, SshSite } from "../ssh/models";

export interface TerminalCallbacks {
  onData(data: Uint8Array): void;
  onExit(code: number | null): void;
}

export interface TerminalDimensions {
  rows: number;
  cols: number;
}

export type FileDropEvent =
  | { type: "enter" | "over"; position: { x: number; y: number } }
  | { type: "drop"; paths: string[]; position: { x: number; y: number } }
  | { type: "leave" };

export interface HtmlPreviewSession {
  id: string;
  url: string;
}

/**
 * 面向应用层的操作系统能力边界。UI 组件不直接导入 Tauri，
 * 从而保持浏览器预览可运行、平台实现可替换。
 */
export interface DesktopGateway {
  readonly kind: "tauri" | "browser";
  configureCommandEnvironment(settings: CommandEnvironmentSettings): Promise<void>;
  pickFolder(): Promise<string | null>;
  pickFiles(): Promise<string[]>;
  pickSavePath(defaultName: string): Promise<string | null>;
  listDirectory(path: string): Promise<TreeNode[]>;
  searchFiles(roots: string[], query: string): Promise<TreeNode[]>;
  listAiSessions(roots: string[], limitPerProvider: number): Promise<AiSessionListResponse>;
  listSshSites(): Promise<SshSite[]>;
  listSftpDirectory(siteId: string, path: string, controlPath?: string): Promise<SftpDirectory>;
  readSftpTextFile(siteId: string, path: string, controlPath?: string): Promise<SftpTextFile>;
  writeSftpTextFile(siteId: string, path: string, content: string, expected: Pick<SftpTextFile, "size" | "modified">, controlPath?: string): Promise<SftpTextFile>;
  uploadSftpPaths(siteId: string, directory: string, localPaths: string[], controlPath?: string): Promise<SftpDirectory>;
  downloadSftpFile(siteId: string, remotePath: string, localPath: string, controlPath?: string): Promise<void>;
  cacheSftpFile(siteId: string, remotePath: string, controlPath?: string): Promise<string>;
  releaseSftpCache(path: string): Promise<void>;
  createSftpEntry(siteId: string, path: string, kind: "file" | "directory", controlPath?: string): Promise<void>;
  renameSftpEntry(siteId: string, path: string, nextPath: string, controlPath?: string): Promise<void>;
  deleteSftpEntry(siteId: string, path: string, kind: SftpEntryKind, controlPath?: string): Promise<void>;
  readTextFile(path: string): Promise<string>;
  writeTextFile(path: string, content: string): Promise<void>;
  resolveLocalFileUrl(path: string): Promise<string>;
  startHtmlPreview(path: string, content: string): Promise<HtmlPreviewSession>;
  stopHtmlPreview(previewId: string): Promise<void>;
  openPreviewInSystemBrowser(url: string): Promise<void>;
  createFile(directory: string, name: string): Promise<string>;
  renamePath(path: string, newName: string): Promise<string>;
  revealInFinder(path: string): Promise<void>;
  createWindow(): Promise<void>;
  openInSystemTerminal(path: string): Promise<void>;
  subscribeToFileDrops(listener: (event: FileDropEvent) => void): Promise<() => void>;
  spawnTerminal(cwd: string, dimensions: TerminalDimensions, callbacks: TerminalCallbacks): Promise<string>;
  writeTerminal(terminalId: string, data: Uint8Array): Promise<void>;
  resizeTerminal(terminalId: string, rows: number, cols: number): Promise<void>;
  killTerminal(terminalId: string): Promise<void>;
}
