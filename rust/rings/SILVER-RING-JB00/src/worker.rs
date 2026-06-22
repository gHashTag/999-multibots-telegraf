use std::sync::Arc;
use std::time::Duration;
use tokio_util::sync::CancellationToken;
use trios_mb_traits::job_queue::*;
use trios_mb_types::AppError;
use serde::{Deserialize, Serialize};

/// Spawn a background task with panic-aware supervision.
/// If the inner task panics, it is logged and restarted with exponential backoff.
fn spawn_traced<F, Fut>(
    desc: String,
    cancel: CancellationToken,
    factory: F,
) -> tokio::task::JoinHandle<()>
where
    F: Fn() -> Fut + Send + 'static,
    Fut: std::future::Future<Output = ()> + Send + 'static,
{
    tokio::spawn(async move {
        let mut consecutive_failures: u32 = 0;
        let mut last_failure: Option<std::time::Instant> = None;
        const MAX_CONSECUTIVE_FAILURES: u32 = 10;
        const BASE_BACKOFF_SECS: u64 = 5;
        const MAX_BACKOFF_SECS: u64 = 60;
        const FAILURE_RESET_SECS: u64 = 300; // 5 minutes of healthy uptime resets the streak

        loop {
            // Time-decay reset: transient panics spread across hours/days should not
            // permanently accumulate to the fatal limit. Following Erlang/Akka pattern
            // (intensity within a period) rather than a monotonic counter.
            let now = std::time::Instant::now();
            if last_failure.map_or(false, |t| now.duration_since(t).as_secs() >= FAILURE_RESET_SECS) {
                consecutive_failures = 0;
            }

            // Catch synchronous panics in the factory closure itself before spawning.
            // tokio::spawn only catches panics inside the future; a panic in the closure
            // that builds the future would abort the supervisor thread.
            let fut = match std::panic::catch_unwind(std::panic::AssertUnwindSafe(||
                factory()
            )) {
                Ok(f) => f,
                Err(_) => {
                    consecutive_failures += 1;
                    last_failure = Some(now);
                    if consecutive_failures >= MAX_CONSECUTIVE_FAILURES {
                        tracing::error!(
                            worker = %desc,
                            failures = consecutive_failures,
                            "Supervised worker exceeded max consecutive failures; giving up"
                        );
                        break;
                    }
                    let backoff = std::cmp::min(
                        BASE_BACKOFF_SECS * 2_u64.pow(consecutive_failures.min(4)),
                        MAX_BACKOFF_SECS,
                    );
                    tracing::error!(
                        worker = %desc,
                        failures = consecutive_failures,
                        backoff_secs = backoff,
                        "Supervised worker factory panicked; restarting with backoff"
                    );
                    tokio::time::sleep(Duration::from_secs(backoff)).await;
                    continue;
                }
            };

            let mut task = tokio::spawn(fut);
            tokio::select! {
                biased;
                _ = cancel.cancelled() => {
                    task.abort();
                    tracing::info!(worker = %desc, "Supervised worker shutting down gracefully");
                    break;
                }
                result = &mut task => {
                    match result {
                        Ok(()) => {
                            tracing::info!(worker = %desc, "Supervised worker completed normally");
                            break;
                        }
                        Err(_) => {
                            consecutive_failures += 1;
                            last_failure = Some(now);
                            if consecutive_failures >= MAX_CONSECUTIVE_FAILURES {
                                tracing::error!(
                                    worker = %desc,
                                    failures = consecutive_failures,
                                    "Supervised worker exceeded max consecutive failures; giving up"
                                );
                                break;
                            }
                            let backoff = std::cmp::min(
                                BASE_BACKOFF_SECS * 2_u64.pow(consecutive_failures.min(4)),
                                MAX_BACKOFF_SECS,
                            );
                            tracing::error!(
                                worker = %desc,
                                failures = consecutive_failures,
                                backoff_secs = backoff,
                                "Supervised worker panicked; restarting with backoff"
                            );
                            tokio::time::sleep(Duration::from_secs(backoff)).await;
                        }
                    }
                }
            }
        }
    })
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum JobType {
    ModelTraining,
    ImageRendering,
    VideoRendering,
    LipSyncRendering,
    FaceSwapRendering,
    MorphingRendering,
    Upscaling,
    VoiceCloning,
    Scraping,
}

impl JobType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::ModelTraining => "model_training",
            Self::ImageRendering => "image_rendering",
            Self::VideoRendering => "video_rendering",
            Self::LipSyncRendering => "lipsync_rendering",
            Self::FaceSwapRendering => "faceswap_rendering",
            Self::MorphingRendering => "morphing_rendering",
            Self::Upscaling => "upscaling",
            Self::VoiceCloning => "voice_cloning",
            Self::Scraping => "scraping",
        }
    }

    pub fn all_types() -> &'static [JobType] {
        &[
            Self::ModelTraining,
            Self::ImageRendering,
            Self::VideoRendering,
            Self::LipSyncRendering,
            Self::FaceSwapRendering,
            Self::MorphingRendering,
            Self::Upscaling,
            Self::VoiceCloning,
            Self::Scraping,
        ]
    }

    pub fn concurrency_limit(&self) -> usize {
        match self {
            Self::ModelTraining => 2,
            Self::VideoRendering => 3,
            Self::LipSyncRendering => 2,
            Self::ImageRendering => 5,
            _ => 3,
        }
    }

    pub fn timeout_secs(&self) -> u64 {
        match self {
            Self::ModelTraining => 7200,
            Self::VideoRendering => 3600,
            Self::LipSyncRendering => 1800,
            _ => 600,
        }
    }
}

pub type JobHandler = Box<
    dyn Fn(Job) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), AppError>> + Send>>
        + Send
        + Sync,
>;

struct WorkerSpec {
    job_type: JobType,
    concurrency: usize,
    handler: Arc<JobHandler>,
}

pub struct WorkerPool {
    queue: Arc<dyn JobQueue>,
    cancel_token: CancellationToken,
    handlers: Vec<WorkerSpec>,
}

impl WorkerPool {
    #[tracing::instrument(skip_all)]
    pub fn new(queue: Arc<dyn JobQueue>) -> Self {
        Self {
            queue,
            cancel_token: CancellationToken::new(),
            handlers: Vec::new(),
        }
    }

    #[tracing::instrument(skip_all, fields(job_type = %job_type.as_str()))]
    pub fn register(&mut self, job_type: JobType, _handler: JobHandler) {
        let concurrency = job_type.concurrency_limit();
        self.handlers.push(WorkerSpec {
            job_type,
            concurrency,
            handler: Arc::new(_handler),
        });
    }

    #[tracing::instrument(skip_all, fields(handlers = self.handlers.len()))]
    pub fn spawn(self: &Arc<Self>) {
        for spec in &self.handlers {
            let type_str = spec.job_type.as_str();
            let type_strs: Vec<&str> = vec![type_str];
            let queue = self.queue.clone();
            let handler = spec.handler.clone();
            let cancel = self.cancel_token.clone();
            let concurrency = spec.concurrency;
            let timeout = Duration::from_secs(spec.job_type.timeout_secs());

            for worker_id in 0..concurrency {
                let q = queue.clone();
                let h = handler.clone();
                let c = cancel.clone();
                let cancel = cancel.clone();
                let types = type_strs.clone();
                let name = format!("worker-{}-{}", type_str, worker_id);

                spawn_traced(name, c, move || {
                    let q = q.clone();
                    let h = h.clone();
                    let types = types.clone();
                    let timeout = timeout;
                    let name = format!("worker-{}-{}", type_str, worker_id);
                    let cancel = cancel.clone();
                    async move {
                        loop {
                            tokio::time::sleep(Duration::from_millis(500)).await;
                            let q2 = q.clone();
                            let h2 = h.clone();
                            let types2 = types.clone();
                            let name2 = name.clone();
                            let timeout2 = timeout;
                            let c2 = cancel.clone();
                            let handle = tokio::spawn(async move {
                                poll_and_execute(&q2, &types2, &h2, timeout2, &name2, c2).await
                            });
                            match handle.await {
                                Ok(Err(e)) => {
                                    tracing::error!(worker = %name, error = %e, "Worker error");
                                }
                                Err(e) => {
                                    tracing::error!(worker = %name, error = %e, "Worker panicked; restarting");
                                }
                                Ok(Ok(())) => {}
                            }
                        }
                    }
                });
            }
        }

        tracing::info!(handlers = self.handlers.len(), "Worker pool spawned");
    }

    #[tracing::instrument(skip_all)]
    pub fn shutdown(&self) {
        self.cancel_token.cancel();
    }
}

const QUEUE_IO_TIMEOUT: Duration = Duration::from_secs(30);

#[tracing::instrument(skip(queue, job_types, handler, cancel), fields(worker_name = %worker_name))]
async fn poll_and_execute(
    queue: &Arc<dyn JobQueue>,
    job_types: &[&str],
    handler: &Arc<JobHandler>,
    timeout: Duration,
    worker_name: &str,
    cancel: CancellationToken,
) -> Result<(), AppError> {
    let job = match tokio::time::timeout(QUEUE_IO_TIMEOUT, queue.dequeue(job_types)).await {
        Ok(Ok(job)) => job,
        Ok(Err(e)) => {
            tracing::error!(error = %e, "dequeue failed");
            return Ok(());
        }
        Err(_) => {
            tracing::warn!("dequeue timed out after {}s", QUEUE_IO_TIMEOUT.as_secs());
            return Ok(());
        }
    };
    let job = match job {
        Some(j) => j,
        None => return Ok(()),
    };

    let job_id = job.id;
    let job_type = job.job_type.clone();
    tracing::info!(
        worker = worker_name,
        job_id = %job_id,
        job_type = %job_type,
        attempt = job.attempts,
        "Processing job"
    );

    // Spawn handler as a separate task so panics are caught by Tokio and returned as JoinError.
    // Directly awaiting a future that panics would unwind through the worker loop and abort the task.
    let mut task = tokio::spawn(handler(job));
    let join_result = tokio::select! {
        r = &mut task => Some(r),
        _ = cancel.cancelled() => {
            task.abort();
            tracing::warn!(worker = worker_name, job_id = %job_id, "Job aborted due to shutdown signal");
            None
        }
        _ = tokio::time::sleep(timeout) => {
            task.abort();
            None
        }
    };

    match join_result {
        Some(Ok(Ok(()))) => {
            if let Err(e) = tokio::time::timeout(QUEUE_IO_TIMEOUT, queue.update_status(job_id, JobStatus::Completed, None)).await {
                tracing::error!(error = %e, job_id = %job_id, "Failed to mark job completed (timeout)");
            }
            tracing::info!(worker = worker_name, job_id = %job_id, "Job completed");
        }
        Some(Ok(Err(e))) => {
            let err_raw = e.to_string();
            let err_str = trios_mb_types::truncate_for_log(&err_raw, 1024);
            let status = match tokio::time::timeout(QUEUE_IO_TIMEOUT, queue.get(job_id)).await {
                Ok(Ok(Some(j))) => {
                    if j.attempts >= j.max_attempts {
                        tracing::error!(
                            worker = worker_name,
                            job_id = %job_id,
                            attempts = j.attempts,
                            "Job failed permanently"
                        );
                        JobStatus::Failed
                    } else {
                        tracing::warn!(
                            worker = worker_name,
                            job_id = %job_id,
                            attempt = j.attempts,
                            "Job failed, will retry"
                        );
                        JobStatus::Queued
                    }
                }
                Ok(Ok(None)) => {
                    tracing::warn!(job_id = %job_id, "Job not found in queue for retry decision; defaulting to Queued");
                    JobStatus::Queued
                }
                Ok(Err(e)) => {
                    tracing::error!(error = %e, job_id = %job_id, "Failed to get job for retry decision; defaulting to Queued");
                    JobStatus::Queued
                }
                Err(_) => {
                    tracing::warn!(job_id = %job_id, "get job timed out; defaulting to Queued");
                    JobStatus::Queued
                }
            };
            if let Err(e) = tokio::time::timeout(QUEUE_IO_TIMEOUT, queue.update_status(job_id, status, Some(&err_str))).await {
                tracing::error!(error = %e, job_id = %job_id, "Failed to update job status after failure (timeout)");
            }
        }
        Some(Err(join_err)) => {
            let panic_info = if join_err.is_panic() {
                "handler panicked"
            } else {
                "handler cancelled"
            };
            tracing::error!(worker = worker_name, job_id = %job_id, %panic_info, "Job handler crashed");
            if let Err(e) = tokio::time::timeout(QUEUE_IO_TIMEOUT, queue.update_status(job_id, JobStatus::Failed, Some(panic_info))).await {
                tracing::error!(error = %e, job_id = %job_id, "Failed to mark job failed after handler crash");
            }
        }
        None => {
            let reason = if cancel.is_cancelled() { "shutdown" } else { "timeout" };
            if let Err(e) = tokio::time::timeout(QUEUE_IO_TIMEOUT, queue.update_status(job_id, JobStatus::Queued, Some(reason))).await {
                tracing::error!(error = %e, job_id = %job_id, "Failed to mark job {} (timeout)", reason);
            }
            tracing::warn!(
                worker = worker_name,
                job_id = %job_id,
                "Job {}, will retry",
                reason
            );
        }
    }

    Ok(())
}

#[tracing::instrument(skip(queue, cancel), fields(interval_ms = interval.as_millis()))]
pub async fn run_retry_maintenance(
    queue: Arc<dyn JobQueue>,
    interval: Duration,
    cancel: CancellationToken,
) {
    loop {
        tokio::select! {
            _ = cancel.cancelled() => break,
            _ = tokio::time::sleep(interval) => {
                // Threshold must exceed the longest legitimate job timeout by a safety margin.
                // This prevents a race where retry_stuck flags a job as stuck before the worker's
                // own abort timer fires, which would cause duplicate execution.
                const STUCK_JOB_MARGIN_SECS: u64 = 300;
                let max_timeout = JobType::all_types()
                    .iter()
                    .map(|t| t.timeout_secs())
                    .max()
                    .unwrap_or(7200);
                let stuck_threshold = max_timeout + STUCK_JOB_MARGIN_SECS;
                match tokio::time::timeout(QUEUE_IO_TIMEOUT, queue.retry_stuck(stuck_threshold)).await {
                    Ok(Ok(count)) if count > 0 => {
                        tracing::info!(retried = count, "Retry maintenance: reset stuck jobs");
                    }
                    Ok(Ok(_)) => {}
                    Ok(Err(e)) => {
                        tracing::error!(error = %e, "Retry maintenance failed");
                    }
                    Err(_) => {
                        tracing::warn!("Retry maintenance timed out after {}s", QUEUE_IO_TIMEOUT.as_secs());
                    }
                }
            }
        }
    }
}
