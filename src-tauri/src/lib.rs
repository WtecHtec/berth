mod commands;
mod terminal;

use commands::preview::PreviewServerRegistry;
use terminal::TerminalRegistry;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(TerminalRegistry::default())
        .manage(PreviewServerRegistry::default())
        .invoke_handler(tauri::generate_handler![
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
            commands::git::git_diff,
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
