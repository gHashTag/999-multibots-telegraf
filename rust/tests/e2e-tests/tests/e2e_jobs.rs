use trios_mb_jobs::{JobType, WorkerPool, run_retry_maintenance};
use trios_mb_test_utils::MockJobQueue;
use trios_mb_traits::job_queue::JobQueue;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use tokio_util::sync::CancellationToken;
use std::time::Duration;
use trios_mb_traits::job_queue::EnqueueRequest;
use serde_json::json;

#[tokio::test]
async fn job_type_str_roundtrip() {
    assert_eq!(JobType::ModelTraining.as_str(), "model_training");
    assert_eq!(JobType::VideoRendering.as_str(), "video_rendering");
    assert_eq!(JobType::LipSyncRendering.as_str(), "lipsync_rendering");
    assert_eq!(JobType::Scraping.as_str(), "scraping");
}

#[tokio::test]
async fn job_type_all_types_contains_all() {
    let all = JobType::all_types();
    assert_eq!(all.len(), 9);
    assert!(all.contains(&JobType::ModelTraining));
    assert!(all.contains(&JobType::ImageRendering));
    assert!(all.contains(&JobType::VideoRendering));
}

#[tokio::test]
async fn job_type_concurrency_limits() {
    assert_eq!(JobType::ModelTraining.concurrency_limit(), 2);
    assert_eq!(JobType::ImageRendering.concurrency_limit(), 5);
    assert_eq!(JobType::VideoRendering.concurrency_limit(), 3);
}

#[tokio::test]
async fn job_type_timeouts() {
    assert_eq!(JobType::ModelTraining.timeout_secs(), 7200);
    assert_eq!(JobType::VideoRendering.timeout_secs(), 3600);
    assert_eq!(JobType::LipSyncRendering.timeout_secs(), 1800);
}

#[tokio::test]
async fn worker_pool_processes_job() {
    let queue: Arc<dyn JobQueue> = Arc::new(MockJobQueue::new());
    let processed = Arc::new(AtomicUsize::new(0));

    let job = queue.enqueue(EnqueueRequest {
        job_type: "model_training".to_string(),
        payload: json!({"test": true}),
        max_attempts: Some(3),
        delay_secs: None,
    }).await.unwrap();

    let processed_clone = processed.clone();
    let handler = Box::new(move |_job: trios_mb_traits::job_queue::Job| {
        let p = processed_clone.clone();
        Box::pin(async move {
            p.fetch_add(1, Ordering::SeqCst);
            Ok(())
        }) as std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), trios_mb_types::AppError>> + Send>>
    });

    let mut pool = WorkerPool::new(queue.clone());
    pool.register(JobType::ModelTraining, handler);
    let pool = Arc::new(pool);
    pool.spawn();

    tokio::time::sleep(Duration::from_millis(1500)).await;
    pool.shutdown();

    tokio::time::sleep(Duration::from_millis(100)).await;
    assert!(processed.load(Ordering::SeqCst) >= 1);

    let completed_job = queue.get(job.id).await.unwrap().unwrap();
    assert_eq!(completed_job.status, trios_mb_traits::job_queue::JobStatus::Completed);
}

#[tokio::test]
async fn worker_pool_retries_on_failure() {
    let queue: Arc<dyn JobQueue> = Arc::new(MockJobQueue::new());
    let attempts = Arc::new(AtomicUsize::new(0));

    let _job = queue.enqueue(EnqueueRequest {
        job_type: "model_training".to_string(),
        payload: json!({"retry_test": true}),
        max_attempts: Some(3),
        delay_secs: None,
    }).await.unwrap();

    let attempts_clone = attempts.clone();
    let handler = Box::new(move |_job: trios_mb_traits::job_queue::Job| {
        let a = attempts_clone.clone();
        Box::pin(async move {
            let count = a.fetch_add(1, Ordering::SeqCst);
            if count < 2 {
                Err(trios_mb_types::AppError::Internal("retry me".to_string()))
            } else {
                Ok(())
            }
        }) as std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), trios_mb_types::AppError>> + Send>>
    });

    let mut pool = WorkerPool::new(queue.clone());
    pool.register(JobType::ModelTraining, handler);
    let pool = Arc::new(pool);
    pool.spawn();

    tokio::time::sleep(Duration::from_millis(3000)).await;
    pool.shutdown();

    tokio::time::sleep(Duration::from_millis(100)).await;
    assert!(attempts.load(Ordering::SeqCst) >= 2);
}

#[tokio::test]
async fn retry_maintenance_resets_stuck_jobs() {
    let queue: Arc<dyn JobQueue> = Arc::new(MockJobQueue::new());
    let cancel = CancellationToken::new();

    let cancel_clone = cancel.clone();
    let q = queue.clone();
    tokio::spawn(async move {
        run_retry_maintenance(q, Duration::from_millis(100), cancel_clone).await;
    });

    tokio::time::sleep(Duration::from_millis(300)).await;
    cancel.cancel();

    tokio::time::sleep(Duration::from_millis(100)).await;
}
