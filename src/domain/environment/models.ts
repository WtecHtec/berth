export interface CommandEnvironmentSettings {
  inheritLoginShellPath: boolean;
  additionalPaths: string[];
  removedVariables: string[];
}

/** 推荐配置覆盖 macOS GUI PATH 缺失与 NVM npm_config_prefix 冲突。 */
export function recommendedCommandEnvironmentSettings(): CommandEnvironmentSettings {
  return {
    inheritLoginShellPath: true,
    additionalPaths: [],
    removedVariables: ["npm_config_prefix", "NPM_CONFIG_PREFIX"],
  };
}
