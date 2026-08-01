import type { AiSessionSummary } from "../../domain/workbench/models";

const STORAGE_KEY = "berth.ai-session-cache.v1";
const MAX_CACHED_ROOTS = 24;

type SessionCache = Record<string, AiSessionSummary[]>;

function isAiSession(value: unknown): value is AiSessionSummary {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<AiSessionSummary>;
  return typeof session.id === "string"
    && (session.provider === "claude" || session.provider === "codex")
    && typeof session.rootPath === "string"
    && typeof session.title === "string"
    && typeof session.updatedAt === "number"
    && (session.branch === undefined || typeof session.branch === "string");
}

function readCache(): SessionCache {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (!value) return {};
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).map(([root, sessions]) => [
      root,
      Array.isArray(sessions) ? sessions.filter(isAiSession) : [],
    ]));
  } catch {
    return {};
  }
}

/** Returns cached metadata immediately while the native provider refreshes it. */
export function loadAiSessionCache(roots: string[]) {
  const cache = readCache();
  return roots.flatMap((root) => cache[root] ?? []);
}

export function saveAiSessionCache(roots: string[], sessions: AiSessionSummary[]) {
  const cache = readCache();
  for (const root of roots) {
    delete cache[root];
    cache[root] = sessions.filter((session) => session.rootPath === root);
  }
  const boundedCache = Object.fromEntries(Object.entries(cache).slice(-MAX_CACHED_ROOTS));
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(boundedCache));
}
