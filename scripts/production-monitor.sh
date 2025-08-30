#!/bin/bash

# 🔍 PRODUCTION MONITORING SYSTEM
# Monitors critical bot infrastructure and prevents issues from recurring
# Designed to prevent the nginx port mismatch and bot responsiveness issues

set -e

# Configuration
SERVER="185.161.67.53"
SSH_KEY="~/.ssh/selectel"
TELEGRAM_WEBHOOK_BOT_TOKEN="${MONITORING_BOT_TOKEN:-}"
ALERT_CHAT_ID="${ALERT_CHAT_ID:-}"
CHECK_INTERVAL=${CHECK_INTERVAL:-300}  # 5 minutes
LOG_FILE="/tmp/production-monitor.log"
STATUS_FILE="/tmp/production-status.json"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    local message="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
    echo -e "${BLUE}$message${NC}"
    echo "$message" >> "$LOG_FILE"
}

success() {
    local message="✅ $1"
    echo -e "${GREEN}$message${NC}"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $message" >> "$LOG_FILE"
}

warning() {
    local message="⚠️ $1"
    echo -e "${YELLOW}$message${NC}"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $message" >> "$LOG_FILE"
}

error() {
    local message="❌ $1"
    echo -e "${RED}$message${NC}"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $message" >> "$LOG_FILE"
}

# Send alert to Telegram
send_alert() {
    local message="🚨 PRODUCTION ALERT 🚨\n\n$1\n\nTime: $(date)\nServer: $SERVER"
    
    if [[ -n "$TELEGRAM_WEBHOOK_BOT_TOKEN" && -n "$ALERT_CHAT_ID" ]]; then
        curl -s -X POST "https://api.telegram.org/bot$TELEGRAM_WEBHOOK_BOT_TOKEN/sendMessage" \
             -d "chat_id=$ALERT_CHAT_ID" \
             -d "text=$message" \
             -d "parse_mode=HTML" > /dev/null 2>&1
    else
        log "Alert: $message"
    fi
}

# Check if container is running
check_container_status() {
    log "Checking container status..."
    
    local container_status
    container_status=$(ssh -i "$SSH_KEY" root@"$SERVER" 'docker ps --filter name=999-multibots --format "{{.Status}}"' 2>/dev/null || echo "")
    
    if [[ -z "$container_status" ]]; then
        error "Container 999-multibots is not running"
        send_alert "Container 999-multibots is DOWN! Immediate attention required."
        return 1
    elif [[ "$container_status" == *"Up"* ]]; then
        success "Container is running: $container_status"
        return 0
    else
        warning "Container status unclear: $container_status"
        return 1
    fi
}

# Check nginx port configuration
check_nginx_config() {
    log "Checking nginx port configuration..."
    
    local nginx_config
    nginx_config=$(ssh -i "$SSH_KEY" root@"$SERVER" 'docker exec bot-proxy grep "proxy_pass.*localhost:" /etc/nginx/conf.d/default.conf | head -1' 2>/dev/null || echo "")
    
    if [[ "$nginx_config" == *"localhost:2999"* ]]; then
        success "nginx correctly configured for port 2999"
        return 0
    elif [[ "$nginx_config" == *"localhost:1980"* ]]; then
        error "nginx MISCONFIGURED: pointing to port 1980 instead of 2999"
        send_alert "CRITICAL: nginx pointing to wrong port 1980 instead of 2999. Bots will be unreachable!"
        
        # Auto-fix if enabled
        if [[ "${AUTO_FIX_NGINX:-false}" == "true" ]]; then
            log "Auto-fixing nginx configuration..."
            ssh -i "$SSH_KEY" root@"$SERVER" '
                docker exec bot-proxy sed -i "s|proxy_pass http://localhost:1980|proxy_pass http://localhost:2999|g" /etc/nginx/conf.d/default.conf
                docker exec bot-proxy nginx -s reload
            '
            success "nginx configuration auto-fixed"
        fi
        return 1
    else
        warning "nginx configuration unclear: $nginx_config"
        return 1
    fi
}

# Check API server accessibility
check_api_server() {
    log "Checking API server accessibility..."
    
    local api_status
    api_status=$(ssh -i "$SSH_KEY" root@"$SERVER" 'netstat -tulpn | grep ":2999.*LISTEN"' 2>/dev/null || echo "")
    
    if [[ -n "$api_status" ]]; then
        success "API server listening on port 2999"
        return 0
    else
        error "API server NOT listening on port 2999"
        send_alert "CRITICAL: API server not accessible on port 2999. Check container environment!"
        return 1
    fi
}

# Check bot ports
check_bot_ports() {
    log "Checking bot ports 3001-3010..."
    
    local bot_ports_listening=0
    local expected_ports=10
    
    for port in {3001..3010}; do
        local port_status
        port_status=$(ssh -i "$SSH_KEY" root@"$SERVER" "netstat -tulpn | grep \":$port.*LISTEN\"" 2>/dev/null || echo "")
        
        if [[ -n "$port_status" ]]; then
            bot_ports_listening=$((bot_ports_listening + 1))
        fi
    done
    
    if [[ $bot_ports_listening -eq $expected_ports ]]; then
        success "All $expected_ports bot ports are listening"
        return 0
    else
        warning "Only $bot_ports_listening/$expected_ports bot ports are listening"
        if [[ $bot_ports_listening -lt 5 ]]; then
            send_alert "WARNING: Only $bot_ports_listening/$expected_ports bots are running. Check container health!"
        fi
        return 1
    fi
}

# Check domain accessibility
check_domain_accessibility() {
    log "Checking domain accessibility..."
    
    local http_status
    http_status=$(curl -s -o /dev/null -w "%{http_code}" "http://test-render-farm.ru/" --max-time 10)
    
    if [[ "$http_status" == "200" ]]; then
        success "Domain accessible (HTTP $http_status)"
        return 0
    elif [[ "$http_status" == "502" ]]; then
        error "Domain returns 502 Bad Gateway - nginx/API server issue"
        send_alert "CRITICAL: Domain returning 502 Bad Gateway. Check nginx configuration and API server!"
        return 1
    else
        warning "Domain returns HTTP $http_status"
        return 1
    fi
}

# Check webhook configuration
check_webhook_config() {
    log "Checking webhook configuration..."
    
    local webhooks_configured=0
    local total_tokens=0
    
    # Count configured webhooks
    for i in {1..10}; do
        local token_var="BOT_TOKEN_$i"
        local token
        token=$(ssh -i "$SSH_KEY" root@"$SERVER" "docker exec 999-multibots printenv | grep \"$token_var=\" | cut -d'=' -f2" 2>/dev/null || echo "")
        
        if [[ -n "$token" ]]; then
            total_tokens=$((total_tokens + 1))
            
            local webhook_info
            webhook_info=$(curl -s "https://api.telegram.org/bot$token/getWebhookInfo" | grep -o '"url":"[^"]*"' | cut -d'"' -f4)
            
            if [[ -n "$webhook_info" && "$webhook_info" != "null" && "$webhook_info" != "" ]]; then
                webhooks_configured=$((webhooks_configured + 1))
            fi
        fi
    done
    
    if [[ $webhooks_configured -gt 0 ]]; then
        success "$webhooks_configured/$total_tokens webhooks configured"
        return 0
    else
        warning "No webhooks configured for any bots"
        send_alert "WARNING: No webhooks configured. Bots will not receive messages!"
        return 1
    fi
}

# Check repository path in webhook server
check_webhook_server_config() {
    log "Checking webhook server repository configuration..."
    
    local repo_path
    repo_path=$(ssh -i "$SSH_KEY" root@"$SERVER" 'grep "REPO_PATH" /root/webhook-deploy-server.js 2>/dev/null || echo ""')
    
    if [[ "$repo_path" == *"999-agents-telegraf"* ]]; then
        success "Webhook server correctly configured for 999-agents-telegraf"
        return 0
    elif [[ "$repo_path" == *"999-agents-vibecoder"* ]]; then
        error "Webhook server MISCONFIGURED: pointing to wrong repo 999-agents-vibecoder"
        send_alert "WARNING: Webhook deployment server pointing to wrong repository!"
        return 1
    else
        warning "Webhook server configuration unclear"
        return 1
    fi
}

# Generate status report
generate_status_report() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    local overall_status="healthy"
    local issues=()
    
    # Run all checks and collect results
    check_container_status || { overall_status="degraded"; issues+=("container"); }
    check_nginx_config || { overall_status="critical"; issues+=("nginx"); }
    check_api_server || { overall_status="critical"; issues+=("api_server"); }
    check_bot_ports || { overall_status="degraded"; issues+=("bot_ports"); }
    check_domain_accessibility || { overall_status="critical"; issues+=("domain"); }
    check_webhook_config || { overall_status="degraded"; issues+=("webhooks"); }
    check_webhook_server_config || { overall_status="degraded"; issues+=("webhook_server"); }
    
    # Create JSON status report
    cat > "$STATUS_FILE" << EOF
{
    "timestamp": "$timestamp",
    "overall_status": "$overall_status",
    "issues": [$(IFS=','; echo "\"${issues[*]//,/\",\"}")"],
    "checks": {
        "container": "$(check_container_status >/dev/null 2>&1 && echo "pass" || echo "fail")",
        "nginx": "$(check_nginx_config >/dev/null 2>&1 && echo "pass" || echo "fail")",
        "api_server": "$(check_api_server >/dev/null 2>&1 && echo "pass" || echo "fail")",
        "bot_ports": "$(check_bot_ports >/dev/null 2>&1 && echo "pass" || echo "fail")",
        "domain": "$(check_domain_accessibility >/dev/null 2>&1 && echo "pass" || echo "fail")",
        "webhooks": "$(check_webhook_config >/dev/null 2>&1 && echo "pass" || echo "fail")",
        "webhook_server": "$(check_webhook_server_config >/dev/null 2>&1 && echo "pass" || echo "fail")"
    }
}
EOF
    
    log "Status report generated: $STATUS_FILE"
    echo "Overall Status: $overall_status"
    
    if [[ ${#issues[@]} -gt 0 ]]; then
        echo "Issues detected: ${issues[*]}"
    fi
}

# Continuous monitoring mode
monitor_continuous() {
    log "Starting continuous monitoring (interval: ${CHECK_INTERVAL}s)"
    
    while true; do
        echo "----------------------------------------"
        log "Running monitoring cycle..."
        
        generate_status_report
        
        log "Waiting ${CHECK_INTERVAL} seconds until next check..."
        sleep "$CHECK_INTERVAL"
    done
}

# Main function
main() {
    local mode="${1:-check}"
    
    case "$mode" in
        "check")
            log "Running single monitoring check..."
            generate_status_report
            ;;
        "monitor")
            monitor_continuous
            ;;
        "fix")
            log "Running monitoring with auto-fix enabled..."
            AUTO_FIX_NGINX=true generate_status_report
            ;;
        "install")
            log "Installing monitoring as systemd service..."
            install_monitoring_service
            ;;
        *)
            echo "Usage: $0 {check|monitor|fix|install}"
            echo "  check   - Run single monitoring check"
            echo "  monitor - Run continuous monitoring"
            echo "  fix     - Run monitoring with auto-fix enabled"
            echo "  install - Install as systemd service"
            exit 1
            ;;
    esac
}

# Install as systemd service
install_monitoring_service() {
    log "Installing production monitoring service..."
    
    # Copy script to server
    scp -i "$SSH_KEY" "$0" root@"$SERVER":/usr/local/bin/production-monitor.sh
    ssh -i "$SSH_KEY" root@"$SERVER" 'chmod +x /usr/local/bin/production-monitor.sh'
    
    # Create systemd service
    ssh -i "$SSH_KEY" root@"$SERVER" 'cat > /etc/systemd/system/production-monitor.service << EOF
[Unit]
Description=Production Bot Monitoring System
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/production-monitor.sh monitor
Restart=always
RestartSec=30
User=root

[Install]
WantedBy=multi-user.target
EOF'
    
    # Enable and start service
    ssh -i "$SSH_KEY" root@"$SERVER" '
        systemctl daemon-reload
        systemctl enable production-monitor.service
        systemctl start production-monitor.service
    '
    
    success "Production monitoring service installed and started"
}

# Run main function
main "$@"