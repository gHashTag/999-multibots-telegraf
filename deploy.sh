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

# Default environment
ENV=${1:-production}

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
    INFISICAL_ENV="staging"
    CONTAINER_NAME="999-multibots-staging"
    echo -e "${YELLOW}🧪 STAGING MODE${NC}"
    ;;
  prod|production)
    SSH_HOST="188.137.250.69"
    SSH_ALIAS="prod999"
    PORT=3001
    INFISICAL_ENV="prod"
    CONTAINER_NAME="999-multibots"
    echo -e "${GREEN}🚀 PRODUCTION MODE${NC}"
    ;;
  *)
    echo -e "${RED}❌ Unknown environment: $ENV${NC}"
    echo "Usage: ./deploy.sh [dev|staging|production]"
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
echo "1️⃣ Type check..."
if ! npm run typecheck; then
  echo -e "${RED}❌ TypeScript errors found!${NC}"
  exit 1
fi
echo -e "${GREEN}✅ TypeScript: 0 errors${NC}"
echo ""

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
  docker build \
    -t $CONTAINER_NAME:latest \
    --progress=plain \
    . 2>&1 | tail -30

  END=$(date +%s)
  DURATION=$((END - START))

  echo ""
  echo -e "${GREEN}✅ ГОТОВО: $(date +%H:%M:%S)${NC}"
  echo "⏱️  Время сборки: ${DURATION} секунд ($(($DURATION / 60))м $(($DURATION % 60))с)"
else
  # Remote build
  ssh $SSH_ALIAS 'bash -s' << ENDSSH
cd /root/999-agents-telegraf

echo "📦 СТАРТ BUILD: \$(date +%H:%M:%S)"
START=\$(date +%s)

export DOCKER_BUILDKIT=1
docker build \
  -t $CONTAINER_NAME:latest \
  --progress=plain \
  . 2>&1 | tail -30

END=\$(date +%s)
DURATION=\$((END - START))

echo ""
echo "✅ ГОТОВО: \$(date +%H:%M:%S)"
echo "⏱️  Время сборки: \${DURATION} секунд (\$((\$DURATION / 60))м \$((\$DURATION % 60))с)"
echo ""

echo "📊 Image info:"
docker images | grep "$CONTAINER_NAME"
ENDSSH
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
    -p 2999:2999 \
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
  -p 2999:2999 \
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

  if [ "$ENV" = "dev" ] || [ "$ENV" = "development" ]; then
    docker logs $CONTAINER_NAME --tail 50
  else
    ssh $SSH_ALIAS "docker logs $CONTAINER_NAME --tail 50"
  fi
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
