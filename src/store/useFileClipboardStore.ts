import { create } from "zustand";
import type { FileClipboardItem } from "../domain/files/fileClipboard";

interface FileClipboardState {
  item: FileClipboardItem | null;
  copiedAt: number;
  systemChangeCount: number;
  copy(item: FileClipboardItem, systemChangeCount: number): void;
  replaceFromSystem(item: FileClipboardItem | null, systemChangeCount: number): void;
  clear(): void;
}

/** 保存 Berth 内的结构化来源，并用 changeCount 判断系统剪贴板是否已被其他应用替换。 */
export const useFileClipboardStore = create<FileClipboardState>((set) => ({
  item: null,
  copiedAt: 0,
  systemChangeCount: 0,
  copy(item, systemChangeCount) { set({ item, copiedAt: Date.now(), systemChangeCount }); },
  replaceFromSystem(item, systemChangeCount) {
    set({ item, copiedAt: item ? Date.now() : 0, systemChangeCount });
  },
  clear() { set({ item: null, copiedAt: 0, systemChangeCount: 0 }); },
}));
