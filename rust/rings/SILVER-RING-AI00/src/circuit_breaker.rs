use std::sync::atomic::{AtomicU32, AtomicBool, AtomicU64, Ordering};
use std::time::{Duration, Instant};

/// Sentinel value indicating no failure has been recorded.
const NO_FAILURE: u64 = u64::MAX;

pub struct CircuitBreaker {
    failure_count: AtomicU32,
    failure_threshold: u32,
    is_open: AtomicBool,
    /// Stores `Instant::elapsed().as_millis()` snapshot at the time of failure,
    /// or `NO_FAILURE` if no failure has been recorded.
    /// This avoids `std::sync::Mutex` in async contexts.
    last_failure_millis: AtomicU64,
    reset_timeout: Duration,
}

impl CircuitBreaker {
    pub fn new(failure_threshold: u32, reset_timeout: Duration) -> Self {
        Self {
            failure_count: AtomicU32::new(0),
            failure_threshold,
            is_open: AtomicBool::new(false),
            last_failure_millis: AtomicU64::new(NO_FAILURE),
            reset_timeout,
        }
    }

    fn now_millis() -> u64 {
        // Use a monotonic proxy: since we only compare deltas within the same process,
        // Instant::now().elapsed() from a fixed base is sufficient.
        // Simpler: just use Instant::now() comparison via storing the Instant itself is not Send,
        // so we store epoch millis from a once-initialized Instant base.
        static BASE: std::sync::OnceLock<Instant> = std::sync::OnceLock::new();
        let base = BASE.get_or_init(Instant::now);
        base.elapsed().as_millis() as u64
    }

    // Wave 151: use SeqCst ordering for failure count and open state to prevent
    // torn reads/writes under concurrent dispatch.
    pub fn allow_request(&self) -> bool {
        if !self.is_open.load(Ordering::SeqCst) {
            return true;
        }

        let last = self.last_failure_millis.load(Ordering::SeqCst);
        if last == NO_FAILURE {
            return true;
        }

        let elapsed = Self::now_millis().saturating_sub(last);
        if Duration::from_millis(elapsed) > self.reset_timeout {
            self.is_open.store(false, Ordering::SeqCst);
            self.failure_count.store(0, Ordering::SeqCst);
            return true;
        }
        false
    }

    pub fn record_success(&self) {
        self.failure_count.store(0, Ordering::SeqCst);
        self.is_open.store(false, Ordering::SeqCst);
    }

    pub fn record_failure(&self) {
        let count = self.failure_count.fetch_add(1, Ordering::SeqCst) + 1;
        if count >= self.failure_threshold {
            self.is_open.store(true, Ordering::SeqCst);
            self.last_failure_millis.store(Self::now_millis(), Ordering::SeqCst);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_requests_when_closed() {
        let cb = CircuitBreaker::new(3, Duration::from_secs(60));
        assert!(cb.allow_request());
        assert!(cb.allow_request());
    }

    #[test]
    fn opens_after_threshold_failures() {
        let cb = CircuitBreaker::new(3, Duration::from_secs(60));
        cb.record_failure();
        assert!(cb.allow_request());
        cb.record_failure();
        assert!(cb.allow_request());
        cb.record_failure();
        assert!(!cb.allow_request());
    }

    #[test]
    fn resets_on_success() {
        let cb = CircuitBreaker::new(3, Duration::from_secs(60));
        cb.record_failure();
        cb.record_failure();
        cb.record_failure();
        assert!(!cb.allow_request());
        cb.record_success();
        assert!(cb.allow_request());
        assert_eq!(cb.failure_count.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn allows_after_reset_timeout() {
        let cb = CircuitBreaker::new(2, Duration::from_millis(1));
        cb.record_failure();
        cb.record_failure();
        assert!(!cb.allow_request());
        std::thread::sleep(Duration::from_millis(5));
        assert!(cb.allow_request());
    }

    #[test]
    fn success_resets_failure_count() {
        let cb = CircuitBreaker::new(3, Duration::from_secs(60));
        cb.record_failure();
        cb.record_failure();
        cb.record_success();
        cb.record_failure();
        assert!(cb.allow_request());
    }
}
