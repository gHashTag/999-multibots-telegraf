# RING.md — SILVER-RING-JB00

## Metal
Silver

## Package
trios-mb-jobs

## Purpose
Background job processing replacing Inngest. PG-backed queue + tokio workers.

## Dependencies (internal)
- trios-mb-types (GOLD)
- trios-mb-traits (GOLD)

## API Surface
- `pub struct PgJobQueue` — impl JobQueue trait
- `pub struct WorkerPool` — manages tokio worker tasks

## Build
```bash
cargo build -p trios-mb-jobs
```
