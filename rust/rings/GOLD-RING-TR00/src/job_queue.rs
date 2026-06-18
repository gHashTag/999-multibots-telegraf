use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use trios_mb_types::AppError;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Job {
    pub id: uuid::Uuid,
    pub job_type: String,
    pub payload: serde_json::Value,
    pub status: JobStatus,
    pub attempts: i32,
    pub max_attempts: i32,
    pub scheduled_at: Option<chrono::DateTime<chrono::Utc>>,
    pub started_at: Option<chrono::DateTime<chrono::Utc>>,
    pub completed_at: Option<chrono::DateTime<chrono::Utc>>,
    pub error: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub enum JobStatus {
    Queued,
    Running,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EnqueueRequest {
    pub job_type: String,
    pub payload: serde_json::Value,
    pub max_attempts: Option<i32>,
    pub delay_secs: Option<u64>,
}

#[async_trait]
pub trait JobQueue: Send + Sync {
    async fn enqueue(&self, request: EnqueueRequest) -> Result<Job, AppError>;
    async fn dequeue(&self, job_types: &[&str]) -> Result<Option<Job>, AppError>;
    async fn update_status(&self, id: uuid::Uuid, status: JobStatus, error: Option<&str>) -> Result<(), AppError>;
    async fn get(&self, id: uuid::Uuid) -> Result<Option<Job>, AppError>;
    async fn cancel(&self, id: uuid::Uuid) -> Result<(), AppError>;
    async fn retry_stuck(&self, older_than_secs: u64) -> Result<u64, AppError>;
}
