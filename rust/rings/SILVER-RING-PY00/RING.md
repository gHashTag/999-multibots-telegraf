# RING.md — SILVER-RING-PY00

## Metal
Silver

## Package
trios-mb-payment

## Purpose
Payment processing for 6 methods: Telegram Stars, Robokassa, x402 (USDC), TON USDT, TON Native, Telegram Payments.

## Dependencies (internal)
- trios-mb-types (GOLD)
- trios-mb-traits (GOLD)

## API Surface
- `pub mod robokassa` — Robokassa RUB gateway
- `pub mod telegram_stars` — Telegram Stars (XTR)
- `pub mod x402` — USDC on Base
- `pub mod ton` — TON USDT + TON Native

## Build
```bash
cargo build -p trios-mb-payment
```
