use tauri::{AppHandle, WebviewWindowBuilder};
use uuid::Uuid;

/// 使用与主窗口一致的原生配置创建一个新的启动页窗口。
#[tauri::command]
pub async fn create_app_window(app: AppHandle) -> Result<(), String> {
    let mut config = app
        .config()
        .app
        .windows
        .first()
        .cloned()
        .ok_or_else(|| "缺少主窗口配置".to_string())?;
    config.label = format!("berth-{}", Uuid::new_v4());
    WebviewWindowBuilder::from_config(&app, &config)
        .map_err(|error| format!("无法创建窗口：{error}"))?
        .build()
        .map_err(|error| format!("无法创建窗口：{error}"))?;
    Ok(())
}
