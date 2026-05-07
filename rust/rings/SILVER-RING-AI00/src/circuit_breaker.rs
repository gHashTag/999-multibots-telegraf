use std::sync::atomic::{AtomicU32, AtomicBool, Ordering};
use std::time::{Duration, Instant};

pub struct CircuitBreaker {
    failure_count: AtomicU32,
    failure_threshold: u32,
    is_open: AtomicBool,
    last_failure: std::sync::Mutex<Option<Instant>>,
    reset_timeout: Duration,
}

impl CircuitBreaker {
    pub fn new(failure_threshold: u32, reset_timeout: Duration) -> Self {
        Self {
            failure_count: AtomicU32::new(0),
            failure_threshold,
            is_open: AtomicBool::new(false),
            last_failure: std::sync::Mutex::new(None),
            reset_timeout,
        }
    }

    pub fn allow_request(&self) -> bool {
        if !self.is_open.load(Ordering::Relaxed) {
            return true;
        }

        let last = self.last_failure.lock().unwrap();
        if let Some(time) = *last {
            if time.elapsed() > self.reset_timeout {
                self.is_open.store(false, Ordering::Relaxed);
                self.failure_count.store(0, Ordering::Relaxed);
                return true;
            }
        }
        false
    }

    pub fn record_success(&self) {
        self.failure_count.store(0, Ordering::Relaxed);
        self.is_open.store(false, Ordering::Relaxed);
    }

    pub fn record_failure(&self) {
        let count = self.failure_count.fetch_add(1, Ordering::Relaxed) + 1;
        if count >= self.failure_threshold {
            self.is_open.store(true, Ordering::Relaxed);
            let mut last = self.last_failure.lock().unwrap();
            *last = Some(Instant::now());
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
        assert_eq!(cb.failure_count.load(Ordering::Relaxed), 0);
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
