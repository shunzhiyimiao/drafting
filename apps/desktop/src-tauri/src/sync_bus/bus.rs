use tokio::sync::broadcast;

use super::events::SyncBusEvent;
use super::types::{EventEnvelope, Origin};

const CHANNEL_CAPACITY: usize = 256;

/// Abstraction trait for the event bus.
/// v1 uses in-process tokio broadcast; the trait exists so the backend
/// can be swapped to cross-process or persistent without changing callers.
pub trait EventBus: Send + Sync + 'static {
    fn publish(&self, origin: Origin, event: SyncBusEvent);
    fn subscribe(&self) -> broadcast::Receiver<EventEnvelope>;
}

/// In-process implementation based on tokio broadcast channel.
pub struct InProcessBus {
    sender: broadcast::Sender<EventEnvelope>,
}

impl InProcessBus {
    pub fn new() -> Self {
        let (sender, _) = broadcast::channel(CHANNEL_CAPACITY);
        Self { sender }
    }
}

impl EventBus for InProcessBus {
    fn publish(&self, origin: Origin, event: SyncBusEvent) {
        let envelope = EventEnvelope::new(origin, event);

        #[cfg(debug_assertions)]
        log::debug!(
            "SyncBus publish: origin={}, domain={:?}",
            envelope.origin,
            std::mem::discriminant(&envelope.payload)
        );

        // send returns Err only when there are no receivers — that's fine
        let _ = self.sender.send(envelope);
    }

    fn subscribe(&self) -> broadcast::Receiver<EventEnvelope> {
        self.sender.subscribe()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sync_bus::events::{HeadquartersEvent, SyncBusEvent};

    #[tokio::test]
    async fn publish_and_receive() {
        let bus = InProcessBus::new();
        let mut rx = bus.subscribe();

        let origin = Origin::new("test");
        let event = SyncBusEvent::Headquarters(HeadquartersEvent::RefreshRequested);
        bus.publish(origin.clone(), event);

        let envelope = rx.recv().await.expect("should receive event");
        assert_eq!(envelope.origin, origin);
        assert!(envelope.timestamp > 0);
        match envelope.payload {
            SyncBusEvent::Headquarters(HeadquartersEvent::RefreshRequested) => {}
            _ => panic!("unexpected event variant"),
        }
    }

    #[tokio::test]
    async fn multiple_subscribers() {
        let bus = InProcessBus::new();
        let mut rx1 = bus.subscribe();
        let mut rx2 = bus.subscribe();

        let event = SyncBusEvent::Headquarters(HeadquartersEvent::SuggestionChanged {
            level: 1,
            message: "test".to_string(),
        });
        bus.publish(Origin::new("test"), event);

        let e1 = rx1.recv().await.expect("rx1 should receive");
        let e2 = rx2.recv().await.expect("rx2 should receive");
        assert_eq!(e1.origin, e2.origin);
    }

    #[tokio::test]
    async fn origin_preserved_for_cycle_prevention() {
        let bus = InProcessBus::new();
        let mut rx = bus.subscribe();

        let origin = Origin::new("blueprint");
        bus.publish(
            origin.clone(),
            SyncBusEvent::Blueprint(crate::sync_bus::events::BlueprintEvent::IndexChanged),
        );

        let envelope = rx.recv().await.unwrap();
        // Subscribers should check: if envelope.origin == my_origin, skip
        assert_eq!(envelope.origin, Origin::new("blueprint"));
    }

    #[test]
    fn event_serializes_to_tagged_json() {
        let event = SyncBusEvent::Git(crate::sync_bus::events::GitEvent::BranchCheckedOut {
            from: "main".to_string(),
            to: "feature".to_string(),
        });
        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("\"domain\":\"Git\""));
        assert!(json.contains("\"type\":\"BranchCheckedOut\""));
    }

    #[test]
    fn envelope_serializes_correctly() {
        let envelope = EventEnvelope::new(
            Origin::new("test"),
            SyncBusEvent::Headquarters(HeadquartersEvent::RefreshRequested),
        );
        let json = serde_json::to_string(&envelope).unwrap();
        assert!(json.contains("\"origin\""));
        assert!(json.contains("\"timestamp\""));
        assert!(json.contains("\"payload\""));
    }
}
