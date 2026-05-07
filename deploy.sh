#!/bin/bash
# 🚀 Unified Deployment Script with Environment Support
# Supports: dev, staging, production
# Uses: esbuild (fast ~2min builds, 101MB images)

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
ENV=${1:-production}
FORCE=false
NO_CACHE=false

# Check for flags
shift || true
while [[ $# -gt 0 ]]; do
  case $1 in
    --force)
      FORCE=true
      shift
      ;;
    --no-cache)
      NO_CACHE=true
      shift
      ;;
    *)
      echo -e "${RED}❌ Unknown argument: $1${NC}"
      echo "Usage: ./deploy.sh [dev|staging|production] [--force] [--no-cache]"
      exit 1
      ;;
  esac
done

# Environment configurations
case "$ENV" in
  dev|development)
    SSH_HOST="localhost"
    SSH_ALIAS="localhost"
    PORT=3001
    INFISICAL_ENV="dev"
    CONTAINER_NAME="999-multibots-dev"
    echo -e "${BLUE}🔧 DEVELOPMENT MODE${NC}"
    ;;
  staging)
    SSH_HOST="188.137.250.69"
    SSH_ALIAS="prod999"
    PORT=3002
    API_PORT=3002
    INFISICAL_ENV="staging"
    CONTAINER_NAME="999-multibots-staging"
    echo -e "${YELLOW}🧪 STAGING MODE${NC}"
    ;;
  prod|production)
    SSH_HOST="188.137.250.69"
    SSH_ALIAS="prod999"
    PORT=3001
    API_PORT=3001
    INFISICAL_ENV="prod"
    CONTAINER_NAME="999-multibots"
    echo -e "${GREEN}🚀 PRODUCTION MODE${NC}"
    ;;
  *)
    echo -e "${RED}❌ Unknown environment: $ENV${NC}"
    echo "Usage: ./deploy.sh [dev|staging|production] [--force]"
    exit 1
    ;;
esac

echo "======================================"
echo "Environment: $ENV"
echo "SSH: $SSH_HOST"
echo "Port: $PORT"
echo "Container: $CONTAINER_NAME"
echo "======================================"
echo ""

# 1. TypeScript Check
if [ "$FORCE" = true ]; then
  echo -e "${YELLOW}⚠️  SKIPPING TypeScript check (--force flag)${NC}"
  echo ""
else
  echo "1️⃣ Type check..."
  if ! npm run typecheck; then
    echo -e "${RED}❌ TypeScript errors found!${NC}"
    echo ""
    echo "To force deployment despite TypeScript errors, run:"
    echo "  ./deploy.sh $ENV --force"
    exit 1
  fi
  echo -e "${GREEN}✅ TypeScript: 0 errors${NC}"
  echo ""
fi

# 2. Sync code to server (skip for dev)
if [ "$ENV" != "dev" ] && [ "$ENV" != "development" ]; then
  echo "2️⃣ Syncing code to $SSH_HOST..."
  rsync -avz --delete \
    --exclude='.git' \
    --exclude='worktrees' \
    --exclude='.git-rewrite' \
    --exclude='.claude-flow' \
    --exclude='backup-repo-*.git' \
    --exclude='node_modules' \
    --exclude='dist' \
    --exclude='.env*' \
    --exclude='*.log' \
    --exclude='tests' \
    --exclude='docs' \
    --exclude='debug' \
    --exclude='deployment' \
    --exclude='src/uploads' \
    --exclude='uploads' \
    --exclude='temp' \
    --exclude='*.mp4' \
    --exclude='*.mov' \
    --exclude='*.avi' \
    --exclude='*.webm' \
    --exclude='*.mkv' \
    --exclude='*.flv' \
    --exclude='*.png' \
    --exclude='*.jpg' \
    --exclude='*.jpeg' \
    --exclude='*.gif' \
    --exclude='*.webp' \
    --exclude='*.svg' \
    --exclude='*.ico' \
    --exclude='*.bmp' \
    --exclude='*.tiff' \
    ./ $SSH_ALIAS:/root/999-agents-telegraf/

  echo -e "${GREEN}✅ Code synced${NC}"
  echo ""

  # ✅ Проверка портов (тихая, только если найдена проблема)
  ssh $SSH_ALIAS bash <<'FIXSCRIPT'
set -e
cd /root/999-agents-telegraf

# Проверяем docker-compose.yml (только если найдена проблема)
if grep -q "2999" docker-compose.yml 2>/dev/null && ! grep -q "#.*2999" docker-compose.yml 2>/dev/null; then
  echo "⚠️  Port 2999 found in docker-compose.yml, updating to 3000..."
  sed -i 's/2999:2999/3000:3000/g' docker-compose.yml
  sed -i 's/:2999 /:3000 /g' docker-compose.yml
  sed -i 's/localhost:2999/localhost:3000/g' docker-compose.yml
  echo "✅ docker-compose.yml updated"
fi

# Проверяем nginx config (только если найдена проблема)
if docker exec bot-proxy grep -q "2999" /etc/nginx/conf.d/default.conf 2>/dev/null; then
  echo "⚠️  Port 2999 found in nginx config, updating to 3000..."
  docker exec bot-proxy sed -i 's/localhost:2999/localhost:3000/g' /etc/nginx/conf.d/default.conf
  docker exec bot-proxy nginx -t && docker exec bot-proxy nginx -s reload
  echo "✅ nginx config updated"
fi
FIXSCRIPT

  echo ""
fi

# 3. Build Docker
echo "3️⃣ Building Docker image..."
echo "   (займёт ~2 минуты с esbuild)"
echo ""

if [ "$ENV" = "dev" ] || [ "$ENV" = "development" ]; then
  # Local build
  echo "📦 СТАРТ BUILD: $(date +%H:%M:%S)"
  START=$(date +%s)

  export DOCKER_BUILDKIT=1
  BUILD_ARGS=""
  if [ "$FORCE" = true ]; then
    BUILD_ARGS="--build-arg SKIP_TYPE_CHECK=true"
  fi
  if [ "$NO_CACHE" = true ]; then
    BUILD_ARGS="$BUILD_ARGS --no-cache"
  fi

  docker build \
    -t $CONTAINER_NAME:latest \
    $BUILD_ARGS \
    --progress=plain \
    --no-cache \
    . 2>&1 | tail -30

  END=$(date +%s)
  DURATION=$((END - START))

  echo ""
  echo -e "${GREEN}✅ ГОТОВО: $(date +%H:%M:%S)${NC}"
  echo "⏱️  Время сборки: ${DURATION} секунд ($(($DURATION / 60))м $(($DURATION % 60))с)"
else
  # Remote build
  BUILD_ARGS=""
  if [ "$FORCE" = true ]; then
    BUILD_ARGS="--build-arg SKIP_TYPE_CHECK=true"
  fi

  ssh $SSH_ALIAS bash <<REMOTESCRIPT
set -e
set -o pipefail
cd /root/999-agents-telegraf

echo "📦 СТАРТ BUILD: \$(date +%H:%M:%S)"
START=\$(date +%s)

export DOCKER_BUILDKIT=1

docker build \\
  -t $CONTAINER_NAME:latest \\
  $BUILD_ARGS \\
  --progress=plain \\
  --no-cache \\
  . 2>&1 | tail -30

BUILD_EXIT=\${PIPESTATUS[0]}
if [ \$BUILD_EXIT -ne 0 ]; then
  echo "❌ Docker build FAILED!"
  exit 1
fi

END=\$(date +%s)
DURATION=\$((END - START))

echo ""
echo "✅ ГОТОВО: \$(date +%H:%M:%S)"
echo "⏱️  Время сборки: \${DURATION} секунд (\$((\$DURATION / 60))м \$((\$DURATION % 60))с)"
echo ""

echo "📊 Image info:"
docker images | grep $CONTAINER_NAME
REMOTESCRIPT

  if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Docker build FAILED! Aborting deployment.${NC}"
    exit 1
  fi
fi

echo ""
echo -e "${GREEN}✅ Docker build completed${NC}"
echo ""

# 4. Deploy container
echo "4️⃣ Deploying container..."

if [ "$ENV" = "dev" ] || [ "$ENV" = "development" ]; then
  # Local deployment
  docker stop $CONTAINER_NAME 2>/dev/null || true
  docker rm $CONTAINER_NAME 2>/dev/null || true

  docker run -d \
    --name $CONTAINER_NAME \
    --restart=unless-stopped \
    -p 3000:3000 \
    -p 3001:3001 \
    -e API_PORT=$API_PORT \
    --env-file .env \
    $CONTAINER_NAME:latest

  echo ""
  echo -e "${GREEN}✅ Container started${NC}"
  echo ""
  echo "📊 Container status:"
  docker ps | grep $CONTAINER_NAME
else
  # Remote deployment
  ssh $SSH_ALIAS 'bash -s' << ENDSSH
cd /root/999-agents-telegraf

docker stop $CONTAINER_NAME 2>/dev/null || true
docker rm $CONTAINER_NAME 2>/dev/null || true

docker run -d \
  --name $CONTAINER_NAME \
  --restart=always \
  -p 3000:3000 \
  -p 3001:3001 \
  -e API_PORT=$API_PORT \
  --env-file /root/999-agents-telegraf/.env \
  -v /root/999-agents-telegraf/.env:/app/.env:ro \
  $CONTAINER_NAME:latest

echo "✅ Container started"
echo ""
echo "📊 Container status:"
docker ps | grep $CONTAINER_NAME
ENDSSH
fi

echo ""
echo -e "${GREEN}✅ Container deployed${NC}"
echo ""

# 4.5. 🔧 NGINX AUTO-FIX (Critical - prevents webhook failures!)
if [ "$ENV" != "dev" ] && [ "$ENV" != "development" ]; then
  echo "4.5️⃣ Checking and fixing nginx configuration..."

  # Function to send Telegram alert to admin
  send_admin_alert() {
    local message="$1"
    local ADMIN_CHAT_ID="144022504"  # Admin Telegram ID
    # Get bot token from server .env
    local BOT_TOKEN=$(ssh $SSH_ALIAS "grep TELEGRAM_BOT_TOKEN_LEELA /root/999-agents-telegraf/.env 2>/dev/null | cut -d'=' -f2" 2>/dev/null || echo "")

    if [ -n "$BOT_TOKEN" ]; then
      curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
        -d "chat_id=${ADMIN_CHAT_ID}" \
        -d "text=${message}" \
        -d "parse_mode=HTML" > /dev/null 2>&1 || true
      echo "📱 Admin notified via Telegram"
    fi
  }

  NGINX_ISSUES=""

  ssh $SSH_ALIAS 'bash -s' << 'NGINX_FIX'
set -e

ISSUES_FOUND=""

# Check if nginx is running
if ! systemctl is-active --quiet nginx; then
  echo "⚠️  Nginx is not running! Starting..."
  ISSUES_FOUND="${ISSUES_FOUND}nginx_stopped,"
  systemctl start nginx
  systemctl enable nginx
  echo "✅ Nginx started and enabled"
fi

# Check nginx upstream port (MUST be 3001 for production!)
NGINX_CONFIG="/etc/nginx/sites-available/bot-api"

if [ -f "$NGINX_CONFIG" ]; then
  # Check if upstream points to wrong port
  if grep -q "server 127.0.0.1:3000" "$NGINX_CONFIG"; then
    echo "⚠️  Nginx upstream pointing to wrong port 3000! Fixing to 3001..."
    ISSUES_FOUND="${ISSUES_FOUND}wrong_port,"
    sed -i 's/server 127.0.0.1:3000/server 127.0.0.1:3001/' "$NGINX_CONFIG"

    # Test and reload
    if nginx -t 2>/dev/null; then
      systemctl reload nginx
      echo "✅ Nginx fixed: upstream now points to 3001"
    else
      echo "❌ Nginx config test failed!"
      echo "CRITICAL_ERROR:nginx_config_invalid"
      exit 1
    fi
  else
    echo "✅ Nginx upstream correctly configured (port 3001)"
  fi
else
  echo "⚠️  Nginx config not found at $NGINX_CONFIG"
  ISSUES_FOUND="${ISSUES_FOUND}config_missing,"
fi

# Test external webhook accessibility
echo "🔍 Testing webhook via nginx..."
WEBHOOK_TEST=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d '{"test":true}' \
  https://three-head-dragon.shop/api/video-callback/ 2>/dev/null || echo "000")

if [ "$WEBHOOK_TEST" = "200" ] || [ "$WEBHOOK_TEST" = "202" ]; then
  echo "✅ External webhook test PASSED (HTTP $WEBHOOK_TEST)"
else
  echo "⚠️  External webhook returned HTTP $WEBHOOK_TEST"
  ISSUES_FOUND="${ISSUES_FOUND}webhook_failed_${WEBHOOK_TEST},"
  echo "   Checking nginx error log..."
  tail -5 /var/log/nginx/bot-api.error.log 2>/dev/null || true
fi

# Output issues for parent script to capture
if [ -n "$ISSUES_FOUND" ]; then
  echo "NGINX_ISSUES:${ISSUES_FOUND}"
fi
NGINX_FIX

  # Capture nginx check result
  NGINX_RESULT=$?

  # Check if there were any issues that need admin notification
  if ssh $SSH_ALIAS "grep -q 'server 127.0.0.1:3000' /etc/nginx/sites-available/bot-api 2>/dev/null"; then
    # This shouldn't happen after fix, but check anyway
    :
  fi

  # Send alert if critical issues detected
  if [ $NGINX_RESULT -ne 0 ]; then
    send_admin_alert "🚨 <b>CRITICAL: Deploy nginx issue!</b>

Server: 188.137.250.69
Time: $(date '+%Y-%m-%d %H:%M:%S')

Nginx configuration failed validation.
Webhooks may not work!

<code>ssh prod999 'nginx -t'</code>"

    echo -e "${RED}❌ NGINX CRITICAL ERROR! Admin notified.${NC}"
  fi

  echo ""
fi

# 5. Health check
echo "5️⃣ Health check (wait 10s)..."
sleep 10

HEALTH_URL="http://$SSH_HOST:$PORT/health"

if [ "$ENV" = "dev" ] || [ "$ENV" = "development" ]; then
  HEALTH_URL="http://localhost:$PORT/health"
fi

echo "Checking: $HEALTH_URL"

if curl -f -s "$HEALTH_URL" > /dev/null 2>&1; then
  echo -e "${GREEN}✅ Health check PASSED${NC}"
  echo ""
  curl -s "$HEALTH_URL" | head -5 || echo "Bots running in polling mode"
else
  echo -e "${YELLOW}⚠️  Health check FAILED (but bots may be running in polling mode)${NC}"
  echo "   Checking logs..."

  # 🚨 SEND WARNING TO ADMIN
  if [ "$ENV" != "dev" ] && [ "$ENV" != "development" ]; then
    send_admin_alert "⚠️ <b>WARNING: Health check failed</b>

Server: 188.137.250.69
Time: $(date '+%Y-%m-%d %H:%M:%S')
URL: $HEALTH_URL

Контейнер запущен, но health endpoint не отвечает.
Возможно боты работают в polling mode.

<code>ssh prod999 'docker logs 999-multibots --tail 20'</code>"
  fi

  if [ "$ENV" = "dev" ] || [ "$ENV" = "development" ]; then
    docker logs $CONTAINER_NAME --tail 50
  else
    ssh $SSH_ALIAS "docker logs $CONTAINER_NAME --tail 50"
  fi
fi

echo ""

# 6. Webhook verification (CRITICAL - never remove!)
echo "6️⃣ Webhook verification (CRITICAL CHECK)..."
echo "   Testing Veo 3 webhook endpoint..."
sleep 3

WEBHOOK_URL="http://$SSH_HOST:$PORT/api/video-callback"

if [ "$ENV" = "dev" ] || [ "$ENV" = "development" ]; then
  WEBHOOK_URL="http://localhost:$PORT/api/video-callback"
fi

# Test payload - minimal Veo 3 / WAN webhook structure
TEST_PAYLOAD='{
  "code": 200,
  "msg": "Success",
  "successFlag": true,
  "taskId": "test-deployment-webhook-check",
  "resultUrl": "https://example.com/test.mp4",
  "data": {
    "videoUrl": "https://example.com/test.mp4"
  }
}'

echo "Sending test webhook to: $WEBHOOK_URL"

# Send test webhook (10 second timeout)
WEBHOOK_RESPONSE=$(curl -s --max-time 10 -w "\nHTTP_CODE:%{http_code}" -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d "$TEST_PAYLOAD" 2>&1)

HTTP_CODE=$(echo "$WEBHOOK_RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "202" ]; then
  echo -e "${GREEN}✅ Webhook endpoint responded: HTTP $HTTP_CODE${NC}"

  # Check logs for correct provider detection
  echo "   Verifying webhook processing..."
  sleep 2

  if [ "$ENV" = "dev" ] || [ "$ENV" = "development" ]; then
    WEBHOOK_LOGS=$(docker logs $CONTAINER_NAME --tail 30 2>&1 | grep -i "webhook\|provider detected" || true)
  else
    WEBHOOK_LOGS=$(ssh $SSH_ALIAS "docker logs $CONTAINER_NAME --tail 30 2>&1 | grep -i 'webhook\|provider detected'" || true)
  fi

  # Check if logs contain correct provider detection (kie-wan for Veo 3, not kie-ai!)
  if echo "$WEBHOOK_LOGS" | grep -q "kie-wan\|kie-veed\|kie-sora"; then
    echo -e "${GREEN}✅ Webhook provider correctly detected!${NC}"
    echo ""
    echo "$WEBHOOK_LOGS" | head -5
  else
    echo -e "${YELLOW}⚠️  Warning: Webhook provider detection unclear${NC}"
    echo "   Recent logs:"
    echo "$WEBHOOK_LOGS" | head -10
  fi
else
  echo -e "${RED}❌ WEBHOOK CHECK FAILED! HTTP Code: ${HTTP_CODE:-ERROR}${NC}"
  echo ""
  echo "Response:"
  echo "$WEBHOOK_RESPONSE"
  echo ""

  # 🚨 SEND TELEGRAM ALERT TO ADMIN
  if [ "$ENV" != "dev" ] && [ "$ENV" != "development" ]; then
    send_admin_alert "🚨 <b>CRITICAL: Webhook FAILED!</b>

Server: 188.137.250.69
Time: $(date '+%Y-%m-%d %H:%M:%S')
HTTP Code: ${HTTP_CODE:-ERROR}

Deployment aborted. Webhooks не работают!
Видео не будут доставляться в чат.

<b>Действия:</b>
1. <code>ssh prod999 'docker logs 999-multibots --tail 50'</code>
2. <code>ssh prod999 'nginx -t && systemctl reload nginx'</code>
3. <code>curl -X POST http://188.137.250.69:3001/api/video-callback</code>"
  fi

  echo -e "${RED}❌ DEPLOYMENT ABORTED - Webhook не работает!${NC}"
  echo "   Без webhook бот бесполезен. Проверьте логи:"
  if [ "$ENV" = "dev" ] || [ "$ENV" = "development" ]; then
    docker logs $CONTAINER_NAME --tail 100
  else
    echo "   ssh $SSH_ALIAS 'docker logs $CONTAINER_NAME --tail 100'"
  fi
  exit 1
fi

echo ""
echo "======================================"
echo -e "${GREEN}🎉 DEPLOYMENT SUCCESSFUL!${NC}"
echo "======================================"
echo ""
echo "Environment: $ENV"
echo "URL: http://$SSH_HOST:$PORT"
echo "Container: $CONTAINER_NAME"
echo ""

if [ "$ENV" != "dev" ] && [ "$ENV" != "development" ]; then
  echo "Полезные команды:"
  echo "  ssh $SSH_ALIAS 'docker logs $CONTAINER_NAME --tail 100 -f'"
  echo "  ssh $SSH_ALIAS 'docker exec -it $CONTAINER_NAME bash'"
  echo "  ssh $SSH_ALIAS 'docker restart $CONTAINER_NAME'"
else
  echo "Полезные команды:"
  echo "  docker logs $CONTAINER_NAME --tail 100 -f"
  echo "  docker exec -it $CONTAINER_NAME bash"
  echo "  docker restart $CONTAINER_NAME"
fi
echo ""
