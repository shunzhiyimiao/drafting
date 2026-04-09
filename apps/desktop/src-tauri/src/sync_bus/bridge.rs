use tauri::{AppHandle, Emitter};

use super::SyncBus;

/// Starts a background task that forwards all Sync Bus events
/// to the Tauri frontend event system as "sync-bus-event".
///
/// The frontend uses `listen("sync-bus-event", callback)` from
/// `@tauri-apps/api/event` to receive these events.
pub fn start_bridge(app_handle: AppHandle, sync_bus: &SyncBus) {
    let mut receiver = sync_bus.subscribe();
    let handle = app_handle.clone();

    tauri::async_runtime::spawn(async move {
        loop {
            match receiver.recv().await {
                Ok(envelope) => {
                    let _ = handle.emit("sync-bus-event", &envelope);
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                    log::warn!("SyncBus bridge lagged by {} events", n);
                }
                Err(tokio::sync::broadcast::error::RecvError::Closed) => {
                    log::info!("SyncBus bridge: channel closed, stopping");
                    break;
                }
            }
        }
    });
}
