#!/bin/bash

# Health check script for Docker container
# This script verifies that the application is running correctly

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[HEALTHCHECK]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[HEALTHCHECK]${NC} $1"
}

error() {
    echo -e "${RED}[HEALTHCHECK]${NC} $1"
    exit 1
}

# Check if main process is running
check_process() {
    log "Checking main process..."
    
    if pgrep -f "node.*dist/bot.js" > /dev/null; then
        log "✅ Main process is running"
        return 0
    else
        error "❌ Main process not found"
    fi
}

# Check API server health endpoint
check_api_health() {
    log "Checking API health endpoint..."
    
    local max_attempts=3
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -f -s http://localhost:2999/health > /dev/null 2>&1; then
            log "✅ API health endpoint responding"
            return 0
        fi
        
        warn "Attempt $attempt/$max_attempts failed, retrying..."
        sleep 2
        attempt=$((attempt + 1))
    done
    
    error "❌ API health endpoint not responding"
}

# Check webhook endpoints
check_webhook_endpoints() {
    log "Checking webhook endpoints..."
    
    local ports=(3001 3002 3003 3004 3005 3006)
    local healthy_count=0
    
    for port in "${ports[@]}"; do
        if nc -z localhost "$port" 2>/dev/null; then
            log "✅ Port $port is listening"
            healthy_count=$((healthy_count + 1))
        else
            warn "⚠️ Port $port not available"
        fi
    done
    
    if [ $healthy_count -gt 0 ]; then
        log "✅ $healthy_count webhook endpoints available"
        return 0
    else
        error "❌ No webhook endpoints available"
    fi
}

# Check bot tokens environment
check_environment() {
    log "Checking environment configuration..."
    
    if [ -z "$NODE_ENV" ]; then
        warn "⚠️ NODE_ENV not set"
    else
        log "✅ NODE_ENV: $NODE_ENV"
    fi
    
    if [ -z "$WEBHOOK_DOMAIN" ]; then
        warn "⚠️ WEBHOOK_DOMAIN not set"
    else
        log "✅ WEBHOOK_DOMAIN configured"
    fi
    
    # Check for at least one bot token
    local token_count=0
    for i in {1..10}; do
        local token_var="BOT_TOKEN_$i"
        if [ ! -z "${!token_var}" ]; then
            token_count=$((token_count + 1))
        fi
    done
    
    if [ $token_count -gt 0 ]; then
        log "✅ $token_count bot tokens configured"
        return 0
    else
        error "❌ No bot tokens found"
    fi
}

# Check memory usage
check_memory() {
    log "Checking memory usage..."
    
    local memory_info=$(cat /proc/meminfo)
    local mem_total=$(echo "$memory_info" | grep MemTotal | awk '{print $2}')
    local mem_available=$(echo "$memory_info" | grep MemAvailable | awk '{print $2}')
    
    if [ -n "$mem_total" ] && [ -n "$mem_available" ]; then
        local mem_used=$((mem_total - mem_available))
        local mem_percentage=$((mem_used * 100 / mem_total))
        
        log "Memory usage: ${mem_percentage}%"
        
        if [ $mem_percentage -gt 90 ]; then
            warn "⚠️ High memory usage: ${mem_percentage}%"
        else
            log "✅ Memory usage acceptable: ${mem_percentage}%"
        fi
    else
        warn "⚠️ Could not determine memory usage"
    fi
}

# Main health check routine
main() {
    log "Starting health check..."
    
    check_process
    check_environment
    check_api_health
    check_webhook_endpoints
    check_memory
    
    log "🎉 Health check completed successfully"
    exit 0
}

# Run main function
main "$@"