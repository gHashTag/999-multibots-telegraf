# RING.md — SILVER-RING-I18N

## Metal
Silver

## Package
trios-mb-i18n

## Purpose
RU/EN internationalization. Message catalogs for all bot UI strings.

## Dependencies (internal)
- trios-mb-types (GOLD)

## API Surface
- `pub fn t(lang: Language, key: &str) -> String`
- `pub fn t_or(lang: Language, key: &str, fallback: &str) -> String`

## Build
```bash
cargo build -p trios-mb-i18n
```
