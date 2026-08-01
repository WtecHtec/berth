use std::{path::PathBuf, process::Command};

#[tauri::command]
pub fn git_diff(path: String) -> Result<String, String> {
    let file = PathBuf::from(&path);
    let working_directory = file.parent().unwrap_or(file.as_path());
    let output = Command::new("git")
        .arg("-C")
        .arg(working_directory)
        .arg("diff")
        .arg("--no-ext-diff")
        .arg("--")
        .arg(&file)
        .output()
        .map_err(|error| format!("无法运行 git diff：{error}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}
