use std::path::{Path, PathBuf};
use std::process::Command;

fn resolve_terminal_directory(path: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(path);
    let resolved = path
        .canonicalize()
        .map_err(|error| format!("无法访问终端目录：{error}"))?;
    if resolved.is_dir() {
        return Ok(resolved);
    }
    resolved
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "无法确定终端目录".to_string())
}

#[cfg(target_os = "macos")]
fn open_terminal(directory: &Path) -> Result<(), String> {
    let status = Command::new("open")
        .args(["-a", "Terminal"])
        .arg(directory)
        .status()
        .map_err(|error| format!("无法启动系统终端：{error}"))?;
    status
        .success()
        .then_some(())
        .ok_or_else(|| "系统终端启动失败".to_string())
}

#[cfg(target_os = "windows")]
fn open_terminal(directory: &Path) -> Result<(), String> {
    Command::new("cmd")
        .args(["/C", "start", "", "cmd.exe", "/K", "cd", "/d"])
        .arg(directory)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("无法启动系统终端：{error}"))
}

#[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
fn open_terminal(directory: &Path) -> Result<(), String> {
    let executable = std::env::var_os("TERMINAL").unwrap_or_else(|| "x-terminal-emulator".into());
    Command::new(executable)
        .arg("--working-directory")
        .arg(directory)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("无法启动系统终端：{error}"))
}

/// Opens the native terminal at a validated working directory.
#[tauri::command]
pub fn open_in_system_terminal(path: String) -> Result<(), String> {
    open_terminal(&resolve_terminal_directory(&path)?)
}
