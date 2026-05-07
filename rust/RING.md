# 🌟 Ring Architecture — trios-mb (Multi-Bot Telegram Platform)

> **Metal tiers**: GOLD → SILVER → BRONZE (one-directional dependency flow)

## Topology

```
🥇 GOLD (types, traits, proto)    — NO I/O, NO framework deps
        │
        ▼
🥈 SILVER (implementations)       — depends on GOLD only
        │
        ▼
🥉 BRONZE (entry points)          — wires SILVER implementations together
```

## Rings

| Ring | Package | Metal | Purpose |
|------|---------|-------|---------|
| GOLD-RING-TY00 | trios-mb-types | 🥇 | Domain types, errors, enums |
| GOLD-RING-TR00 | trios-mb-traits | 🥇 | async trait definitions |
| GOLD-RING-PR00 | trios-mb-proto | 🥇 | Serde/protocol types |
| SILVER-RING-DB00 | trios-mb-db | 🥈 | sea-orm + Supabase |
| SILVER-RING-SC00 | trios-mb-secrets | 🥈 | Infisical REST client |
| SILVER-RING-AI00 | trios-mb-ai | 🥈 | AI providers + failover |
| SILVER-RING-PY00 | trios-mb-payment | 🥈 | 6 payment methods |
| SILVER-RING-I18N | trios-mb-i18n | 🥈 | RU/EN translations |
| SILVER-RING-JB00 | trios-mb-jobs | 🥈 | Background jobs (PG queue) |
| SILVER-RING-TG00 | trios-mb-tg | 🥈 | teloxide FSM + navigation |
| SILVER-RING-SN00 | trios-mb-scenes | 🥈 | 52+ scene handlers |
| BRONZE-RING-SRV | trios-mb-server | 🥉 | Axum HTTP server |
| BRONZE-RING-APP | trios-mb-app | 🥉 | Main binary |

## Invariants

1. GOLD rings depend on NOTHING except external crates (serde, anyhow, async-trait)
2. SILVER rings depend on GOLD only (never other SILVER, except SN00 → TG00)
3. BRONZE wires concrete SILVER implementations via dependency injection
4. Every ring has: Cargo.toml, RING.md, TASK.md, AGENTS.md, src/

## Build

```bash
cargo build --workspace
cargo test --workspace
cargo clippy --workspace --all-targets
```
