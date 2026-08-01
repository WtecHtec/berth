use parking_lot::RwLock;
use serde::Deserialize;
use std::{
    collections::HashSet,
    env,
    ffi::{OsStr, OsString},
    path::{Path, PathBuf},
    process::Command,
    sync::OnceLock,
};

const MAX_PATH_ENTRIES: usize = 64;
const MAX_REMOVED_VARIABLES: usize = 64;
const LOGIN_PATH_MARKER: &str = "__BERTH_LOGIN_PATH__";

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandEnvironmentSettings {
    inherit_login_shell_path: bool,
    additional_paths: Vec<String>,
    removed_variables: Vec<String>,
}

impl Default for CommandEnvironmentSettings {
    fn default() -> Self {
        Self {
            inherit_login_shell_path: true,
            additional_paths: Vec::new(),
            removed_variables: vec![
                "npm_config_prefix".to_string(),
                "NPM_CONFIG_PREFIX".to_string(),
            ],
        }
    }
}

static SETTINGS: OnceLock<RwLock<CommandEnvironmentSettings>> = OnceLock::new();
static LOGIN_SHELL_PATH: OnceLock<Option<OsString>> = OnceLock::new();

fn settings() -> &'static RwLock<CommandEnvironmentSettings> {
    SETTINGS.get_or_init(|| RwLock::new(CommandEnvironmentSettings::default()))
}

fn valid_variable_name(name: &str) -> bool {
    let mut characters = name.chars();
    let Some(first) = characters.next() else {
        return false;
    };
    (first == '_' || first.is_ascii_alphabetic())
        && characters.all(|character| character == '_' || character.is_ascii_alphanumeric())
}

fn normalize_settings(
    mut value: CommandEnvironmentSettings,
) -> Result<CommandEnvironmentSettings, String> {
    if value.additional_paths.len() > MAX_PATH_ENTRIES
        || value.removed_variables.len() > MAX_REMOVED_VARIABLES
    {
        return Err("运行环境配置条目过多".to_string());
    }

    value.additional_paths = value
        .additional_paths
        .into_iter()
        .map(|entry| entry.trim().to_string())
        .filter(|entry| !entry.is_empty())
        .collect();
    if value
        .additional_paths
        .iter()
        .any(|entry| !Path::new(entry).is_absolute())
    {
        return Err("附加 PATH 必须使用绝对路径".to_string());
    }

    value.removed_variables = value
        .removed_variables
        .into_iter()
        .map(|entry| entry.trim().to_string())
        .filter(|entry| !entry.is_empty())
        .collect();
    if value
        .removed_variables
        .iter()
        .any(|entry| !valid_variable_name(entry))
    {
        return Err("需要移除的环境变量名称无效".to_string());
    }

    value.additional_paths.dedup();
    value.removed_variables.dedup();
    Ok(value)
}

/** 设置只保存在前端配置中；此命令将当前窗口配置同步到进程级命令环境。 */
#[tauri::command]
pub fn configure_command_environment(
    settings_value: CommandEnvironmentSettings,
) -> Result<(), String> {
    *settings().write() = normalize_settings(settings_value)?;
    Ok(())
}

fn read_login_shell_path() -> Option<OsString> {
    let shell = env::var_os("SHELL").unwrap_or_else(|| OsString::from("/bin/zsh"));
    let output = Command::new(shell)
        .args([
            "-lic",
            &format!("printf '\n{LOGIN_PATH_MARKER}%s\n' \"$PATH\""),
        ])
        // 避免 shell 初始化 NVM 时被外部包管理器前缀阻断。
        .env_remove("npm_config_prefix")
        .env_remove("NPM_CONFIG_PREFIX")
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .rev()
        .find_map(|line| line.strip_prefix(LOGIN_PATH_MARKER))
        .filter(|path| !path.is_empty())
        .map(OsString::from)
}

fn append_paths(target: &mut Vec<PathBuf>, known: &mut HashSet<PathBuf>, value: Option<&OsStr>) {
    let Some(value) = value else {
        return;
    };
    for path in env::split_paths(value) {
        if !path.as_os_str().is_empty() && known.insert(path.clone()) {
            target.push(path);
        }
    }
}

fn resolved_path(value: &CommandEnvironmentSettings) -> Option<OsString> {
    let mut paths = Vec::new();
    let mut known = HashSet::new();
    for entry in &value.additional_paths {
        let path = PathBuf::from(entry);
        if known.insert(path.clone()) {
            paths.push(path);
        }
    }
    if value.inherit_login_shell_path {
        let login_path = LOGIN_SHELL_PATH.get_or_init(read_login_shell_path);
        append_paths(&mut paths, &mut known, login_path.as_deref());
    }
    let inherited_path = env::var_os("PATH");
    append_paths(&mut paths, &mut known, inherited_path.as_deref());

    // Finder 启动的 macOS 应用通常缺少 Homebrew 目录；作为登录 Shell 解析失败时的安全兜底。
    for candidate in ["/opt/homebrew/bin", "/usr/local/bin"] {
        let path = PathBuf::from(candidate);
        if path.is_dir() && known.insert(path.clone()) {
            paths.push(path);
        }
    }
    env::join_paths(paths).ok()
}

/** 将用户配置应用到单个子进程，不修改 Berth 自身的全局环境。 */
pub fn apply_to_command(command: &mut Command) {
    let value = settings().read().clone();
    if let Some(path) = resolved_path(&value) {
        command.env("PATH", path);
    }
    for variable in value.removed_variables {
        command.env_remove(variable);
    }
}

pub fn configured_command(program: impl AsRef<OsStr>) -> Command {
    let mut command = Command::new(program);
    apply_to_command(&mut command);
    command
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_relative_paths_and_invalid_variable_names() {
        assert!(normalize_settings(CommandEnvironmentSettings {
            inherit_login_shell_path: false,
            additional_paths: vec!["relative/bin".to_string()],
            removed_variables: vec!["VALID_NAME".to_string()],
        })
        .is_err());
        assert!(normalize_settings(CommandEnvironmentSettings {
            inherit_login_shell_path: false,
            additional_paths: vec!["/absolute/bin".to_string()],
            removed_variables: vec!["INVALID-NAME".to_string()],
        })
        .is_err());
    }

    #[test]
    fn recommended_defaults_remove_npm_prefix_conflicts() {
        let defaults = CommandEnvironmentSettings::default();
        assert!(defaults.inherit_login_shell_path);
        assert!(defaults
            .removed_variables
            .contains(&"npm_config_prefix".to_string()));
        assert!(defaults
            .removed_variables
            .contains(&"NPM_CONFIG_PREFIX".to_string()));
    }
}
