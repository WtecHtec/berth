import type { QuickPhrase, QuickPhraseDraft } from "../workbench/models";

export type PhraseValidationResult =
  | { ok: true; value: QuickPhraseDraft }
  | { ok: false; error: string };

/** Normalizes and validates phrase input before it enters application state. */
export function validateQuickPhraseDraft(
  draft: QuickPhraseDraft,
  existing: QuickPhrase[],
  editingId?: string,
): PhraseValidationResult {
  const rawPrefix = draft.prefix.trim();
  const value: QuickPhraseDraft = {
    prefix: rawPrefix.startsWith("/") ? rawPrefix : `/${rawPrefix}`,
    title: draft.title.trim(),
    content: draft.content.trim(),
    category: draft.category.trim(),
  };

  if (!rawPrefix) return { ok: false, error: "请输入调用前缀" };
  if (!value.title) return { ok: false, error: "请输入短语名称" };
  if (!value.content) return { ok: false, error: "请输入展开内容" };
  const duplicate = existing.some((phrase) => (
    phrase.id !== editingId && phrase.prefix.toLowerCase() === value.prefix.toLowerCase()
  ));
  if (duplicate) return { ok: false, error: "调用前缀已存在" };
  return { ok: true, value };
}
