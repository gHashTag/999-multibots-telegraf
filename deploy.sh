#!/bin/bash

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

CONTAINER_NAME='999-multibots'
SERVER_URL='212.86.115.30'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }

deploy() {
    log_info '=== DEPLOY START ==='
    
    log_info '1. Updating code...'
    cd /root/999-agents-telegraf
    git fetch origin production
    git reset --hard origin/production
    
    log_info '2. Building Docker image...'
    docker build --no-cache -t 999-agents-telegraf:latest .
    
    log_info '3. Stopping old container...'
    docker stop $CONTAINER_NAME 2>/dev/null || true
    docker rm $CONTAINER_NAME 2>/dev/null || true
    
    log_info '4. Starting new container with PORT 3000...'
    docker run -d       --name $CONTAINER_NAME       --restart unless-stopped       --network app-network       -p 3000:3000       -p 2999-3010:2999-3010       -p 4000:4000       -v $(pwd)/.env:/app/.env:ro       999-agents-telegraf:latest
    
    log_info '5. Checking status...'
    sleep 5
    docker ps | grep $CONTAINER_NAME
    curl -s http://localhost:3000/health || echo 'API not ready yet'
    
    log_success '=== DEPLOY COMPLETE ==='
}

deploy
