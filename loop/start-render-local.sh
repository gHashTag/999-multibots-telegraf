#!/bin/zsh
cd /Users/playom/999-multibots-telegraf/apps/vibee-editor/render
export PATH="/opt/homebrew/bin:$PATH"
V() { railway variables list -s vibee-render -e production --kv 2>/dev/null | grep "^$1=" | cut -d= -f2-; }
VP() { railway variables list -s Postgres-NFrq -e production --kv 2>/dev/null | grep "^$1=" | cut -d= -f2-; }
VB() { railway variables list -s 999-multibots-telegraf -e production --kv 2>/dev/null | grep "^$1=" | cut -d= -f2-; }
export REPLICATE_API_TOKEN="$(VB REPLICATE_API_TOKEN)"
export DATABASE_URL="$(VP DATABASE_PUBLIC_URL)"
export FAL_KEY="$(V FAL_KEY)"
export ELEVENLABS_API_KEY="$(V ELEVENLABS_API_KEY)"
export GLM_API_KEY="$(V GLM_API_KEY)"
export AGENT_KEYS="$(V AGENT_KEYS)"
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
