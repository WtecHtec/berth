import type { SftpEntryKind } from "../ssh/models";

export type FileClipboardItem =
  | {
      source: "local";
      name: string;
      path: string;
      kind: "file" | "directory";
    }
  | {
      source: "sftp";
      name: string;
      path: string;
      kind: SftpEntryKind;
      siteId: string;
      controlPath?: string;
    };

export interface SystemFileClipboardItem {
  name: string;
  path: string;
  kind: "file" | "directory";
}

export interface SystemFileClipboardSnapshot {
  changeCount: number;
  item: SystemFileClipboardItem | null;
}

export function clipboardKindLabel(item: FileClipboardItem) {
  return item.kind === "directory" ? "文件夹" : "文件";
}
