import type { AiSessionSummary } from "../../domain/workbench/models";
import { quoteShellPath } from "../../shared/utils/shell";

/** Builds a provider-owned resume command; Berth never imports conversation turns. */
export function buildAiSessionResumeCommand(session: AiSessionSummary) {
  const id = quoteShellPath(session.id);
  return session.provider === "claude" ? `claude --resume ${id}` : `codex resume ${id}`;
}
