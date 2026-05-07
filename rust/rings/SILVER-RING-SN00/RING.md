# RING.md — SILVER-RING-SN00

## Metal
Silver

## Package
trios-mb-scenes

## Purpose
52+ scene handlers for the multi-bot platform. Each scene = module with dptree::case! branches.
Depends on SILVER-RING-TG00 for FSM types.

## Dependencies (internal)
- trios-mb-types (GOLD)
- trios-mb-traits (GOLD)
- trios-mb-tg (SILVER)
- trios-mb-i18n (SILVER)

## API Surface
- `pub mod start` — /start command handler
- `pub mod menu` — main menu handler
- `pub mod neuro_photo` — neurophoto wizard
- `pub fn register_all_scenes()` — returns dptree branches for all scenes

## Build
```bash
cargo build -p trios-mb-scenes
```
