#!/bin/bash
# deploy-local-build.sh - Complete Local Build + Remote Deploy Workflow
# 🚀 DevOps Automation: Build locally, deploy remotely, monitor constantly

set -e  # Exit on any error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"
IMAGE_NAME="999-multibots"
SERVER="188.137.250.69"
SERVER_USER="root"

echo "🚀 Starting deployment workflow..."
echo "=================================="

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
success() { echo -e "${GREEN}✅ $1${NC}"; }
error() { echo -e "${RED}❌ $1${NC}"; exit 1; }
warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
info() { echo -e "${BLUE}ℹ️  $1${NC}"; }

# Step 1: Prerequisites
info "Checking prerequisites..."

# Git status
if [[ -n $(git status --porcelain) ]]; then
  warning "Uncommitted changes detected."
  read -p "Continue anyway? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    error "Deployment cancelled by user"
  fi
fi

# Docker daemon
if ! docker info > /dev/null 2>&1; then
  error "Docker daemon is not running"
fi

# SSH access
if ! ssh -o ConnectTimeout=5 "$SERVER_USER@$SERVER" 'echo ok' > /dev/null 2>&1; then
  error "Cannot connect to server $SERVER"
fi

# Dockerfile.optimized exists
if [ ! -f "Dockerfile.optimized" ]; then
  error "Dockerfile.optimized not found"
fi

success "Prerequisites passed"

# Step 2: Type check
info "Running type check..."
if ! npm run typecheck; then
  error "Type check failed - fix errors before deployment"
fi
success "Type check passed"

# Step 3: Build Docker image
info "Building Docker image locally with BuildKit..."
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

BUILD_TAG="$(date +%Y%m%d-%H%M%S)"

if ! docker build \
  --file Dockerfile.optimized \
  --tag "$IMAGE_NAME:latest" \
  --tag "$IMAGE_NAME:$BUILD_TAG" \
  --build-arg BUILDKIT_INLINE_CACHE=1 \
  --progress=plain \
  .; then
  error "Docker build failed"
fi
success "Docker image built (tagged: latest, $BUILD_TAG)"

# Step 4: Save as tar
info "Saving image as compressed tar..."
docker save "$IMAGE_NAME:latest" | gzip > "$IMAGE_NAME-latest.tar.gz"
SIZE=$(du -h "$IMAGE_NAME-latest.tar.gz" | cut -f1)
info "Image size: $SIZE"
success "Image saved"

# Step 5: Transfer to server
info "Transferring image to production server..."
if ! scp -C "$IMAGE_NAME-latest.tar.gz" "$SERVER_USER@$SERVER:/tmp/"; then
  rm "$IMAGE_NAME-latest.tar.gz"
  error "Image transfer failed"
fi
success "Image transferred ($SIZE)"

# Step 6: Deploy on server
info "Deploying on server..."
if ! ssh "$SERVER_USER@$SERVER" bash << 'ENDSSH'
  set -e
  cd /tmp

  echo "📦 Loading Docker image..."
  docker load < 999-multibots-latest.tar.gz

  echo "💾 Backing up current container..."
  docker commit 999-multibots 999-multibots:rollback 2>/dev/null || echo "No previous container to backup"

  echo "⏹️  Stopping old container..."
  docker stop 999-multibots 2>/dev/null || echo "No container to stop"
  docker rm 999-multibots 2>/dev/null || echo "No container to remove"

  echo "▶️  Starting new container..."
  docker run -d \
    --name 999-multibots \
    --restart=always \
    -p 3001:3001 \
    -v /root/999-agents-telegraf/.env:/app/.env:ro \
    -v /root/999-agents-telegraf/uploads:/app/uploads \
    -v /root/999-agents-telegraf/logs:/app/logs \
    999-multibots:latest

  echo "🧹 Cleaning up..."
  rm 999-multibots-latest.tar.gz

  echo "✅ Container started"
ENDSSH
then
  rm "$IMAGE_NAME-latest.tar.gz"
  error "Deployment failed on server"
fi

# Cleanup local tar
rm "$IMAGE_NAME-latest.tar.gz"
success "Deployment successful"

# Step 7: Health check
info "Running health check (waiting 10s for initialization)..."
sleep 10

HEALTH_PASSED=false

if ssh "$SERVER_USER@$SERVER" bash << 'ENDSSH'
  HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/health)

  if [ "$HEALTH_STATUS" = "200" ]; then
    echo "✅ Health check passed"
    exit 0
  else
    echo "❌ Health check failed (HTTP $HEALTH_STATUS)"
    echo "🔄 Rolling back to previous version..."

    docker stop 999-multibots 2>/dev/null
    docker rm 999-multibots 2>/dev/null

    if docker images -q 999-multibots:rollback > /dev/null 2>&1; then
      docker run -d \
        --name 999-multibots \
        --restart=always \
        -p 3001:3001 \
        -v /root/999-agents-telegraf/.env:/app/.env:ro \
        -v /root/999-agents-telegraf/uploads:/app/uploads \
        -v /root/999-agents-telegraf/logs:/app/logs \
        999-multibots:rollback

      echo "✅ Rolled back to previous version"
    else
      echo "⚠️  No rollback image available"
    fi

    exit 1
  fi
ENDSSH
then
  HEALTH_PASSED=true
  success "Health check passed"
else
  warning "Health check failed - automatic rollback executed"
  HEALTH_PASSED=false
fi

# Step 8: Show logs
info "Recent application logs:"
echo "=================================="
ssh "$SERVER_USER@$SERVER" 'docker logs 999-multibots --tail 30 2>&1'
echo "=================================="

if [ "$HEALTH_PASSED" = true ]; then
  echo ""
  success "🎉 Deployment completed successfully!"
  info "Server: http://$SERVER:3001"
  info "Health: http://$SERVER:3001/health"
else
  echo ""
  warning "Deployment completed but health check failed"
  info "Check logs and try again"
  exit 1
fi
