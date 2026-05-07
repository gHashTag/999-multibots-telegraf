#!/bin/bash
set -euo pipefail

FLY_APP="999-multibots-rust"
FLY_TOML="fly.rust.toml"
DOCKERFILE="Dockerfile.rust"
HEALTH_URL="https://${FLY_APP}.fly.dev/health/simple"

echo "=== Rust Deployment for Fly.io ==="

if ! command -v flyctl &>/dev/null; then
    echo "ERROR: flyctl not installed"
    exit 1
fi

if [ -z "${FLY_API_TOKEN:-}" ]; then
    echo "ERROR: FLY_API_TOKEN not set"
    exit 1
fi

echo "[1/5] Running Rust tests..."
cd rust && cargo test --workspace --quiet && cd ..
echo "  Tests passed"

echo "[2/5] Running clippy..."
cd rust && cargo clippy --workspace --all-targets --quiet && cd ..
echo "  Clippy clean"

echo "[3/5] Deploying to Fly.io..."
flyctl deploy \
    --app "${FLY_APP}" \
    --config "${FLY_TOML}" \
    --remote-only \
    --dockerfile "${DOCKERFILE}"

echo "[4/5] Waiting for health check..."
sleep 10
for i in $(seq 1 12); do
    if curl -sf "${HEALTH_URL}" | grep -q '"status":"ok"'; then
        echo "  Health check passed"
        break
    fi
    if [ "$i" -eq 12 ]; then
        echo "  WARNING: Health check timeout"
    fi
    sleep 5
done

echo "[5/5] Deployment complete"
flyctl status --app "${FLY_APP}"
