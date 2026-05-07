# RING.md — SILVER-RING-SC00

## Metal
Silver

## Package
trios-mb-secrets

## Purpose
Infisical cloud secret manager REST client. Implements `trios-mb-traits::SecretStore`.

## Dependencies (internal)
- trios-mb-types (GOLD)
- trios-mb-traits (GOLD)
- trios-mb-proto (GOLD)

## API Surface
- `pub struct InfisicalStore` — concrete impl of SecretStore
- `pub async fn connect(client_id, client_secret, project_id, env) -> Result<InfisicalStore>`

## Build
```bash
cargo build -p trios-mb-secrets
```
