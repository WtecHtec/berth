import type { DesktopGateway } from "../../domain/desktop/DesktopGateway";
/** 浏览器适配器不暴露伪造的文件系统或终端数据。 */
export const browserDesktopGateway: DesktopGateway = {
  kind: "browser",
  async configureCommandEnvironment() {},
  async pickFolder() {
    return null;
  },
  async listDirectory() {
    return [];
  },
  async searchFiles() {
    return [];
  },
  async listAiSessions() {
    return { sessions: [], warnings: [] };
  },
  async readTextFile() {
    throw new Error("文件读取仅在桌面应用中可用");
  },
  async writeTextFile() {
    throw new Error("文件保存仅在桌面应用中可用");
  },
  async resolveLocalFileUrl() {
    throw new Error("本地媒体预览仅在桌面应用中可用");
  },
  async startHtmlPreview() {
    throw new Error("HTML 预览仅在桌面应用中可用");
  },
  async stopHtmlPreview() {},
  async openPreviewInSystemBrowser(url) {
    const nextWindow = window.open(url, "_blank", "noopener,noreferrer");
    if (!nextWindow) throw new Error("浏览器阻止了预览窗口");
    nextWindow.opener = null;
  },
  async createFile() {
    throw new Error("新建文件仅在桌面应用中可用");
  },
  async renamePath() {
    throw new Error("重命名仅在桌面应用中可用");
  },
  async revealInFinder() {},
  async createWindow() {
    const nextWindow = window.open(window.location.href, "_blank");
    if (!nextWindow) throw new Error("浏览器阻止了新窗口");
    nextWindow.opener = null;
  },
  async openInSystemTerminal() {
    throw new Error("打开系统终端仅在桌面应用中可用");
  },
  async subscribeToFileDrops() {
    return () => {};
  },
  async spawnTerminal(_cwd, _dimensions, callbacks) {
    callbacks.onExit(null);
    throw new Error("终端仅在桌面应用中可用");
  },
  async writeTerminal() {},
  async resizeTerminal() {},
  async killTerminal() {},
};
