use async_trait::async_trait;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use trios_mb_traits::job_queue::{EnqueueRequest, Job, JobQueue, JobStatus};
use trios_mb_types::AppError;

#[derive(Debug, Default)]
struct Inner {
    jobs: HashMap<uuid::Uuid, Job>,
    order: Vec<uuid::Uuid>,
}

#[derive(Debug, Clone)]
pub struct MockJobQueue {
    inner: Arc<Mutex<Inner>>,
}

impl MockJobQueue {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(Inner::default())),
        }
    }
}

impl Default for MockJobQueue {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl JobQueue for MockJobQueue {
    async fn enqueue(&self, request: EnqueueRequest) -> Result<Job, AppError> {
        let mut inner = self.inner.lock().await;
        let id = uuid::Uuid::new_v4();
        let now = chrono::Utc::now();
        let job = Job {
            id,
            job_type: request.job_type,
            payload: request.payload,
            status: JobStatus::Queued,
            attempts: 0,
            max_attempts: request.max_attempts.unwrap_or(3).max(1),
            scheduled_at: request.delay_secs.map(|d| now + chrono::Duration::seconds(d as i64)),
            started_at: None,
            completed_at: None,
            error: None,
            created_at: now,
        };
        inner.order.push(id);
        inner.jobs.insert(id, job.clone());
        Ok(job)
    }

    async fn dequeue(&self, job_types: &[&str]) -> Result<Option<Job>, AppError> {
        let mut inner = self.inner.lock().await;
        let found = inner.order.iter().find(|id| {
            inner.jobs.get(*id).is_some_and(|j| {
                j.status == JobStatus::Queued && job_types.contains(&j.job_type.as_str())
            })
        }).copied();
        if let Some(id) = found {
            let job = inner.jobs.get_mut(&id).unwrap();
            job.status = JobStatus::Running;
            job.started_at = Some(chrono::Utc::now());
            Ok(Some(job.clone()))
        } else {
            Ok(None)
        }
    }

    async fn update_status(&self, id: uuid::Uuid, status: JobStatus, error: Option<&str>) -> Result<(), AppError> {
        let mut inner = self.inner.lock().await;
        if let Some(job) = inner.jobs.get_mut(&id) {
            job.status = status;
            if let Some(e) = error {
                job.error = Some(e.to_string());
            }
            if status == JobStatus::Completed || status == JobStatus::Failed {
                job.completed_at = Some(chrono::Utc::now());
            }
            Ok(())
        } else {
            Err(AppError::NotFound(format!("job {}", id)))
        }
    }

    async fn get(&self, id: uuid::Uuid) -> Result<Option<Job>, AppError> {
        let inner = self.inner.lock().await;
        Ok(inner.jobs.get(&id).cloned())
    }

    async fn cancel(&self, id: uuid::Uuid) -> Result<(), AppError> {
        let mut inner = self.inner.lock().await;
        if let Some(job) = inner.jobs.get_mut(&id) {
            job.status = JobStatus::Cancelled;
            job.completed_at = Some(chrono::Utc::now());
            Ok(())
        } else {
            Err(AppError::NotFound(format!("job {}", id)))
        }
    }

    async fn retry_stuck(&self, older_than_secs: u64) -> Result<u64, AppError> {
        let mut inner = self.inner.lock().await;
        let cutoff = chrono::Utc::now() - chrono::Duration::seconds(older_than_secs as i64);
        let mut count = 0u64;
        for job in inner.jobs.values_mut() {
            if job.status == JobStatus::Running {
                if let Some(started) = job.started_at {
                    if started < cutoff {
                        job.status = JobStatus::Queued;
                        job.started_at = None;
                        count += 1;
                    }
                }
            }
        }
        Ok(count)
    }
}
