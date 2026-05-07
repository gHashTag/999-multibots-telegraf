# RING.md — GOLD-RING-TR00

## Metal
Gold

## Package
trios-mb-traits

## Purpose
Async trait definitions — the contract layer. All SILVER rings implement these traits.
Zero I/O, zero framework dependencies. Only trait definitions.

## Dependencies (internal)
- trios-mb-types (GOLD)

## Dependencies (external)
- async-trait

## API Surface
- `pub trait Database` — user CRUD, balance, payments, models, prompts
- `pub trait AiProvider` — generate, check status, cancel
- `pub trait PaymentGateway` — create payment, verify callback, refund
- `pub trait SecretStore` — get secret, reload cache
- `pub trait JobQueue` — enqueue, dequeue, update status

## Build
```bash
cargo build -p trios-mb-traits
cargo test -p trios-mb-traits
```
