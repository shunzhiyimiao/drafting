//! Establishment-phase retry policy (constraint 25): network errors retry
//! 3× with exponential backoff, 429 retries honoring Retry-After, 5xx
//! retries once, auth/input errors never retry.
//!
//! Scope: retries apply ONLY while opening the stream (before any token has
//! been delivered). A failure mid-stream is not retried — restarting after
//! partial output would duplicate text in the UI.
//!
//! The adapter error contract is a string (e.g. "anthropic 429 Too Many
//! Requests: … [retry-after:7]"), so classification parses the embedded
//! HTTP status. The classifier tests pin that format — if an adapter's
//! error wording changes, they fail loudly.

use std::time::Duration;

/// Longest we're willing to honor a server's Retry-After during stream
/// establishment — the caller is awaiting, and this sleep is not cancellable.
const MAX_RETRY_AFTER: Duration = Duration::from_secs(30);

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RetryClass {
    /// Auth / input / other 4xx — retrying cannot help.
    Fatal,
    /// 5xx server error — one retry.
    RetryOnce,
    /// Network failure or 429 — up to 3 retries with exponential backoff,
    /// or the server-provided Retry-After when present.
    Backoff { retry_after: Option<Duration> },
}

/// Classify an establishment error string from an adapter.
pub fn classify(error: &str) -> RetryClass {
    // Local configuration errors (raised before any HTTP happens) — these
    // exact prefixes come from ProviderContext::build_headers.
    if error.starts_with("API key required") || error.starts_with("invalid ") {
        return RetryClass::Fatal;
    }
    // First 400..=599 token is the HTTP status ("anthropic 429 Too Many…").
    if let Some(status) = first_status_token(error) {
        return match status {
            429 => RetryClass::Backoff {
                retry_after: parse_retry_after(error),
            },
            500..=599 => RetryClass::RetryOnce,
            _ => RetryClass::Fatal,
        };
    }
    // No status ⇒ the request never got an HTTP answer (DNS/connect/reset) —
    // the classic transient class.
    RetryClass::Backoff { retry_after: None }
}

/// Delay before retry number `attempt` (0-based count of retries already
/// made), or None when the policy says give up.
pub fn next_delay(class: &RetryClass, attempt: u32) -> Option<Duration> {
    match class {
        RetryClass::Fatal => None,
        RetryClass::RetryOnce => (attempt == 0).then(|| Duration::from_millis(500)),
        RetryClass::Backoff { retry_after } => {
            if attempt >= 3 {
                return None;
            }
            Some(match retry_after {
                Some(ra) => (*ra).min(MAX_RETRY_AFTER),
                // 250ms → 500ms → 1s
                None => Duration::from_millis(250 << attempt),
            })
        }
    }
}

fn first_status_token(error: &str) -> Option<u16> {
    error
        .split(|c: char| !c.is_ascii_digit())
        .filter(|t| t.len() == 3)
        .filter_map(|t| t.parse::<u16>().ok())
        .find(|n| (400..=599).contains(n))
}

/// Extract the "[retry-after:N]" tag an adapter appends from the response
/// header. Only the delta-seconds form is honored; HTTP-date values are
/// ignored (fall back to backoff).
fn parse_retry_after(error: &str) -> Option<Duration> {
    let start = error.find("[retry-after:")? + "[retry-after:".len();
    let rest = &error[start..];
    let digits: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
    if digits.is_empty() {
        return None;
    }
    digits.parse::<u64>().ok().map(Duration::from_secs)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classify_pins_the_adapter_error_formats() {
        // 429 with and without Retry-After.
        assert_eq!(
            classify("anthropic 429 Too Many Requests: slow down [retry-after:7]"),
            RetryClass::Backoff {
                retry_after: Some(Duration::from_secs(7))
            }
        );
        assert_eq!(
            classify("openai 429 Too Many Requests: slow down"),
            RetryClass::Backoff { retry_after: None }
        );
        // 5xx → retry once.
        assert_eq!(
            classify("openai 500 Internal Server Error: boom"),
            RetryClass::RetryOnce
        );
        assert_eq!(classify("ollama 503 Service Unavailable: "), RetryClass::RetryOnce);
        // Auth / client errors → fatal.
        assert_eq!(classify("anthropic 401 Unauthorized: bad key"), RetryClass::Fatal);
        assert_eq!(classify("openai 400 Bad Request: schema"), RetryClass::Fatal);
        // Local config errors → fatal (no pointless network retries).
        assert_eq!(classify("API key required (Bearer)"), RetryClass::Fatal);
        assert_eq!(classify("invalid header name 'x y': ..."), RetryClass::Fatal);
        // No HTTP status at all → transient network.
        assert_eq!(
            classify("anthropic request failed: error sending request: connection refused"),
            RetryClass::Backoff { retry_after: None }
        );
    }

    #[test]
    fn status_detection_ignores_incidental_numbers() {
        // A 3-digit number inside the body that isn't 4xx/5xx must not match,
        // and the status wins even with numbers after it.
        assert_eq!(classify("openai 200 but stream broke mid-way"), {
            RetryClass::Backoff { retry_after: None }
        });
        assert_eq!(
            classify("anthropic 429 Too Many Requests: quota 1000 rpm"),
            RetryClass::Backoff { retry_after: None }
        );
    }

    #[test]
    fn next_delay_schedules_match_constraint_25() {
        let net = RetryClass::Backoff { retry_after: None };
        assert_eq!(next_delay(&net, 0), Some(Duration::from_millis(250)));
        assert_eq!(next_delay(&net, 1), Some(Duration::from_millis(500)));
        assert_eq!(next_delay(&net, 2), Some(Duration::from_millis(1000)));
        assert_eq!(next_delay(&net, 3), None, "3 retries max");

        let limited = RetryClass::Backoff {
            retry_after: Some(Duration::from_secs(7)),
        };
        assert_eq!(next_delay(&limited, 0), Some(Duration::from_secs(7)));

        // Retry-After is capped so an establishment await can't hang forever.
        let hostile = RetryClass::Backoff {
            retry_after: Some(Duration::from_secs(3600)),
        };
        assert_eq!(next_delay(&hostile, 0), Some(Duration::from_secs(30)));

        assert_eq!(next_delay(&RetryClass::RetryOnce, 0), Some(Duration::from_millis(500)));
        assert_eq!(next_delay(&RetryClass::RetryOnce, 1), None, "5xx retries once");

        assert_eq!(next_delay(&RetryClass::Fatal, 0), None);
    }
}
