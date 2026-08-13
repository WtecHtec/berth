import { desktopGateway } from "../app/services";
import type { FileClipboardItem } from "../domain/files/fileClipboard";
import { useFileClipboardStore } from "../store/useFileClipboardStore";

/** 本地复制同步写入 Finder 文件剪贴板，同时保留 Berth 内的结构化路径引用。 */
export async function copyLocalFileItem(item: Extract<FileClipboardItem, { source: "local" }>) {
  const changeCount = await desktopGateway.copyLocalPathToSystemClipboard(item.path);
  useFileClipboardStore.getState().copy(item, changeCount);
}

/** 远端项目先由 Rust 下载到受控缓存，再把真实 file URL 写入 Finder。 */
export async function copySftpFileItem(item: Extract<FileClipboardItem, { source: "sftp" }>) {
  const changeCount = await desktopGateway.copySftpEntryToSystemClipboard(
    item.siteId,
    item.path,
    item.kind,
    item.controlPath,
  );
  useFileClipboardStore.getState().copy(item, changeCount);
}

/** 仅在用户执行“粘贴”时读取系统剪贴板，避免后台轮询触发 macOS 隐私提示。 */
export async function resolveFileClipboardItem(): Promise<FileClipboardItem | null> {
  const current = useFileClipboardStore.getState();
  try {
    const snapshot = await desktopGateway.readSystemFileClipboard();
    if (snapshot.changeCount === current.systemChangeCount && current.item) return current.item;
    const item: FileClipboardItem | null = snapshot.item
      ? { source: "local", ...snapshot.item }
      : null;
    current.replaceFromSystem(item, snapshot.changeCount);
    return item;
  } catch {
    // 系统读取不可用时仍允许使用 Berth 内部剪贴板，避免平台异常破坏原有工作流。
    return current.item;
  }
}
