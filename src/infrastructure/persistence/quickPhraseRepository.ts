import type { QuickPhrase } from "../../domain/workbench/models";

const STORAGE_KEY = "berth.quick-phrases.v1";

function isQuickPhrase(value: unknown): value is QuickPhrase {
  if (!value || typeof value !== "object") return false;
  const phrase = value as Partial<QuickPhrase>;
  return typeof phrase.id === "string"
    && typeof phrase.prefix === "string"
    && typeof phrase.title === "string"
    && typeof phrase.content === "string"
    && typeof phrase.category === "string";
}

function parseQuickPhrases(value: string | null): QuickPhrase[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(isQuickPhrase) : [];
  } catch {
    return [];
  }
}

export function loadQuickPhrases() {
  try {
    return parseQuickPhrases(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return [];
  }
}

export function saveQuickPhrases(phrases: QuickPhrase[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(phrases));
}

/** 其他 Berth 窗口修改快捷短语后，同步更新当前窗口。 */
export function subscribeToQuickPhrases(listener: (phrases: QuickPhrase[]) => void) {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener(parseQuickPhrases(event.newValue));
  };
  window.addEventListener("storage", handleStorage);
  return () => window.removeEventListener("storage", handleStorage);
}
