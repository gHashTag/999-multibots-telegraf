# RING.md — SILVER-RING-TG00

## Metal
Silver

## Package
trios-mb-tg

## Purpose
Telegram adapter: teloxide FSM state machine, keyboard builders, navigation router, scene registry, middleware chain.

## Dependencies (internal)
- trios-mb-types (GOLD)
- trios-mb-traits (GOLD)
- trios-mb-proto (GOLD)
- trios-mb-i18n (SILVER)

## API Surface
- `pub mod state` — FSM State mega-enum (52+ scene states)
- `pub mod keyboards` — inline/reply keyboard builders
- `pub mod navigation` — NavigationRouter
- `pub mod registry` — SceneRegistry with metadata
- `pub mod dispatcher` — multi-bot dispatcher builder

## Build
```bash
cargo build -p trios-mb-tg
```
