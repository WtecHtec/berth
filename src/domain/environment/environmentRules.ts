import type { CommandEnvironmentSettings } from "./models";

export type CommandEnvironmentValidation =
  | { ok: true; value: CommandEnvironmentSettings }
  | { ok: false; error: string };

const VARIABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/u;
const MAX_ENTRIES = 64;

function uniqueEntries(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

/** 在进入持久化与原生命令层前统一收敛配置格式。 */
export function validateCommandEnvironmentSettings(
  settings: CommandEnvironmentSettings,
): CommandEnvironmentValidation {
  const additionalPaths = uniqueEntries(settings.additionalPaths);
  const removedVariables = uniqueEntries(settings.removedVariables);
  if (additionalPaths.length > MAX_ENTRIES || removedVariables.length > MAX_ENTRIES) {
    return { ok: false, error: "每项最多配置 64 条记录。" };
  }
  if (additionalPaths.some((path) => !path.startsWith("/"))) {
    return { ok: false, error: "附加 PATH 必须使用以 / 开头的绝对路径。" };
  }
  if (removedVariables.some((name) => !VARIABLE_NAME.test(name))) {
    return { ok: false, error: "环境变量名称只能包含字母、数字和下划线，且不能以数字开头。" };
  }
  return {
    ok: true,
    value: {
      inheritLoginShellPath: settings.inheritLoginShellPath,
      additionalPaths,
      removedVariables,
    },
  };
}
