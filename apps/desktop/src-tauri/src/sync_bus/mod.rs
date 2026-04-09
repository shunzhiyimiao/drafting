pub mod bus;
pub mod bridge;
pub mod events;
pub mod types;

use std::sync::Arc;

use bus::{EventBus, InProcessBus};
use events::SyncBusEvent;
use types::{EventEnvelope, Origin};

/// The Sync Bus: platform-level event bus for cross-subsystem communication.
///
/// All cross-subsystem coordination MUST go through this bus.
/// Subsystems are forbidden from directly importing each other's code.
///
/// Managed as Tauri state — access via `app.state::<SyncBus>()`.
pub struct SyncBus {
    inner: Arc<dyn EventBus>,
}

impl SyncBus {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(InProcessBus::new()),
        }
    }

    /// Publish an event to all subscribers.
    ///
    /// Subscribers should check `envelope.origin` and ignore events
    /// where origin equals their own subsystem name (cycle prevention).
    pub fn publish(&self, origin: Origin, event: SyncBusEvent) {
        self.inner.publish(origin, event);
    }

    /// Subscribe to all events on the bus.
    /// Returns a broadcast receiver.
    pub fn subscribe(&self) -> tokio::sync::broadcast::Receiver<EventEnvelope> {
        self.inner.subscribe()
    }
}
