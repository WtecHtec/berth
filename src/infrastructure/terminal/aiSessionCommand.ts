import type { AiSessionSummary } from "../../domain/workbench/models";
import { quoteShellPath } from "../../shared/utils/shell";

/** 生成工具原生的恢复命令；Berth 不读取或接管完整对话内容。 */
export function buildAiSessionResumeCommand(session: AiSessionSummary) {
  const id = quoteShellPath(session.id);
  return session.provider === "claude" ? `claude --resume ${id}` : `codex resume ${id}`;
}
