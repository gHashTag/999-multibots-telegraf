#!/bin/bash

# Automated Production Deployment Script
# This script handles container recreation and webhook setup automatically

set -e

echo "🚀 Starting Automated Production Deployment..."

# Configuration
CONTAINER_NAME="999-multibots"
IMAGE_NAME="999-agents-vibecoder_app"
ENV_FILE=".env"
BACKUP_DIR="/opt/backups/$(date +%Y%m%d_%H%M%S)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

warning() {
    echo -e "${YELLOW}⚠️ $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
    exit 1
}

# Pre-deployment checks
pre_deploy_checks() {
    log "Running pre-deployment checks..."
    
    # Check if Docker is running
    if ! docker --version > /dev/null 2>&1; then
        error "Docker is not installed or not running"
    fi
    
    # Check if env file exists
    if [ ! -f "$ENV_FILE" ]; then
        error "Environment file $ENV_FILE not found"
    fi
    
    # Check if image exists
    if ! docker images | grep -q "$IMAGE_NAME"; then
        warning "Image $IMAGE_NAME not found locally, will build if Dockerfile exists"
    fi
    
    success "Pre-deployment checks passed"
}

# Create backup
create_backup() {
    log "Creating backup..."
    
    mkdir -p "$BACKUP_DIR"
    
    # Backup current container if exists
    if docker ps -a --format "table {{.Names}}" | grep -q "^$CONTAINER_NAME$"; then
        log "Backing up current container logs..."
        docker logs "$CONTAINER_NAME" > "$BACKUP_DIR/container.log" 2>&1 || true
        
        log "Backing up current container environment..."
        docker exec "$CONTAINER_NAME" printenv > "$BACKUP_DIR/container.env" 2>&1 || true
    fi
    
    # Backup env file
    cp "$ENV_FILE" "$BACKUP_DIR/" || true
    
    success "Backup created at $BACKUP_DIR"
}

# Stop and remove old container
stop_old_container() {
    log "Stopping old container..."
    
    if docker ps --format "table {{.Names}}" | grep -q "^$CONTAINER_NAME$"; then
        log "Stopping running container $CONTAINER_NAME..."
        docker stop "$CONTAINER_NAME" || true
    fi
    
    if docker ps -a --format "table {{.Names}}" | grep -q "^$CONTAINER_NAME$"; then
        log "Removing container $CONTAINER_NAME..."
        docker rm "$CONTAINER_NAME" || true
    fi
    
    success "Old container stopped and removed"
}

# Build image if needed
build_image() {
    log "Checking if image build is needed..."
    
    if [ -f "Dockerfile" ] && [ ! "$(docker images -q $IMAGE_NAME 2> /dev/null)" ]; then
        log "Building Docker image $IMAGE_NAME..."
        docker build -t "$IMAGE_NAME" .
        success "Image built successfully"
    else
        log "Using existing image $IMAGE_NAME"
    fi
}

# Start new container
start_new_container() {
    log "Starting new container..."
    
    # Verify WEBHOOK_DOMAIN is set to HTTP (not HTTPS)
    if grep -q "WEBHOOK_DOMAIN=https" "$ENV_FILE"; then
        warning "WEBHOOK_DOMAIN is set to HTTPS, correcting to HTTP..."
        sed -i 's|WEBHOOK_DOMAIN=https://test-render-farm.ru|WEBHOOK_DOMAIN=http://test-render-farm.ru|g' "$ENV_FILE"
    fi
    
    docker run -d --name "$CONTAINER_NAME" \
        --env-file "$ENV_FILE" \
        -e NODE_ENV=production \
        -e TEST_BOT_NAME= \
        -p 2999:2999 -p 3000:3000 -p 3001:3001 -p 3002:3002 \
        -p 3003:3003 -p 3004:3004 -p 3005:3005 -p 3006:3006 \
        -p 3007:3007 -p 3008:3008 -p 3009:3009 -p 3010:3010 \
        --restart unless-stopped \
        "$IMAGE_NAME"
    
    success "New container started"
}

# Wait for container to be ready
wait_for_container() {
    log "Waiting for container to be ready..."
    
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if docker ps --format "table {{.Names}}" | grep -q "^$CONTAINER_NAME$"; then
            log "Container is running, checking health..."
            
            # Check if API is responding
            if docker exec "$CONTAINER_NAME" curl -f -s http://localhost:2999 > /dev/null 2>&1; then
                success "Container is healthy and ready"
                return 0
            fi
        fi
        
        log "Waiting... (attempt $attempt/$max_attempts)"
        sleep 10
        attempt=$((attempt + 1))
    done
    
    error "Container failed to become ready within expected time"
}

# Verify webhook setup
verify_webhooks() {
    log "Verifying webhook setup..."
    
    # Get bot tokens
    local tokens=$(docker exec "$CONTAINER_NAME" printenv | grep "BOT_TOKEN_[0-9]" | head -6)
    
    if [ -z "$tokens" ]; then
        warning "No bot tokens found"
        return
    fi
    
    echo "$tokens" | while IFS= read -r line; do
        local token_name=$(echo "$line" | cut -d'=' -f1)
        local token_value=$(echo "$line" | cut -d'=' -f2)
        
        if [ ! -z "$token_value" ]; then
            log "Checking webhook for $token_name..."
            
            local webhook_info=$(curl -s "https://api.telegram.org/bot$token_value/getWebhookInfo")
            local webhook_url=$(echo "$webhook_info" | jq -r '.result.url' 2>/dev/null || echo "")
            
            if [ "$webhook_url" = "" ] || [ "$webhook_url" = "null" ]; then
                warning "Webhook not set for $token_name"
            else
                success "Webhook configured for $token_name: $webhook_url"
            fi
        fi
    done
}

# Show deployment status
show_status() {
    log "Deployment Status:"
    echo "===================="
    
    # Container status
    echo "📦 Container Status:"
    docker ps --filter "name=$CONTAINER_NAME" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    echo
    
    # Recent logs
    echo "📋 Recent Logs:"
    docker logs "$CONTAINER_NAME" --tail 10
    echo
    
    # Environment check
    echo "🔧 Environment:"
    docker exec "$CONTAINER_NAME" printenv | grep -E "(NODE_ENV|WEBHOOK_DOMAIN)" || true
    echo
    
    success "Deployment completed successfully!"
}

# Rollback function
rollback() {
    error "Deployment failed! Attempting rollback..."
    
    if [ -d "$BACKUP_DIR" ]; then
        log "Rolling back to previous configuration..."
        
        # Stop failed container
        docker stop "$CONTAINER_NAME" || true
        docker rm "$CONTAINER_NAME" || true
        
        # Restore env file
        if [ -f "$BACKUP_DIR/$ENV_FILE" ]; then
            cp "$BACKUP_DIR/$ENV_FILE" ./
        fi
        
        # Note: This is a simplified rollback
        # In a production environment, you might want to restore the previous image
        
        error "Rollback completed. Please check the logs and try again."
    else
        error "No backup found for rollback"
    fi
}

# Cleanup old backups (keep last 5)
cleanup_old_backups() {
    log "Cleaning up old backups..."
    
    local backup_base_dir="/opt/backups"
    if [ -d "$backup_base_dir" ]; then
        # Keep only the 5 most recent backup directories
        ls -dt "$backup_base_dir"/*/ 2>/dev/null | tail -n +6 | xargs rm -rf || true
        success "Old backups cleaned up"
    fi
}

# Main deployment process
main() {
    # Set up error handling
    trap rollback ERR
    
    echo "🚀 999-Agents Telegraf - Automated Production Deployment"
    echo "======================================================="
    
    pre_deploy_checks
    create_backup
    stop_old_container
    build_image
    start_new_container
    wait_for_container
    verify_webhooks
    show_status
    cleanup_old_backups
    
    # Disable error trap as we succeeded
    trap - ERR
    
    echo
    success "🎉 Deployment completed successfully!"
    log "You can monitor the application with: docker logs -f $CONTAINER_NAME"
}

# Run main function
main "$@"