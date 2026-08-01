import {
  recommendedCommandEnvironmentSettings,
  type CommandEnvironmentSettings,
} from "../../domain/environment/models";
import { validateCommandEnvironmentSettings } from "../../domain/environment/environmentRules";

const STORAGE_KEY = "berth.command-environment.v1";

function parseSettings(raw: string | null): CommandEnvironmentSettings {
  if (!raw) return recommendedCommandEnvironmentSettings();
  try {
    const value = JSON.parse(raw) as Partial<CommandEnvironmentSettings>;
    const candidate: CommandEnvironmentSettings = {
      inheritLoginShellPath: value.inheritLoginShellPath !== false,
      additionalPaths: Array.isArray(value.additionalPaths)
        ? value.additionalPaths.filter((entry): entry is string => typeof entry === "string")
        : [],
      removedVariables: Array.isArray(value.removedVariables)
        ? value.removedVariables.filter((entry): entry is string => typeof entry === "string")
        : recommendedCommandEnvironmentSettings().removedVariables,
    };
    const validation = validateCommandEnvironmentSettings(candidate);
    return validation.ok ? validation.value : recommendedCommandEnvironmentSettings();
  } catch {
    return recommendedCommandEnvironmentSettings();
  }
}

export function loadCommandEnvironmentSettings() {
  try {
    return parseSettings(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return recommendedCommandEnvironmentSettings();
  }
}

export function saveCommandEnvironmentSettings(settings: CommandEnvironmentSettings) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

/** 让其他 Berth 窗口同步运行环境设置。 */
export function subscribeToCommandEnvironmentSettings(
  listener: (settings: CommandEnvironmentSettings) => void,
) {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener(parseSettings(event.newValue));
  };
  window.addEventListener("storage", handleStorage);
  return () => window.removeEventListener("storage", handleStorage);
}
