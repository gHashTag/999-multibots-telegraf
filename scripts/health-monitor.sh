#!/bin/bash

# Production Health Monitoring and Rollback System
# Continuously monitors deployment health and performs automatic rollbacks

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTAINER_NAME="999-multibots"
HEALTH_CHECK_INTERVAL=30
MAX_FAILURE_COUNT=3
ROLLBACK_TIMEOUT=300
BACKUP_DIR="/opt/backups"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')] [HEALTH]${NC} $1"
}

success() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] ✅${NC} $1"
}

warning() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] ⚠️${NC} $1"
}

error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ❌${NC} $1"
}

# Health check functions
check_container_status() {
    if docker ps --filter "name=$CONTAINER_NAME" --filter "status=running" | grep -q "$CONTAINER_NAME"; then
        return 0
    else
        return 1
    fi
}

check_api_health() {
    if curl -f -s http://localhost:2999/health > /dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

check_webhook_endpoints() {
    local healthy_count=0
    local required_count=3  # Minimum number of healthy webhooks required
    
    for port in {3001..3006}; do
        if nc -z localhost "$port" 2>/dev/null; then
            healthy_count=$((healthy_count + 1))
        fi
    done
    
    if [ $healthy_count -ge $required_count ]; then
        return 0
    else
        return 1
    fi
}

check_bot_responsiveness() {
    # Get first available bot token
    local token=$(docker exec "$CONTAINER_NAME" printenv | grep "BOT_TOKEN_1" | cut -d'=' -f2 2>/dev/null || echo "")
    
    if [ -z "$token" ]; then
        return 1
    fi
    
    # Check webhook status
    local webhook_info=$(curl -s "https://api.telegram.org/bot$token/getWebhookInfo" 2>/dev/null || echo "")
    local webhook_url=$(echo "$webhook_info" | jq -r '.result.url' 2>/dev/null || echo "")
    
    if [ "$webhook_url" != "" ] && [ "$webhook_url" != "null" ]; then
        return 0
    else
        return 1
    fi
}

check_memory_usage() {
    local container_memory=$(docker stats --no-stream --format "table {{.MemPerc}}" "$CONTAINER_NAME" 2>/dev/null | tail -1 | sed 's/%//' || echo "0")
    
    if [ "${container_memory%.*}" -lt 90 ]; then
        return 0
    else
        return 1
    fi
}

# Comprehensive health check
perform_health_check() {
    local health_score=0
    local max_score=5
    
    log "Performing comprehensive health check..."
    
    # Container status check
    if check_container_status; then
        success "Container is running"
        health_score=$((health_score + 1))
    else
        error "Container is not running"
    fi
    
    # API health check
    if check_api_health; then
        success "API server is healthy"
        health_score=$((health_score + 1))
    else
        error "API server is not responding"
    fi
    
    # Webhook endpoints check
    if check_webhook_endpoints; then
        success "Webhook endpoints are available"
        health_score=$((health_score + 1))
    else
        error "Insufficient webhook endpoints available"
    fi
    
    # Bot responsiveness check
    if check_bot_responsiveness; then
        success "Bot webhooks are configured"
        health_score=$((health_score + 1))
    else
        error "Bot webhooks are not properly configured"
    fi
    
    # Memory usage check
    if check_memory_usage; then
        success "Memory usage is normal"
        health_score=$((health_score + 1))
    else
        warning "High memory usage detected"
    fi
    
    local health_percentage=$((health_score * 100 / max_score))
    log "Health score: $health_score/$max_score ($health_percentage%)"
    
    # Return 0 if health is acceptable (60% or higher)
    if [ $health_percentage -ge 60 ]; then
        return 0
    else
        return 1
    fi
}

# Find latest backup
find_latest_backup() {
    local latest_backup=$(find "$BACKUP_DIR" -maxdepth 1 -type d -name "*_*" | sort -r | head -1)
    echo "$latest_backup"
}

# Rollback to previous version
perform_rollback() {
    log "🔄 Initiating rollback procedure..."
    
    local latest_backup=$(find_latest_backup)
    
    if [ -z "$latest_backup" ] || [ ! -d "$latest_backup" ]; then
        error "No backup found for rollback"
        return 1
    fi
    
    log "Using backup: $latest_backup"
    
    # Stop current container
    log "Stopping current container..."
    docker stop "$CONTAINER_NAME" || true
    docker rm "$CONTAINER_NAME" || true
    
    # Restore environment file
    if [ -f "$latest_backup/.env" ]; then
        log "Restoring environment configuration..."
        cp "$latest_backup/.env" ./
    fi
    
    # Get the previous image (if available)
    local previous_image="999-agents-vibecoder_app"
    
    # Start container with previous configuration
    log "Starting container with rollback configuration..."
    docker run -d --name "$CONTAINER_NAME" \
        --env-file .env \
        -e NODE_ENV=production \
        -e TEST_BOT_NAME= \
        -p 2999:2999 -p 3000:3000 -p 3001:3001 -p 3002:3002 \
        -p 3003:3003 -p 3004:3004 -p 3005:3005 -p 3006:3006 \
        -p 3007:3007 -p 3008:3008 -p 3009:3009 -p 3010:3010 \
        --restart unless-stopped \
        "$previous_image"
    
    # Wait for container to start
    log "Waiting for rollback container to stabilize..."
    sleep 30
    
    # Verify rollback success
    if perform_health_check; then
        success "🎉 Rollback completed successfully"
        
        # Log rollback event
        echo "$(date '+%Y-%m-%d %H:%M:%S') ROLLBACK SUCCESS: Restored from $latest_backup" >> /var/log/deployment-rollbacks.log
        
        return 0
    else
        error "💥 Rollback failed - manual intervention required"
        
        # Log rollback failure
        echo "$(date '+%Y-%m-%d %H:%M:%S') ROLLBACK FAILED: Could not restore from $latest_backup" >> /var/log/deployment-rollbacks.log
        
        return 1
    fi
}

# Send alert notification
send_alert() {
    local alert_type="$1"
    local message="$2"
    
    log "Sending alert: $alert_type - $message"
    
    # Log to system log
    echo "$(date '+%Y-%m-%d %H:%M:%S') ALERT [$alert_type]: $message" >> /var/log/deployment-alerts.log
    
    # Send webhook notification (if configured)
    if [ ! -z "$ALERT_WEBHOOK_URL" ]; then
        curl -X POST "$ALERT_WEBHOOK_URL" \
            -H "Content-Type: application/json" \
            -d "{\"alert_type\":\"$alert_type\",\"message\":\"$message\",\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"server\":\"$(hostname)\"}" \
            > /dev/null 2>&1 || true
    fi
    
    # Send email notification (if configured)
    if [ ! -z "$ALERT_EMAIL" ] && command -v mail > /dev/null 2>&1; then
        echo "$message" | mail -s "🚨 999-Agents Alert: $alert_type" "$ALERT_EMAIL" || true
    fi
}

# Main monitoring loop
monitor_deployment() {
    local failure_count=0
    
    log "🔍 Starting deployment health monitoring..."
    log "Health check interval: ${HEALTH_CHECK_INTERVAL}s"
    log "Max failure count: $MAX_FAILURE_COUNT"
    
    while true; do
        if perform_health_check; then
            if [ $failure_count -gt 0 ]; then
                success "🎯 Health restored after $failure_count failed checks"
                send_alert "RECOVERY" "Deployment health restored"
                failure_count=0
            fi
        else
            failure_count=$((failure_count + 1))
            warning "Health check failed ($failure_count/$MAX_FAILURE_COUNT)"
            
            if [ $failure_count -eq 1 ]; then
                send_alert "WARNING" "First health check failure detected"
            elif [ $failure_count -eq 2 ]; then
                send_alert "CRITICAL" "Multiple health check failures - rollback imminent"
            elif [ $failure_count -ge $MAX_FAILURE_COUNT ]; then
                error "Maximum failure count reached - initiating rollback"
                send_alert "ROLLBACK" "Automatic rollback initiated due to health check failures"
                
                if perform_rollback; then
                    send_alert "SUCCESS" "Automatic rollback completed successfully"
                    failure_count=0
                else
                    send_alert "FAILURE" "Automatic rollback failed - manual intervention required"
                    error "💥 Rollback failed - exiting monitor"
                    exit 1
                fi
            fi
        fi
        
        sleep $HEALTH_CHECK_INTERVAL
    done
}

# One-time health check
check_once() {
    log "Performing one-time health check..."
    
    if perform_health_check; then
        success "🎉 Deployment is healthy"
        exit 0
    else
        error "💥 Deployment health issues detected"
        exit 1
    fi
}

# Manual rollback trigger
manual_rollback() {
    log "🔄 Manual rollback requested..."
    
    if perform_rollback; then
        success "🎉 Manual rollback completed"
        exit 0
    else
        error "💥 Manual rollback failed"
        exit 1
    fi
}

# Usage information
show_usage() {
    echo "Usage: $0 [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  monitor    Start continuous health monitoring (default)"
    echo "  check      Perform one-time health check"
    echo "  rollback   Perform manual rollback"
    echo "  status     Show current deployment status"
    echo "  help       Show this help"
    echo ""
    echo "Environment Variables:"
    echo "  HEALTH_CHECK_INTERVAL   Health check interval in seconds (default: 30)"
    echo "  MAX_FAILURE_COUNT       Max failures before rollback (default: 3)"
    echo "  ALERT_WEBHOOK_URL       Webhook URL for alerts"
    echo "  ALERT_EMAIL             Email for alerts"
    echo ""
    echo "Examples:"
    echo "  $0                     # Start monitoring"
    echo "  $0 check              # One-time health check"
    echo "  $0 rollback           # Manual rollback"
}

# Show deployment status
show_status() {
    log "📊 Current Deployment Status"
    echo "============================="
    
    # Container status
    if check_container_status; then
        echo "✅ Container: Running"
    else
        echo "❌ Container: Not running"
    fi
    
    # API status
    if check_api_health; then
        echo "✅ API Server: Healthy"
    else
        echo "❌ API Server: Unhealthy"
    fi
    
    # Webhook status
    if check_webhook_endpoints; then
        echo "✅ Webhooks: Available"
    else
        echo "❌ Webhooks: Issues detected"
    fi
    
    # Bot status
    if check_bot_responsiveness; then
        echo "✅ Bot Configuration: Configured"
    else
        echo "❌ Bot Configuration: Issues detected"
    fi
    
    # Memory status
    if check_memory_usage; then
        echo "✅ Memory Usage: Normal"
    else
        echo "⚠️ Memory Usage: High"
    fi
    
    echo ""
    echo "Latest backup: $(find_latest_backup || echo 'None found')"
    echo "Logs: /var/log/deployment-alerts.log"
}

# Main command handling
case "${1:-monitor}" in
    monitor)
        monitor_deployment
        ;;
    check)
        check_once
        ;;
    rollback)
        manual_rollback
        ;;
    status)
        show_status
        ;;
    help|--help|-h)
        show_usage
        ;;
    *)
        error "Unknown command: $1"
        show_usage
        exit 1
        ;;
esac