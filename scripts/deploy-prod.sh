#!/usr/bin/env bash
set -euo pipefail

# Consistent production deploy to Zomro (docker-compose, no cache)
# Usage:
#   scripts/deploy-prod.sh              # rsync + build --no-cache + up -d + brief logs
#   scripts/deploy-prod.sh --no-rsync   # skip rsync (only rebuild/restart)
#   scripts/deploy-prod.sh --logs 3002  # tail logs and highlight specific bot port

SSH_KEY="${SSH_KEY:-$HOME/.ssh/zomro}"
SERVER="${SERVER:-root@212.86.115.30}"
REMOTE_ROOT="${REMOTE_ROOT:-/root/999-agents-vibecoder}"
REMOTE_APP_DIR="$REMOTE_ROOT/services/bot-farm"
LOCAL_DIR="${LOCAL_DIR:-/Users/playra/999-agents-telegraf/}"

DO_RSYNC=true
TAIL_LOGS=false
LOG_GREP=""

for arg in "$@"; do
  case "$arg" in
    --no-rsync)
      DO_RSYNC=false;
      shift ;;
    --logs)
      TAIL_LOGS=true;
      shift ;;
    --logs=*)
      TAIL_LOGS=true;
      LOG_GREP="${arg#*=}";
      shift ;;
    *) ;;
  esac
done

echo "🚀 Deploying to $SERVER"

if $DO_RSYNC; then
  echo "🔄 Rsync local -> remote ($LOCAL_DIR -> $SERVER:$REMOTE_APP_DIR)"
  rsync -az \
    -e "ssh -i $SSH_KEY -o StrictHostKeyChecking=no" \
    --delete \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude 'dist' \
    --exclude '.cursor' \
    --exclude '.DS_Store' \
    "$LOCAL_DIR" "$SERVER:$REMOTE_APP_DIR/"
fi

echo "🔧 Rebuild (no-cache) and restart app via docker compose"
ssh -i "$SSH_KEY" "$SERVER" bash -lc "set -e; cd '$REMOTE_ROOT'; \
  docker compose build --no-cache app; \
  docker compose up -d app; \
  sleep 18; \
  docker compose ps"

echo "📜 Last logs"
ssh -i "$SSH_KEY" "$SERVER" bash -lc "set -e; cd '$REMOTE_ROOT'; docker compose logs app --tail=180 | tail -n 180" |
  if [[ -n "$LOG_GREP" ]]; then grep -Ei "$LOG_GREP" || true; else cat; fi

echo "✅ Deploy finished"


