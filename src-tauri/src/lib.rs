mod commands;
mod terminal;

use terminal::TerminalRegistry;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(TerminalRegistry::default())
        .invoke_handler(tauri::generate_handler![
            commands::files::list_directory,
            commands::files::search_files,
            commands::files::read_text_file,
            commands::files::write_text_file,
            commands::files::create_file,
            commands::files::rename_path,
            commands::files::move_to_trash,
            commands::files::reveal_in_finder,
            commands::git::git_diff,
            commands::system::open_in_system_terminal,
            commands::window::create_app_window,
            terminal::spawn_terminal,
            terminal::write_to_terminal,
            terminal::resize_terminal,
            terminal::kill_terminal,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Berth");
}
