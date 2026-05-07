---
name: "Rust Rewrite"
description: "Autonomous rewrite of TypeScript Telegram bot to Rust using Ring Architecture (GOLD/SILVER/BRONZE). Use for ANY Rust ring implementation work."
---

# Rust Rewrite Skill — Ring Architecture

## Architecture
```
GOLD (types, traits, proto) → SILVER (implementations) → BRONZE (entry points)
```

## Ring Map
| Ring | Crate | Status |
|------|-------|--------|
| GOLD-RING-TY00 | trios-mb-types | 95% |
| GOLD-RING-TR00 | trios-mb-traits | 95% |
| GOLD-RING-PR00 | trios-mb-proto | 33% |
| SILVER-RING-DB00 | trios-mb-db | 85% |
| SILVER-RING-SC00 | trios-mb-secrets | 90% |
| SILVER-RING-AI00 | trios-mb-ai | 60% |
| SILVER-RING-PY00 | trios-mb-payment | 50% |
| SILVER-RING-I18N | trios-mb-i18n | 95% |
| SILVER-RING-JB00 | trios-mb-jobs | 90% |
| SILVER-RING-TG00 | trios-mb-tg | 85% |
| SILVER-RING-SN00 | trios-mb-scenes | 75% |
| BRONZE-RING-SRV | trios-mb-server | 40% |
| BRONZE-RING-APP | trios-mb-app | 60% |

## Key Conventions
1. GOLD depends on NOTHING except external crates
2. SILVER depends on GOLD only
3. SN00 may also depend on TG00
4. BRONZE wires SILVER implementations
5. Use `sea_orm` for DB, `teloxide` for Telegram, `axum` for HTTP
6. Errors: `AppError::Db(DbError::Query(...))`, `AppError::Internal(...)`
7. Status strings in DB: "queued", "running", "completed", "failed", "cancelled"

## Build & Test
```bash
cd rust
cargo check --workspace
cargo test --workspace
cargo clippy --workspace --all-targets
```

## TypeScript Source Reference
- TS scenes: `src/scenes/*/index.ts`
- TS services: `src/services/*/`
- TS navigation: `src/navigation/`
- TS types: `src/types/`
