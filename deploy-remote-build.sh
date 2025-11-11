#!/bin/bash
# 🚀 Remote Build & Deploy - собираем Docker прямо на production
set -e

echo "🚀 REMOTE BUILD & DEPLOY"
echo "======================================"
echo ""

# 1. Проверка TypeScript
echo "1️⃣ Type check..."
npm run typecheck
echo "✅ TypeScript: 0 errors"
echo ""

# 2. Sync code to production
echo "2️⃣ Syncing code to production..."
rsync -avz --delete \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='.env*' \
  --exclude='*.log' \
  --exclude='tests' \
  --exclude='docs' \
  ./ prod999:/root/999-agents-telegraf/

echo "✅ Code synced"
echo ""

# 3. Build Docker на production
echo "3️⃣ Building Docker on production..."
echo "   (займёт 3-5 минут)"
echo ""

ssh prod999 'bash -s' << 'ENDSSH'
cd /root/999-agents-telegraf

echo "📦 СТАРТ BUILD: $(date +%H:%M:%S)"
START=$(date +%s)

# BuildKit для скорости
export DOCKER_BUILDKIT=1

# Собираем
docker build \
  -f Dockerfile.optimized \
  -t 999-multibots:latest \
  --progress=plain \
  . 2>&1 | tail -30

END=$(date +%s)
DURATION=$((END - START))

echo ""
echo "✅ ГОТОВО: $(date +%H:%M:%S)"
echo "⏱️  Время сборки: ${DURATION} секунд ($(($DURATION / 60))м $(($DURATION % 60))с)"
echo ""

# Проверка image
echo "📊 Image info:"
docker images | grep "999-multibots"
ENDSSH

echo ""
echo "✅ Docker build completed on production"
echo ""

# 4. Stop old container & Start new
echo "4️⃣ Deploying..."

ssh prod999 'bash -s' << 'ENDSSH'
cd /root/999-agents-telegraf

# Stop & remove old container
docker stop 999-multibots 2>/dev/null || true
docker rm 999-multibots 2>/dev/null || true

# Start new container
docker run -d \
  --name 999-multibots \
  --restart=always \
  -p 3001:3001 \
  -v /root/999-agents-telegraf/.env:/app/.env:ro \
  999-multibots:latest

echo "✅ Container started"
echo ""
echo "📊 Container status:"
docker ps | grep 999-multibots
ENDSSH

echo ""
echo "✅ Container deployed"
echo ""

# 5. Health check
echo "5️⃣ Health check (wait 10s)..."
sleep 10

HEALTH_URL="http://188.137.250.69:3001/health"
if curl -f -s "$HEALTH_URL" > /dev/null 2>&1; then
  echo "✅ Health check PASSED: $HEALTH_URL"
  echo ""
  curl -s "$HEALTH_URL" | head -5
else
  echo "❌ Health check FAILED"
  echo "   Checking logs..."
  ssh prod999 "docker logs 999-multibots --tail 50"
  exit 1
fi

echo ""
echo "======================================"
echo "🎉 DEPLOYMENT SUCCESSFUL!"
echo "======================================"
echo ""
echo "Production URL: http://188.137.250.69:3001"
echo "Health check: http://188.137.250.69:3001/health"
echo ""
echo "Полезные команды:"
echo "  ssh prod999 'docker logs 999-multibots --tail 100 -f'"
echo "  ssh prod999 'docker exec -it 999-multibots bash'"
echo "  ssh prod999 'docker restart 999-multibots'"
echo ""
