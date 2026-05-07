# RING.md — GOLD-RING-PR00

## Metal
Gold

## Package
trios-mb-proto

## Purpose
Serde types for all external API protocols: Telegram, Supabase RPC, AI providers, payment gateways, Infisical.

## Dependencies (internal)
- trios-mb-types (GOLD)

## API Surface
- `pub mod telegram` — CallbackData, InlineButton, ReplyMarkup types
- `pub mod infisical` — Infisical REST API request/response
- `pub mod replicate` — Replicate API types
- `pub mod fal` — Fal.ai API types
- `pub mod openai` — OpenAI/GLM/DeepSeek API types

## Build
```bash
cargo build -p trios-mb-proto
```
