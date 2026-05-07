# RING.md — BRONZE-RING-APP

## Metal
Bronze

## Package
trios-mb-app

## Purpose
Main binary entry point. Wires all SILVER ring implementations together, spawns multi-bot dispatchers.

## Flow
1. Load .env → AppConfig
2. Init Infisical (load all secrets)
3. Connect to DB + run migrations
4. Create concrete implementations
5. Spawn Axum server
6. Discover bot tokens (BOT_TOKEN_1..11)
7. For each: spawn teloxide Dispatcher
8. Graceful shutdown

## Build
```bash
cargo build -p trios-mb-app
cargo run -p trios-mb-app
```
