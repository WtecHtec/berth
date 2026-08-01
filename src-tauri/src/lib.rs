mod command_environment;
mod commands;
mod terminal;

use commands::preview::PreviewServerRegistry;
use tauri::Manager;
use terminal::TerminalRegistry;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(TerminalRegistry::default())
        .manage(PreviewServerRegistry::default())
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                // 原生窗口关闭不保证 React cleanup 一定执行，因此在应用边界再次回收资源。
                let label = window.label();
                window.state::<TerminalRegistry>().terminate_window(label);
                window
                    .state::<PreviewServerRegistry>()
                    .terminate_window(label);
            }
        })
        .invoke_handler(tauri::generate_handler![
            command_environment::configure_command_environment,
            commands::ai_sessions::list_ai_sessions,
            commands::files::list_directory,
            commands::files::search_files,
            commands::files::read_text_file,
            commands::files::write_text_file,
            commands::files::create_file,
            commands::files::rename_path,
            commands::files::move_to_trash,
            commands::files::reveal_in_finder,
            commands::preview::allow_preview_asset,
            commands::preview::start_html_preview,
            commands::preview::stop_html_preview,
            commands::git::git_workspace_status,
            commands::git::git_ignored_paths,
            commands::git::git_file_diff,
            commands::git::git_stage,
            commands::git::git_unstage,
            commands::git::git_stage_all,
            commands::git::git_unstage_all,
            commands::system::open_in_system_terminal,
            commands::system::open_preview_in_system_browser,
            commands::window::create_app_window,
            terminal::spawn_terminal,
            terminal::write_to_terminal,
            terminal::resize_terminal,
            terminal::kill_terminal,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Berth");
}
