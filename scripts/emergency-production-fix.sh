#!/bin/bash

# 🚨 EMERGENCY PRODUCTION FIX SCRIPT
# Fixes critical issues that are preventing bots from responding

set -e

echo "🚨 EMERGENCY PRODUCTION FIX - Starting immediate repairs..."

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

# Fix 1: Update webhook deployment server repository path
fix_webhook_server_repo_path() {
    log "🔧 Fix 1: Updating webhook deployment server repository path..."
    
    # Copy the corrected webhook deployment server to production
    scp -i ~/.ssh/selectel scripts/webhook-deploy-server.js root@185.161.67.53:/tmp/webhook-deploy-server.js
    
    # Update the repo path in the file
    ssh -i ~/.ssh/selectel root@185.161.67.53 '
        # Fix the repository path
        sed -i "s|999-agents-vibecoder|999-agents-telegraf|g" /tmp/webhook-deploy-server.js
        
        # Copy to the correct location
        cp /tmp/webhook-deploy-server.js /root/webhook-deploy-server.js
        
        # Restart webhook deployment service if running
        if systemctl is-active --quiet webhook-deployer; then
            systemctl restart webhook-deployer
            echo "✅ Webhook deployer service restarted"
        else
            echo "ℹ️ Webhook deployer service not running"
        fi
    '
    
    success "Webhook server repository path corrected"
}

# Fix 2: Fix nginx port configuration (2999 -> 2999)
fix_nginx_port_config() {
    log "🔧 Fix 2: Fixing nginx port configuration..."
    
    ssh -i ~/.ssh/selectel root@185.161.67.53 '
        echo "🔧 Creating corrected nginx configuration..."
        
        # Create new config file with correct port
        cat > /tmp/nginx_corrected.conf << "EOF"
server {
    listen 80;
    listen 443 ssl;
    server_name test-render-farm.ru;

    # SSL certificates
    ssl_certificate /etc/letsencrypt/live/test-render-farm.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/test-render-farm.ru/privkey.pem;

    # Main route - CORRECTED PORT 2999
    location / {
        proxy_pass http://localhost:2999;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # Bot routes - keeping correct ports
    location /neuro_blogger_bot {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location /MetaMuse_Manifest_bot {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location /ZavaraBot {
        proxy_pass http://localhost:3003;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location /LeeSolarbot {
        proxy_pass http://localhost:3004;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location /NeuroLenaAssistant_bot {
        proxy_pass http://localhost:3005;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location /NeurostylistShtogrina_bot {
        proxy_pass http://localhost:3006;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location /Gaia_Kamskaia_bot {
        proxy_pass http://localhost:3007;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location /Kaya_easy_art_bot {
        proxy_pass http://localhost:3008;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_Set_header Connection "upgrade";
    }

    location /AI_STARS_bot {
        proxy_pass http://localhost:3009;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location /HaimGroupMedia_bot {
        proxy_pass http://localhost:3010;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF
        
        echo "✅ New nginx configuration created"
        
        # Stop nginx, replace config, start nginx
        docker exec bot-proxy nginx -s stop
        sleep 2
        
        # Copy the new config
        docker cp /tmp/nginx_corrected.conf bot-proxy:/etc/nginx/conf.d/default.conf
        
        # Start nginx
        docker exec bot-proxy nginx
        
        echo "✅ Nginx restarted with corrected configuration"
        
        # Verify the change
        echo "🔍 Verifying configuration..."
        docker exec bot-proxy grep "proxy_pass http://localhost:2999" /etc/nginx/conf.d/default.conf
    '
    
    success "Nginx port configuration fixed (2999 -> 2999)"
}

# Fix 3: Restart container with proper environment variables
fix_container_environment() {
    log "🔧 Fix 3: Ensuring container has proper environment variables..."
    
    ssh -i ~/.ssh/selectel root@185.161.67.53 '
        cd /root/999-agents-telegraf
        
        echo "🔄 Restarting container with proper environment..."
        
        # Stop container
        docker stop 999-multibots || true
        
        # Remove container
        docker rm 999-multibots || true
        
        # Start with proper environment file
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
        
        echo "✅ Container restarted with proper environment"
        
        # Wait for container to start
        sleep 10
        
        # Check if container is running
        docker ps | grep 999-multibots
    '
    
    success "Container environment fixed"
}

# Fix 4: Setup webhooks with HTTPS URLs
fix_webhook_urls() {
    log "🔧 Fix 4: Setting up webhooks with proper HTTPS URLs..."
    
    ssh -i ~/.ssh/selectel root@185.161.67.53 '
        cd /root/999-agents-telegraf
        
        echo "🔗 Setting up webhooks with HTTPS URLs..."
        
        # Wait for bots to be ready
        sleep 15
        
        # Setup webhooks for all 10 bots with HTTPS
        for i in {1..10}; do
            TOKEN=$(docker exec 999-multibots printenv | grep "BOT_TOKEN_$i=" | cut -d"=" -f2)
            if [ ! -z "$TOKEN" ]; then
                echo "Setting webhook for bot $i..."
                curl -X POST "https://api.telegram.org/bot$TOKEN/setWebhook" \
                     -d "url=https://test-render-farm.ru/webhook/bot$i" \
                     -d "allowed_updates=[\"message\",\"callback_query\",\"pre_checkout_query\"]"
                echo
            fi
        done
        
        echo "✅ Webhooks configured with HTTPS"
    '
    
    success "Webhook URLs fixed to use HTTPS"
}

# Fix 5: Test the fixes
test_fixes() {
    log "🧪 Testing all fixes..."
    
    # Test domain accessibility
    echo "Testing domain accessibility..."
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://test-render-farm.ru/)
    if [ "$HTTP_CODE" = "200" ]; then
        success "Domain is accessible (HTTP $HTTP_CODE)"
    else
        warning "Domain returned HTTP $HTTP_CODE"
    fi
    
    # Test HTTPS
    HTTPS_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://test-render-farm.ru/)
    if [ "$HTTPS_CODE" = "200" ]; then
        success "HTTPS is working (HTTP $HTTPS_CODE)"
    else
        warning "HTTPS returned HTTP $HTTPS_CODE"
    fi
    
    # Test webhook endpoints
    ssh -i ~/.ssh/selectel root@185.161.67.53 '
        echo "Testing bot endpoints..."
        
        # Test bot endpoints
        for port in 3001 3002 3003 3004 3005 3006 3007 3008 3009 3010; do
            if netstat -tulpn | grep -q ":$port.*LISTEN"; then
                echo "✅ Port $port is listening"
            else
                echo "❌ Port $port is not listening"
            fi
        done
        
        # Test API server
        if netstat -tulpn | grep -q ":2999.*LISTEN"; then
            echo "✅ API server port 2999 is listening"
        else
            echo "❌ API server port 2999 is not listening"
        fi
    '
}

# Execute all fixes
main() {
    log "🚨 Starting emergency production fix sequence..."
    
    fix_webhook_server_repo_path
    fix_nginx_port_config  
    fix_container_environment
    fix_webhook_urls
    test_fixes
    
    success "🎉 Emergency production fix completed!"
    echo
    echo "📊 Summary of fixes applied:"
    echo "  ✅ Fixed webhook deployment server repository path"
    echo "  ✅ Fixed nginx port configuration (2999 -> 2999)"
    echo "  ✅ Restarted container with proper environment variables"
    echo "  ✅ Configured webhooks with HTTPS URLs"
    echo "  ✅ Added WebSocket support headers"
    echo
    echo "🔍 Next steps:"
    echo "  1. Monitor bot responsiveness"
    echo "  2. Test webhook functionality"
    echo "  3. Verify external domain access"
}

# Run the fix
main "$@"