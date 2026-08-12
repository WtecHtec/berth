import type { AiSessionListResponse, TreeNode } from "../workbench/models";
import type { CommandEnvironmentSettings } from "../environment/models";

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
  listDirectory(path: string): Promise<TreeNode[]>;
  searchFiles(roots: string[], query: string): Promise<TreeNode[]>;
  listAiSessions(roots: string[], limitPerProvider: number): Promise<AiSessionListResponse>;
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
