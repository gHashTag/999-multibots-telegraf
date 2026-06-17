use std::sync::Arc;
use std::time::Duration;
use tokio_util::sync::CancellationToken;
use trios_mb_traits::job_queue::*;
use trios_mb_types::AppError;
use serde::{Deserialize, Serialize};

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
    pub fn new(queue: Arc<dyn JobQueue>) -> Self {
        Self {
            queue,
            cancel_token: CancellationToken::new(),
            handlers: Vec::new(),
        }
    }

    pub fn register(&mut self, job_type: JobType, handler: JobHandler) {
        let concurrency = job_type.concurrency_limit();
        self.handlers.push(WorkerSpec {
            job_type,
            concurrency,
            handler: Arc::new(handler),
        });
    }

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
                let types = type_strs.clone();
                let name = format!("worker-{}-{}", type_str, worker_id);

                tokio::spawn(async move {
                    tracing::info!(worker = %name, "Worker started");
                    loop {
                        tokio::select! {
                            _ = c.cancelled() => {
                                tracing::info!(worker = %name, "Worker shutting down");
                                break;
                            }
                            _ = tokio::time::sleep(Duration::from_millis(500)) => {
                                let q2 = q.clone();
                                let h2 = h.clone();
                                let types2 = types.clone();
                                let name2 = name.clone();
                                let handle = tokio::spawn(async move {
                                    poll_and_execute(&q2, &types2, &h2, timeout, &name2).await
                                });
                                match handle.await {
                                    Ok(Err(e)) => {
                                        tracing::error!(worker = %name, error = %e, "Worker error");
                                    }
                                    Err(e) => {
                                        tracing::error!(worker = %name, error = %e, "Worker panicked; restarting in 5s");
                                        tokio::time::sleep(Duration::from_secs(5)).await;
                                    }
                                    Ok(Ok(())) => {}
                                }
                            }
                        }
                    }
                    tracing::info!(worker = %name, "Worker stopped");
                });
            }
        }

        tracing::info!(handlers = self.handlers.len(), "Worker pool spawned");
    }

    pub fn shutdown(&self) {
        self.cancel_token.cancel();
    }
}

const QUEUE_IO_TIMEOUT: Duration = Duration::from_secs(30);

async fn poll_and_execute(
    queue: &Arc<dyn JobQueue>,
    job_types: &[&str],
    handler: &Arc<JobHandler>,
    timeout: Duration,
    worker_name: &str,
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

    let result = tokio::time::timeout(timeout, handler(job)).await;

    match result {
        Ok(Ok(())) => {
            if let Err(e) = tokio::time::timeout(QUEUE_IO_TIMEOUT, queue.update_status(job_id, JobStatus::Completed, None)).await {
                tracing::error!(error = %e, job_id = %job_id, "Failed to mark job completed (timeout)");
            }
            tracing::info!(worker = worker_name, job_id = %job_id, "Job completed");
        }
        Ok(Err(e)) => {
            let err_str = e.to_string();
            let job = match tokio::time::timeout(QUEUE_IO_TIMEOUT, queue.get(job_id)).await {
                Ok(Ok(j)) => j,
                Ok(Err(e)) => {
                    tracing::error!(error = %e, job_id = %job_id, "Failed to get job for retry decision");
                    None
                }
                Err(_) => {
                    tracing::warn!(job_id = %job_id, "get job timed out");
                    None
                }
            };
            if let Some(j) = job {
                let status = if j.attempts >= j.max_attempts {
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
                };
                if let Err(e) = tokio::time::timeout(QUEUE_IO_TIMEOUT, queue.update_status(job_id, status, Some(&err_str))).await {
                    tracing::error!(error = %e, job_id = %job_id, "Failed to update job status after failure (timeout)");
                }
            }
        }
        Err(_) => {
            if let Err(e) = tokio::time::timeout(QUEUE_IO_TIMEOUT, queue.update_status(job_id, JobStatus::Queued, Some("timeout"))).await {
                tracing::error!(error = %e, job_id = %job_id, "Failed to mark job timed out (timeout)");
            }
            tracing::warn!(
                worker = worker_name,
                job_id = %job_id,
                "Job timed out, will retry"
            );
        }
    }

    Ok(())
}

pub async fn run_retry_maintenance(
    queue: Arc<dyn JobQueue>,
    interval: Duration,
    cancel: CancellationToken,
) {
    loop {
        tokio::select! {
            _ = cancel.cancelled() => break,
            _ = tokio::time::sleep(interval) => {
                match tokio::time::timeout(QUEUE_IO_TIMEOUT, queue.retry_stuck(300)).await {
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
