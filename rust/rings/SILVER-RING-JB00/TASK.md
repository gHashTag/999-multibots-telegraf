# TASK.md — SILVER-RING-JB00

## Current Tasks
- [x] Basic PgJobQueue stub
- [x] Create job_queue table migration (in SILVER-RING-DB00)
- [x] Implement enqueue — INSERT INTO job_queue
- [x] Implement dequeue — FOR UPDATE SKIP LOCKED
- [x] Implement update_status / cancel / retry_stuck
- [x] WorkerPool with tokio::spawn + CancellationToken
- [x] Job types: training, rendering, scraping (9 types)
- [x] Timeout handling per job type
- [x] Retry logic with max_attempts
- [x] run_retry_maintenance for stuck job recovery
- [ ] Test with real PostgreSQL
- [ ] Wire into BRONZE-RING-APP startup
