# RING.md — SILVER-RING-AI00

## Metal
Silver

## Package
trios-mb-ai

## Purpose
AI provider integrations (Replicate, Fal, Kie, OpenAI, ElevenLabs, HeyGen, Hedra).
Provider factory with failover chain and circuit breaker.

## Dependencies (internal)
- trios-mb-types (GOLD)
- trios-mb-traits (GOLD)

## API Surface
- `pub struct AiOrchestrator` — impl AiProviderOrchestrator with failover
- `pub mod providers` — individual provider implementations

## Build
```bash
cargo build -p trios-mb-ai
```
