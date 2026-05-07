# RING.md — GOLD-RING-TY00

## Metal
Gold

## Package
trios-mb-types

## Purpose
Domain types, error types, and shared enums for the multi-bot Telegram platform.
Zero I/O, zero framework dependencies. Pure data definitions.

## Dependencies (external only)
- serde, serde_json — serialization
- thiserror — error derive macros
- uuid — unique identifiers
- chrono — timestamps

## API Surface
- `pub mod user` — User, Language, Gender, SubscriptionType
- `pub mod payment` — PaymentMethod (6 variants), PaymentStatus, Transaction
- `pub mod generation` — GenerationRequest, GenerationResult, MediaType
- `pub mod bot` — BotName (15 variants), BotConfig
- `pub mod scene` — SceneId (52+ variants), SceneCategory, AccessLevel
- `pub mod errors` — AppError, DbError, AiError, PaymentError, SecretsError
- `pub mod config` — AppConfig

## Build
```bash
cargo build -p trios-mb-types
cargo test -p trios-mb-types
```
