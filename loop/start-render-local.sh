#!/bin/zsh
cd "$HOME/999-multibots-telegraf/apps/vibee-editor/render"
export PATH="/opt/homebrew/bin:$PATH"
# railway CLI изредка отдаёт пусто (лимит/гонка) — без ретраев сервер
# стартовал с пустыми DATABASE_URL/AGENT_KEYS и «работал» health-ом,
# отдавая 500 на всё, что трогает базу. Замерено 24.08.
VR() { railway variables list -s "$1" -e production --kv 2>/dev/null | grep "^$2=" | cut -d= -f2-; }
V()  { local v="" i; for i in 1 2 3 4; do v="$(VR vibee-render "$1")"; [ -n "$v" ] && { printf '%s' "$v"; return 0; }; sleep 3; done; printf ''; }
VP() { local v="" i; for i in 1 2 3 4; do v="$(VR Postgres-NFrq "$1")"; [ -n "$v" ] && { printf '%s' "$v"; return 0; }; sleep 3; done; printf ''; }
VB() { local v="" i; for i in 1 2 3 4; do v="$(VR 999-multibots-telegraf "$1")"; [ -n "$v" ] && { printf '%s' "$v"; return 0; }; sleep 3; done; printf ''; }
export REPLICATE_API_TOKEN="$(VB REPLICATE_API_TOKEN)"
export DATABASE_URL="$(VP DATABASE_PUBLIC_URL)"
[ -n "$DATABASE_URL" ] || { echo "❌ DATABASE_URL не вытянут за 4 попытки — railway CLI жив? (railway whoami)"; exit 1; }
export FAL_KEY="$(V FAL_KEY)"
export ELEVENLABS_API_KEY="$(V ELEVENLABS_API_KEY)"
export GLM_API_KEY="$(V GLM_API_KEY)"
export AGENT_KEYS="$(V AGENT_KEYS)"
[ -n "$AGENT_KEYS" ] || { echo "❌ AGENT_KEYS не вытянут — MCP локально будет 401"; exit 1; }
export AGENT_PROVIDER=zai
export AGENT_MODEL=glm-5.3
export AWS_ENDPOINT_URL_S3="$(V AWS_ENDPOINT_URL_S3)"
export AWS_ACCESS_KEY_ID="$(V AWS_ACCESS_KEY_ID)"
export AWS_SECRET_ACCESS_KEY="$(V AWS_SECRET_ACCESS_KEY)"
export AWS_REGION="$(V AWS_REGION)"
export BUCKET_NAME=vibee-assets
export PORT=3333
export SELF_URL=http://127.0.0.1:3333
export OUTPUT_DIR=./out
exec npm run start
