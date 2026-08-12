import type { DesktopGateway, FileDropEvent, TerminalCallbacks } from "../../domain/desktop/DesktopGateway";
import type { AiSessionListResponse, TreeNode } from "../../domain/workbench/models";
import type { SftpDirectory, SftpTextFile, SshSite } from "../../domain/ssh/models";

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
  async configureCommandEnvironment(settings) {
    const { invoke } = await tauriCore();
    await invoke("configure_command_environment", { settingsValue: settings });
  },
  async pickFolder() {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({ directory: true, multiple: false, title: "打开文件夹" });
    return typeof selected === "string" ? selected : null;
  },
  async pickFiles() {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({ directory: false, multiple: true, title: "选择要上传的文件" });
    if (Array.isArray(selected)) return selected;
    return typeof selected === "string" ? [selected] : [];
  },
  async pickSavePath(defaultName) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    return save({ defaultPath: defaultName, title: "保存远端文件" });
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
  async listSshSites() {
    const { invoke } = await tauriCore();
    return invoke<SshSite[]>("list_ssh_sites");
  },
  async listSftpDirectory(siteId, path, controlPath) {
    const { invoke } = await tauriCore();
    return invoke<SftpDirectory>("list_sftp_directory", { siteId, path, controlPath });
  },
  async readSftpTextFile(siteId, path, controlPath) {
    const { invoke } = await tauriCore();
    return invoke<SftpTextFile>("read_sftp_text_file", { siteId, path, controlPath });
  },
  async writeSftpTextFile(siteId, path, content, expected, controlPath) {
    const { invoke } = await tauriCore();
    return invoke<SftpTextFile>("write_sftp_text_file", {
      siteId,
      path,
      content,
      expectedSize: expected.size,
      expectedModified: expected.modified,
      controlPath,
    });
  },
  async uploadSftpPaths(siteId, directory, localPaths, controlPath) {
    const { invoke } = await tauriCore();
    return invoke<SftpDirectory>("upload_sftp_paths", { siteId, directory, localPaths, controlPath });
  },
  async downloadSftpFile(siteId, remotePath, localPath, controlPath) {
    const { invoke } = await tauriCore();
    await invoke("download_sftp_file", { siteId, remotePath, localPath, controlPath });
  },
  async cacheSftpFile(siteId, remotePath, controlPath) {
    const { invoke } = await tauriCore();
    return invoke<string>("cache_sftp_file", { siteId, remotePath, controlPath });
  },
  async releaseSftpCache(path) {
    const { invoke } = await tauriCore();
    await invoke("release_sftp_cache", { path });
  },
  async createSftpEntry(siteId, path, kind, controlPath) {
    const { invoke } = await tauriCore();
    await invoke("create_sftp_entry", { siteId, path, kind, controlPath });
  },
  async renameSftpEntry(siteId, path, nextPath, controlPath) {
    const { invoke } = await tauriCore();
    await invoke("rename_sftp_entry", { siteId, path, nextPath, controlPath });
  },
  async deleteSftpEntry(siteId, path, kind, controlPath) {
    const { invoke } = await tauriCore();
    await invoke("delete_sftp_entry", { siteId, path, kind, controlPath });
  },
  async readTextFile(path) {
    const { invoke } = await tauriCore();
    return invoke<string>("read_text_file", { path });
  },
  async writeTextFile(path, content) {
    const { invoke } = await tauriCore();
    await invoke("write_text_file", { path, content });
  },
  async resolveLocalFileUrl(path) {
    const { convertFileSrc, invoke } = await tauriCore();
    await invoke("allow_preview_asset", { path });
    return convertFileSrc(path);
  },
  async startHtmlPreview(path, content) {
    const { invoke } = await tauriCore();
    return invoke("start_html_preview", { path, content });
  },
  async stopHtmlPreview(previewId) {
    const { invoke } = await tauriCore();
    await invoke("stop_html_preview", { previewId });
  },
  async openPreviewInSystemBrowser(url) {
    const { invoke } = await tauriCore();
    await invoke("open_preview_in_system_browser", { url });
  },
  async createFile(directory, name) {
    const { invoke } = await tauriCore();
    return invoke<string>("create_file", { directory, name });
  },
  async renamePath(path, newName) {
    const { invoke } = await tauriCore();
    return invoke<string>("rename_path", { path, newName });
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
      // Tauri 返回物理像素，而 DOM 使用逻辑像素，需要按缩放因子换算。
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
  async spawnTerminal(cwd: string, dimensions, callbacks: TerminalCallbacks) {
    const { Channel, invoke } = await tauriCore();
    const channel = new Channel<TerminalEvent>();
    channel.onmessage = (event) => {
      if (event.kind === "data" && event.data) callbacks.onData(new Uint8Array(event.data));
      if (event.kind === "exit") callbacks.onExit(event.code ?? null);
    };
    return invoke<string>("spawn_terminal", {
      cwd,
      rows: dimensions.rows,
      cols: dimensions.cols,
      channel,
    });
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
