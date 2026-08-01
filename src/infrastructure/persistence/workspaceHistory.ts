import type { WorkspaceRecord } from "../../domain/workbench/models";

const STORAGE_KEY = "berth.workspace-history.v1";

export function loadWorkspaceHistory(): WorkspaceRecord[] {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (!value) return [];
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is WorkspaceRecord => (
      typeof item === "object" && item !== null &&
      typeof (item as WorkspaceRecord).id === "string" &&
      typeof (item as WorkspaceRecord).name === "string" &&
      Array.isArray((item as WorkspaceRecord).roots) &&
      typeof (item as WorkspaceRecord).lastOpenedAt === "string"
    ));
  } catch {
    return [];
  }
}

export function saveWorkspaceHistory(records: WorkspaceRecord[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(0, 12)));
}

function workspaceName(roots: string[]) {
  return roots
    .map((path) => path.split(/[\\/]/u).filter(Boolean).at(-1) ?? path)
    .join(", ");
}

/** 将当前根目录组合保存为一条最近窗口记录。 */
export function rememberWorkspace(roots: string[]) {
  if (roots.length === 0) return [];
  const record: WorkspaceRecord = {
    id: `workspace:${roots.join("\u001f")}`,
    name: workspaceName(roots),
    roots,
    lastOpenedAt: new Date().toISOString(),
  };
  const nextRecords = [record, ...loadWorkspaceHistory().filter((item) => item.id !== record.id)];
  saveWorkspaceHistory(nextRecords);
  return nextRecords;
}
