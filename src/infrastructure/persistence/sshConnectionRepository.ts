import type { SshRecentConnection } from "../../domain/ssh/models";

const STORAGE_KEY = "berth.ssh-connections.v1";
const MAX_RECENT_CONNECTIONS = 20;

function isRecent(value: unknown): value is SshRecentConnection {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<SshRecentConnection>;
  return typeof item.id === "string"
    && typeof item.target === "string"
    && typeof item.label === "string"
    && typeof item.lastConnectedAt === "string"
    && typeof item.pinned === "boolean";
}

export function loadSshRecentConnections(): SshRecentConnection[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isRecent).slice(0, MAX_RECENT_CONNECTIONS) : [];
  } catch {
    return [];
  }
}

function persist(items: SshRecentConnection[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_RECENT_CONNECTIONS)));
  return items.slice(0, MAX_RECENT_CONNECTIONS);
}

/** 只缓存连接目标与时间，不保存密码、密钥内容或临时 ControlPath。 */
export function rememberSshConnection(target: string, label = target): SshRecentConnection[] {
  const previous = loadSshRecentConnections();
  const existing = previous.find((item) => item.target === target);
  const next: SshRecentConnection = {
    id: existing?.id ?? crypto.randomUUID(),
    target,
    label: existing?.label ?? label,
    lastConnectedAt: new Date().toISOString(),
    pinned: existing?.pinned ?? false,
  };
  return persist([
    next,
    ...previous.filter((item) => item.target !== target),
  ].sort((first, second) => Number(second.pinned) - Number(first.pinned)));
}

export function removeSshRecentConnection(id: string): SshRecentConnection[] {
  return persist(loadSshRecentConnections().filter((item) => item.id !== id));
}

export function toggleSshRecentPin(id: string): SshRecentConnection[] {
  return persist(loadSshRecentConnections()
    .map((item) => item.id === id ? { ...item, pinned: !item.pinned } : item)
    .sort((first, second) => (
      Number(second.pinned) - Number(first.pinned)
      || second.lastConnectedAt.localeCompare(first.lastConnectedAt)
    )));
}
