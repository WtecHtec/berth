import type { PinnedTerminalRecord } from "../../domain/workbench/models";

const STORAGE_KEY = "berth.pinned-terminals.v1";
const MAX_PINNED_TERMINALS = 80;

function isPinnedTerminalRecord(value: unknown): value is PinnedTerminalRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<PinnedTerminalRecord>;
  return typeof record.id === "string"
    && typeof record.title === "string"
    && typeof record.cwd === "string"
    && typeof record.workspaceRoot === "string"
    && typeof record.pinnedAt === "string";
}

function parsePinnedTerminals(value: string | null): PinnedTerminalRecord[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isPinnedTerminalRecord)
      .filter((record) => record.title.trim() && record.cwd && record.workspaceRoot)
      .slice(0, MAX_PINNED_TERMINALS);
  } catch {
    return [];
  }
}

export function loadPinnedTerminals() {
  try {
    return parsePinnedTerminals(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return [];
  }
}

/** 只持久化有限数量的启动元数据，避免终端历史进入本地缓存。 */
export function savePinnedTerminals(records: PinnedTerminalRecord[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(0, MAX_PINNED_TERMINALS)));
}

/** 同步其他 Berth 窗口产生的终端置顶、取消置顶及重命名操作。 */
export function subscribeToPinnedTerminals(listener: (records: PinnedTerminalRecord[]) => void) {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener(parsePinnedTerminals(event.newValue));
  };
  window.addEventListener("storage", handleStorage);
  return () => window.removeEventListener("storage", handleStorage);
}
