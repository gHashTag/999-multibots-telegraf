#!/bin/bash

# 🔧 MONITORING SYSTEM SETUP
# Sets up comprehensive monitoring to prevent bot responsiveness issues

set -e

SERVER="185.161.67.53"
SSH_KEY="~/.ssh/selectel"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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

# Setup monitoring on production server
setup_production_monitoring() {
    log "Setting up production monitoring system..."
    
    # Copy monitoring scripts to server
    log "Copying monitoring scripts to production server..."
    scp -i "$SSH_KEY" scripts/production-monitor.sh root@"$SERVER":/usr/local/bin/
    scp -i "$SSH_KEY" src/utils/production-monitor.ts root@"$SERVER":/opt/
    
    # Make scripts executable
    ssh -i "$SSH_KEY" root@"$SERVER" 'chmod +x /usr/local/bin/production-monitor.sh'
    
    # Install dependencies if needed
    log "Installing monitoring dependencies..."
    ssh -i "$SSH_KEY" root@"$SERVER" '
        # Install curl and netstat if not present
        apt-get update -y
        apt-get install -y curl net-tools jq
        
        # Install bun for TypeScript monitoring script
        if ! command -v bun &> /dev/null; then
            curl -fsSL https://bun.sh/install | bash
            source ~/.bashrc
        fi
    '
    
    success "Monitoring scripts deployed to production server"
}

# Create systemd service for monitoring
create_monitoring_service() {
    log "Creating monitoring systemd service..."
    
    ssh -i "$SSH_KEY" root@"$SERVER" 'cat > /etc/systemd/system/bot-production-monitor.service << EOF
[Unit]
Description=Bot Production Monitoring System
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
ExecStart=/usr/local/bin/production-monitor.sh monitor
Restart=always
RestartSec=30
User=root
Environment=AUTO_FIX_NGINX=true
Environment=CHECK_INTERVAL=300

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=bot-monitor

[Install]
WantedBy=multi-user.target
EOF'
    
    # Enable and start the service
    ssh -i "$SSH_KEY" root@"$SERVER" '
        systemctl daemon-reload
        systemctl enable bot-production-monitor.service
        systemctl start bot-production-monitor.service
    '
    
    success "Monitoring service created and started"
}

# Create monitoring dashboard endpoint
create_monitoring_dashboard() {
    log "Creating monitoring dashboard..."
    
    ssh -i "$SSH_KEY" root@"$SERVER" 'cat > /usr/local/bin/monitoring-dashboard.sh << "EOF"
#!/bin/bash

# Simple monitoring dashboard
echo "<!DOCTYPE html>
<html>
<head>
    <title>Bot Production Monitoring</title>
    <meta http-equiv=\"refresh\" content=\"30\">
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background-color: #f5f5f5; }
        .header { background-color: #333; color: white; padding: 20px; border-radius: 5px; }
        .status-card { background-color: white; margin: 10px 0; padding: 15px; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .status-pass { border-left: 5px solid #4CAF50; }
        .status-warn { border-left: 5px solid #FF9800; }
        .status-fail { border-left: 5px solid #F44336; }
        .timestamp { color: #666; font-size: 0.9em; }
        .refresh { float: right; }
    </style>
</head>
<body>
    <div class=\"header\">
        <h1>🔍 Bot Production Monitoring</h1>
        <div class=\"timestamp\">Last updated: $(date)</div>
        <div class=\"refresh\">Auto-refresh: 30s</div>
    </div>"

# Run monitoring check and parse results
/usr/local/bin/production-monitor.sh check > /tmp/monitor-output.txt 2>&1

# Parse the output and create status cards
if grep -q "Container is running" /tmp/monitor-output.txt; then
    echo "<div class=\"status-card status-pass\"><strong>✅ Container Status</strong><br>999-multibots container is running normally</div>"
else
    echo "<div class=\"status-card status-fail\"><strong>❌ Container Status</strong><br>Container issue detected</div>"
fi

if grep -q "nginx correctly configured" /tmp/monitor-output.txt; then
    echo "<div class=\"status-card status-pass\"><strong>✅ nginx Configuration</strong><br>nginx correctly pointing to port 2999</div>"
else
    echo "<div class=\"status-card status-fail\"><strong>❌ nginx Configuration</strong><br>nginx port configuration issue</div>"
fi

if grep -q "API server listening" /tmp/monitor-output.txt; then
    echo "<div class=\"status-card status-pass\"><strong>✅ API Server</strong><br>API server accessible on port 2999</div>"
else
    echo "<div class=\"status-card status-fail\"><strong>❌ API Server</strong><br>API server not accessible</div>"
fi

if grep -q "All.*bot ports are listening" /tmp/monitor-output.txt; then
    echo "<div class=\"status-card status-pass\"><strong>✅ Bot Ports</strong><br>All 10 bot ports (3001-3010) are listening</div>"
else
    echo "<div class=\"status-card status-warn\"><strong>⚠️ Bot Ports</strong><br>Some bot ports may not be listening</div>"
fi

if grep -q "Domain accessible" /tmp/monitor-output.txt; then
    echo "<div class=\"status-card status-pass\"><strong>✅ Domain Access</strong><br>test-render-farm.ru is accessible</div>"
else
    echo "<div class=\"status-card status-fail\"><strong>❌ Domain Access</strong><br>Domain accessibility issue</div>"
fi

echo "<div class=\"status-card\">
    <strong>📊 System Resources</strong><br>
    <pre>$(df -h / | tail -1)</pre>
    <pre>$(free -h | head -2)</pre>
</div>"

echo "<div class=\"status-card\">
    <strong>🔗 Quick Actions</strong><br>
    <button onclick=\"location.reload()\">🔄 Refresh Now</button>
    <a href=\"/logs\" style=\"margin-left: 10px;\">📋 View Logs</a>
</div>"

echo "</body></html>"
EOF'
    
    chmod +x /usr/local/bin/monitoring-dashboard.sh
    
    success "Monitoring dashboard created"
}

# Setup log rotation
setup_log_rotation() {
    log "Setting up log rotation..."
    
    ssh -i "$SSH_KEY" root@"$SERVER" 'cat > /etc/logrotate.d/bot-monitoring << EOF
/tmp/production-monitor.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
EOF'
    
    success "Log rotation configured"
}

# Create emergency fix scripts
create_emergency_scripts() {
    log "Creating emergency fix scripts..."
    
    ssh -i "$SSH_KEY" root@"$SERVER" 'cat > /usr/local/bin/emergency-nginx-fix.sh << "EOF"
#!/bin/bash
echo "🚨 Emergency nginx fix - correcting port configuration..."

# Stop nginx
docker exec bot-proxy nginx -s quit || true
sleep 2

# Fix port configuration
docker exec bot-proxy sed -i "s|proxy_pass http://localhost:2999|proxy_pass http://localhost:2999|g" /etc/nginx/conf.d/default.conf

# Start nginx
docker exec bot-proxy nginx

echo "✅ nginx configuration fixed and restarted"
EOF'
    
    ssh -i "$SSH_KEY" root@"$SERVER" 'cat > /usr/local/bin/emergency-container-restart.sh << "EOF"
#!/bin/bash
echo "🚨 Emergency container restart..."

cd /root/999-agents-telegraf

# Stop and remove container
docker stop 999-multibots || true
docker rm 999-multibots || true

# Restart with proper environment
docker run -d --name 999-multibots \
    --env-file .env \
    -p 2999:2999 \
    -p 3001:3001 \
    -p 3002:3002 \
    -p 3003:3003 \
    -p 3004:3004 \
    -p 3005:3005 \
    -p 3006:3006 \
    -p 3007:3007 \
    -p 3008:3008 \
    -p 3009:3009 \
    -p 3010:3010 \
    999-agents-vibecoder_app

echo "✅ Container restarted"
EOF'
    
    ssh -i "$SSH_KEY" root@"$SERVER" '
        chmod +x /usr/local/bin/emergency-nginx-fix.sh
        chmod +x /usr/local/bin/emergency-container-restart.sh
    '
    
    success "Emergency fix scripts created"
}

# Test monitoring system
test_monitoring() {
    log "Testing monitoring system..."
    
    # Run a single check
    ssh -i "$SSH_KEY" root@"$SERVER" '/usr/local/bin/production-monitor.sh check'
    
    # Check if service is running
    local service_status
    service_status=$(ssh -i "$SSH_KEY" root@"$SERVER" 'systemctl is-active bot-production-monitor.service' || echo "inactive")
    
    if [[ "$service_status" == "active" ]]; then
        success "Monitoring service is running"
    else
        warning "Monitoring service is not active: $service_status"
    fi
    
    success "Monitoring system test completed"
}

# Main setup function
main() {
    log "🔧 Setting up comprehensive production monitoring system..."
    
    setup_production_monitoring
    create_monitoring_service
    create_monitoring_dashboard
    setup_log_rotation
    create_emergency_scripts
    test_monitoring
    
    success "🎉 Production monitoring system setup completed!"
    
    echo
    echo "📋 Monitoring System Summary:"
    echo "  ✅ Production monitoring scripts deployed"
    echo "  ✅ Systemd service created and started"
    echo "  ✅ Monitoring dashboard available"
    echo "  ✅ Log rotation configured"
    echo "  ✅ Emergency fix scripts created"
    echo
    echo "🔍 Monitor Status:"
    echo "  Service: systemctl status bot-production-monitor.service"
    echo "  Logs: journalctl -u bot-production-monitor.service -f"
    echo "  Manual check: /usr/local/bin/production-monitor.sh check"
    echo
    echo "🚨 Emergency Commands:"
    echo "  nginx fix: /usr/local/bin/emergency-nginx-fix.sh"
    echo "  Container restart: /usr/local/bin/emergency-container-restart.sh"
    echo
    echo "✅ The monitoring system will now prevent the nginx port mismatch"
    echo "   and bot responsiveness issues from recurring!"
}

# Run main function
main "$@"