use std::path::{Path, PathBuf};
use std::process::Command;

fn validate_preview_url(url: &str) -> Result<&str, String> {
    let authority = url
        .strip_prefix("http://127.0.0.1:")
        .ok_or_else(|| "只能在浏览器中打开 Berth 本地预览地址".to_string())?;
    let port = authority
        .strip_suffix('/')
        .ok_or_else(|| "本地预览地址格式无效".to_string())?;
    let port = port
        .parse::<u16>()
        .map_err(|_| "本地预览端口无效".to_string())?;
    if port == 0 {
        return Err("本地预览端口无效".to_string());
    }
    Ok(url)
}

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

/// 校验工作目录后，在系统终端中打开该路径。
#[tauri::command]
pub fn open_in_system_terminal(path: String) -> Result<(), String> {
    open_terminal(&resolve_terminal_directory(&path)?)
}

#[cfg(target_os = "macos")]
fn open_system_browser(url: &str) -> Result<(), String> {
    Command::new("open")
        .arg(url)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("无法启动默认浏览器：{error}"))
}

#[cfg(target_os = "windows")]
fn open_system_browser(url: &str) -> Result<(), String> {
    Command::new("cmd")
        .args(["/C", "start", "", url])
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("无法启动默认浏览器：{error}"))
}

#[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
fn open_system_browser(url: &str) -> Result<(), String> {
    Command::new("xdg-open")
        .arg(url)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("无法启动默认浏览器：{error}"))
}

/// 只允许打开 Berth 临时 HTML 服务生成的本机回环地址。
#[tauri::command]
pub fn open_preview_in_system_browser(url: String) -> Result<(), String> {
    open_system_browser(validate_preview_url(&url)?)
}

#[cfg(test)]
mod tests {
    use super::validate_preview_url;

    #[test]
    fn accepts_only_berth_loopback_preview_urls() {
        assert!(validate_preview_url("http://127.0.0.1:43123/").is_ok());
        assert!(validate_preview_url("https://example.com/").is_err());
        assert!(validate_preview_url("http://localhost:43123/").is_err());
        assert!(validate_preview_url("http://127.0.0.1:0/").is_err());
        assert!(validate_preview_url("http://127.0.0.1:43123/path").is_err());
    }
}
