mod command_environment;
mod commands;
mod terminal;

use commands::clipboard::ClipboardCacheRegistry;
use commands::preview::PreviewServerRegistry;
use tauri::Manager;
use terminal::TerminalRegistry;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(TerminalRegistry::default())
        .manage(PreviewServerRegistry::default())
        .manage(ClipboardCacheRegistry::default())
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
            commands::clipboard::read_system_file_clipboard,
            commands::clipboard::copy_local_path_to_system_clipboard,
            commands::files::list_directory,
            commands::files::search_files,
            commands::files::read_text_file,
            commands::files::write_text_file,
            commands::files::create_file,
            commands::files::copy_path,
            commands::files::rename_path,
            commands::files::move_to_trash,
            commands::files::reveal_in_finder,
            commands::preview::allow_preview_asset,
            commands::preview::start_html_preview,
            commands::preview::stop_html_preview,
            commands::ssh::list_ssh_sites,
            commands::ssh::list_sftp_directory,
            commands::ssh::read_sftp_text_file,
            commands::ssh::write_sftp_text_file,
            commands::ssh::upload_sftp_paths,
            commands::ssh::paste_local_path_to_sftp,
            commands::ssh::download_sftp_file,
            commands::ssh::download_sftp_entry,
            commands::ssh::copy_sftp_entry,
            commands::ssh::copy_sftp_entry_to_system_clipboard,
            commands::ssh::cache_sftp_file,
            commands::ssh::release_sftp_cache,
            commands::ssh::create_sftp_entry,
            commands::ssh::rename_sftp_entry,
            commands::ssh::delete_sftp_entry,
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
