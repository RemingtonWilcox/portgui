mod classifier;
mod commands;
mod display_name;
mod models;
mod persistence;
mod process_mgmt;
mod scanner;
mod state;

use persistence::Store;
use state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = app.path().app_data_dir().map_err(std::io::Error::other)?;
            let store = Store::new(&data_dir).map_err(std::io::Error::other)?;
            let state = AppState::new(store).map_err(std::io::Error::other)?;

            // Apply macOS vibrancy (frosted glass) for premium native feel
            #[cfg(target_os = "macos")]
            {
                use tauri::WebviewWindow;
                if let Some(window) = app.get_webview_window("main") {
                    use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};
                    let _ = apply_vibrancy(&window, NSVisualEffectMaterial::UnderWindowBackground, None, None);
                }
            }

            app.manage(state.clone());
            scanner::spawn_scanner(app.handle().clone(), state);
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            commands::hydrate_state,
            commands::kill_process,
            commands::restart_process,
            commands::reboot_service,
            commands::pin_process,
            commands::unpin_process,
            commands::hide_process,
            commands::unhide_process,
            commands::set_restart_command,
            commands::clear_history,
            commands::update_preferences,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
