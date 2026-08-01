import type { DesktopGateway, FileDropEvent, TerminalCallbacks } from "../../domain/desktop/DesktopGateway";
import type { AiSessionListResponse, TreeNode } from "../../domain/workbench/models";

interface TerminalEvent {
  kind: "data" | "exit";
  data?: number[];
  code?: number | null;
}

async function tauriCore() {
  return import("@tauri-apps/api/core");
}

export const tauriDesktopGateway: DesktopGateway = {
  kind: "tauri",
  async pickFolder() {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({ directory: true, multiple: false, title: "打开文件夹" });
    return typeof selected === "string" ? selected : null;
  },
  async listDirectory(path): Promise<TreeNode[]> {
    const { invoke } = await tauriCore();
    return invoke("list_directory", { path });
  },
  async searchFiles(roots, query): Promise<TreeNode[]> {
    const { invoke } = await tauriCore();
    return invoke("search_files", { roots, query });
  },
  async listAiSessions(roots, limitPerProvider) {
    const { invoke } = await tauriCore();
    return invoke<AiSessionListResponse>("list_ai_sessions", { roots, limitPerProvider });
  },
  async readTextFile(path) {
    const { invoke } = await tauriCore();
    return invoke<string>("read_text_file", { path });
  },
  async writeTextFile(path, content) {
    const { invoke } = await tauriCore();
    await invoke("write_text_file", { path, content });
  },
  async createFile(directory, name) {
    const { invoke } = await tauriCore();
    return invoke<string>("create_file", { directory, name });
  },
  async renamePath(path, newName) {
    const { invoke } = await tauriCore();
    return invoke<string>("rename_path", { path, newName });
  },
  async gitDiff(path) {
    const { invoke } = await tauriCore();
    return invoke<string>("git_diff", { path });
  },
  async revealInFinder(path) {
    const { invoke } = await tauriCore();
    await invoke("reveal_in_finder", { path });
  },
  async createWindow() {
    const { invoke } = await tauriCore();
    await invoke("create_app_window");
  },
  async openInSystemTerminal(path) {
    const { invoke } = await tauriCore();
    await invoke("open_in_system_terminal", { path });
  },
  async subscribeToFileDrops(listener) {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const appWindow = getCurrentWindow();
    const scaleFactor = await appWindow.scaleFactor();
    return appWindow.onDragDropEvent(({ payload }) => {
      if (payload.type === "leave") {
        listener({ type: "leave" });
        return;
      }
      // Tauri reports physical pixels while the DOM uses logical pixels.
      const position = {
        x: payload.position.x / scaleFactor,
        y: payload.position.y / scaleFactor,
      };
      const event: FileDropEvent = payload.type === "drop"
        ? { type: "drop", paths: payload.paths, position }
        : { type: payload.type, position };
      listener(event);
    });
  },
  async spawnTerminal(cwd: string, callbacks: TerminalCallbacks) {
    const { Channel, invoke } = await tauriCore();
    const channel = new Channel<TerminalEvent>();
    channel.onmessage = (event) => {
      if (event.kind === "data" && event.data) callbacks.onData(new Uint8Array(event.data));
      if (event.kind === "exit") callbacks.onExit(event.code ?? null);
    };
    return invoke<string>("spawn_terminal", { cwd, channel });
  },
  async writeTerminal(terminalId, data) {
    const { invoke } = await tauriCore();
    await invoke("write_to_terminal", { terminalId, data: Array.from(data) });
  },
  async resizeTerminal(terminalId, rows, cols) {
    const { invoke } = await tauriCore();
    await invoke("resize_terminal", { terminalId, rows, cols });
  },
  async killTerminal(terminalId) {
    const { invoke } = await tauriCore();
    await invoke("kill_terminal", { terminalId });
  },
};
