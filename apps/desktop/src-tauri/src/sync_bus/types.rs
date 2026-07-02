use serde::{Deserialize, Serialize};
use std::fmt;
use std::time::{SystemTime, UNIX_EPOCH};

/// Every event carries an origin to prevent cycles.
/// Subscribers ignore events where origin equals themselves.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Origin(pub String);

impl Origin {
    pub fn new(subsystem: &str) -> Self {
        Origin(subsystem.to_string())
    }
}

impl fmt::Display for Origin {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// Wrapper around every event published through the bus.
/// Carries origin (for cycle prevention), timestamp, and the event payload.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventEnvelope {
    pub origin: Origin,
    pub timestamp: u64,
    pub payload: super::events::SyncBusEvent,
}

impl EventEnvelope {
    pub fn new(origin: Origin, payload: super::events::SyncBusEvent) -> Self {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;
        Self {
            origin,
            timestamp,
            payload,
        }
    }

    /// The constraint-17 guard: a subscriber that also publishes must skip
    /// envelopes it published itself (`if env.is_from(&my_origin) { continue }`)
    /// so no event can loop back into its own producer.
    pub fn is_from(&self, origin: &Origin) -> bool {
        self.origin == *origin
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sync_bus::events::{BlueprintEvent, SyncBusEvent};

    #[test]
    fn is_from_matches_only_the_publishing_origin() {
        let env = EventEnvelope::new(
            Origin::new("estimator"),
            SyncBusEvent::Blueprint(BlueprintEvent::IndexChanged),
        );
        assert!(env.is_from(&Origin::new("estimator")));
        assert!(!env.is_from(&Origin::new("blueprint")));
    }
}
