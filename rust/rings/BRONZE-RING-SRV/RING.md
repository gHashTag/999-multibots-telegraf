# RING.md — BRONZE-RING-SRV

## Metal
Bronze

## Package
trios-mb-server

## Purpose
Axum HTTP server with /health endpoint and webhook handlers.

## API Surface
- `GET /health` — health check
- `POST /webhooks/payment/{method}` — payment callbacks
- `POST /webhooks/ai/{provider}` — AI provider callbacks

## Build
```bash
cargo build -p trios-mb-server
```
