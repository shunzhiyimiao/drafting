//! Stream lifecycle management:
//!   - global concurrency limit (5)
//!   - cancellation by stream_id
//!   - per-stream "no output for N seconds" timeout
//!
//! Adapters return a stream of `StreamEvent`. The manager wraps that stream,
//! enforces the limits, forwards events to a sink, and emits a terminal event.

use std::collections::HashMap;
use std::sync::Arc;

use futures_util::stream::{BoxStream, StreamExt};
use tokio::sync::{Mutex, Semaphore};
use tokio::time::{timeout, Duration};

use super::types::StreamEvent;

const GLOBAL_CONCURRENCY: usize = 5;
const NO_OUTPUT_TIMEOUT: Duration = Duration::from_secs(300); // 5 minutes

pub struct StreamManager {
    permits: Arc<Semaphore>,
    cancellers: Arc<Mutex<HashMap<String, tokio::sync::watch::Sender<bool>>>>,
}

impl StreamManager {
    pub fn new() -> Self {
        Self {
            permits: Arc::new(Semaphore::new(GLOBAL_CONCURRENCY)),
            cancellers: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Register a cancel signal for a stream and return its receiver.
    async fn register(&self, stream_id: &str) -> tokio::sync::watch::Receiver<bool> {
        let (tx, rx) = tokio::sync::watch::channel(false);
        let mut map = self.cancellers.lock().await;
        map.insert(stream_id.to_string(), tx);
        rx
    }

    async fn unregister(&self, stream_id: &str) {
        let mut map = self.cancellers.lock().await;
        map.remove(stream_id);
    }

    /// Request cancellation. Returns whether the stream existed.
    pub async fn cancel(&self, stream_id: &str) -> bool {
        let map = self.cancellers.lock().await;
        if let Some(tx) = map.get(stream_id) {
            let _ = tx.send(true);
            true
        } else {
            false
        }
    }

    /// Drive `inner` to completion, calling `on_event` for every event. Enforces
    /// concurrency, cancellation, and idle-timeout. Always emits exactly one
    /// terminal event (Completed/Cancelled/Failed) at the end.
    pub async fn run<F>(
        self: Arc<Self>,
        stream_id: String,
        inner: BoxStream<'static, StreamEvent>,
        mut on_event: F,
    ) where
        F: FnMut(StreamEvent) + Send + 'static,
    {
        let permit = match self.permits.clone().acquire_owned().await {
            Ok(p) => p,
            Err(_) => {
                on_event(StreamEvent::Failed {
                    stream_id,
                    error: "stream manager closed".into(),
                });
                return;
            }
        };

        let mut cancel_rx = self.register(&stream_id).await;
        let mut inner = inner;
        let mut terminated = false;

        loop {
            tokio::select! {
                biased;
                changed = cancel_rx.changed() => {
                    if changed.is_ok() && *cancel_rx.borrow() {
                        on_event(StreamEvent::Cancelled { stream_id: stream_id.clone() });
                        terminated = true;
                        break;
                    }
                }
                next = timeout(NO_OUTPUT_TIMEOUT, inner.next()) => {
                    match next {
                        Ok(Some(ev)) => {
                            let is_terminal = matches!(
                                ev,
                                StreamEvent::Completed { .. }
                                    | StreamEvent::Failed { .. }
                                    | StreamEvent::Cancelled { .. }
                            );
                            on_event(ev);
                            if is_terminal {
                                terminated = true;
                                break;
                            }
                        }
                        Ok(None) => {
                            // Stream ended without a terminal event — synthesize one.
                            on_event(StreamEvent::Completed {
                                stream_id: stream_id.clone(),
                                input_tokens: 0,
                                output_tokens: 0,
                            });
                            terminated = true;
                            break;
                        }
                        Err(_) => {
                            on_event(StreamEvent::Failed {
                                stream_id: stream_id.clone(),
                                error: "no output for 5 minutes".into(),
                            });
                            terminated = true;
                            break;
                        }
                    }
                }
            }
        }

        let _ = terminated;
        self.unregister(&stream_id).await;
        drop(permit);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use futures_util::stream::StreamExt;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    fn fake_delta_stream(stream_id: String, count: usize) -> BoxStream<'static, StreamEvent> {
        let s = async_stream::stream! {
            for i in 0..count {
                yield StreamEvent::Delta {
                    stream_id: stream_id.clone(),
                    text: format!("token{i} "),
                };
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
            yield StreamEvent::Completed {
                stream_id: stream_id.clone(),
                input_tokens: 10,
                output_tokens: count as u64,
            };
        };
        s.boxed()
    }

    #[tokio::test]
    async fn run_emits_terminal_completed() {
        let mgr = Arc::new(StreamManager::new());
        let received = Arc::new(Mutex::new(Vec::<StreamEvent>::new()));
        let received_for_cb = received.clone();

        let s = fake_delta_stream("s1".into(), 3);
        mgr.run("s1".into(), s, move |ev| {
            let received = received_for_cb.clone();
            tokio::spawn(async move {
                received.lock().await.push(ev);
            });
        })
        .await;

        // Give the spawned tasks a moment to flush.
        tokio::time::sleep(Duration::from_millis(50)).await;
        let evs = received.lock().await;
        assert!(matches!(evs.last(), Some(StreamEvent::Completed { .. })));
    }

    #[tokio::test]
    async fn cancel_stops_stream() {
        let mgr = Arc::new(StreamManager::new());
        let count = Arc::new(AtomicUsize::new(0));
        let count_for_cb = count.clone();

        let s = async_stream::stream! {
            for i in 0..1000 {
                yield StreamEvent::Delta { stream_id: "s2".into(), text: format!("{i}") };
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
            yield StreamEvent::Completed { stream_id: "s2".into(), input_tokens: 0, output_tokens: 0 };
        };

        let mgr_clone = mgr.clone();
        let handle = tokio::spawn(async move {
            mgr_clone
                .run("s2".into(), s.boxed(), move |ev| {
                    if matches!(ev, StreamEvent::Delta { .. }) {
                        count_for_cb.fetch_add(1, Ordering::SeqCst);
                    }
                })
                .await;
        });

        tokio::time::sleep(Duration::from_millis(50)).await;
        let cancelled = mgr.cancel("s2").await;
        assert!(cancelled, "cancel should find the registered stream");

        handle.await.unwrap();
        let n = count.load(Ordering::SeqCst);
        assert!(n < 1000, "should have stopped early, got {n}");
    }
}
