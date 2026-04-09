mod sync_bus;
mod patchboard;
mod blueprint;
mod atlas;
mod git;
mod terminal;
mod lsp;
mod codegen_proxy;

use tauri::Manager;
use sync_bus::SyncBus;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    let sync_bus = SyncBus::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(sync_bus)
        .setup(|app| {
            let handle = app.handle().clone();
            let bus = app.state::<SyncBus>();
            sync_bus::bridge::start_bridge(handle, &bus);
            log::info!("SyncBus initialized and bridge started");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
