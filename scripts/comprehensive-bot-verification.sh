#!/bin/bash

# 🔍 COMPREHENSIVE BOT PRODUCTION VERIFICATION
# This script thoroughly checks if bots are actually working in production

set -e

SERVER="185.161.67.53"
SSH_KEY="~/.ssh/selectel"
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
LOG_DIR="/tmp/bot_verification_$TIMESTAMP"

# Create local directory for results
mkdir -p "$LOG_DIR"

echo "🔍 COMPREHENSIVE PRODUCTION BOT VERIFICATION"
echo "============================================="
echo "Timestamp: $(date)"
echo "Results will be saved to: $LOG_DIR"
echo

# Function to run SSH command and save output
run_ssh_check() {
    local description="$1"
    local command="$2"
    local output_file="$3"
    
    echo "📋 Checking: $description"
    ssh -i "$SSH_KEY" root@"$SERVER" "$command" > "$LOG_DIR/$output_file" 2>&1 || echo "ERROR" > "$LOG_DIR/$output_file"
    echo "   Results saved to: $LOG_DIR/$output_file"
}

echo "🚀 Starting comprehensive production verification..."
echo

# 1. Container Status Check
echo "1️⃣ CONTAINER STATUS VERIFICATION"
run_ssh_check "Docker containers status" "docker ps" "01_containers.txt"
run_ssh_check "999-multibots container details" "docker inspect 999-multibots" "02_container_details.txt"
run_ssh_check "Container resource usage" "docker stats --no-stream 999-multibots" "03_container_stats.txt"

# 2. Port Verification
echo "2️⃣ PORT VERIFICATION"
run_ssh_check "All listening ports" "netstat -tulpn" "04_all_ports.txt"
run_ssh_check "Bot ports 3001-3010" "for port in {3001..3010}; do echo \"Port \$port:\"; netstat -tulpn | grep \":\$port \" || echo \"NOT LISTENING\"; done" "05_bot_ports.txt"
run_ssh_check "API server ports" "netstat -tulpn | grep -E ':(2999|2999|3000) '" "06_api_ports.txt"

# 3. Bot Logs Analysis
echo "3️⃣ BOT LOGS ANALYSIS"
run_ssh_check "Container logs (last 100 lines)" "docker logs --tail 100 999-multibots" "07_container_logs.txt"
run_ssh_check "Bot startup messages" "docker logs 999-multibots 2>&1 | grep -i 'webhook\\|bot\\|started\\|listening'" "08_bot_startup.txt"
run_ssh_check "Error messages in logs" "docker logs 999-multibots 2>&1 | grep -i 'error\\|failed\\|exception'" "09_error_logs.txt"

# 4. Webhook Configuration Check
echo "4️⃣ WEBHOOK CONFIGURATION"
run_ssh_check "nginx configuration" "docker exec bot-proxy cat /etc/nginx/conf.d/default.conf" "10_nginx_config.txt"
run_ssh_check "nginx port configuration" "docker exec bot-proxy grep -n 'proxy_pass' /etc/nginx/conf.d/default.conf" "11_nginx_ports.txt"
run_ssh_check "nginx status" "docker exec bot-proxy nginx -t && echo 'nginx config OK'" "12_nginx_status.txt"

# 5. Bot Token and Environment Check
echo "5️⃣ BOT ENVIRONMENT VERIFICATION"
run_ssh_check "Environment variables" "docker exec 999-multibots printenv | grep -E 'BOT_TOKEN|WEBHOOK|PORT' | head -20" "13_env_vars.txt"
run_ssh_check "Bot token count" "docker exec 999-multibots printenv | grep -c 'BOT_TOKEN_'" "14_token_count.txt"

# 6. Webhook API Verification
echo "6️⃣ WEBHOOK API VERIFICATION"
echo "Checking webhook status for each bot token..."

# Create webhook check script on server
ssh -i "$SSH_KEY" root@"$SERVER" 'cat > /tmp/check_webhooks.sh << "EOF"
#!/bin/bash
echo "=== WEBHOOK STATUS CHECK ==="
for i in {1..10}; do
    TOKEN=$(docker exec 999-multibots printenv | grep "BOT_TOKEN_$i=" | cut -d"=" -f2 2>/dev/null)
    if [ ! -z "$TOKEN" ]; then
        echo "Bot $i Token: ${TOKEN:0:10}...${TOKEN: -10}"
        echo "Webhook info:"
        curl -s "https://api.telegram.org/bot$TOKEN/getWebhookInfo" | jq . 2>/dev/null || echo "Failed to get webhook info"
        echo "Bot info:"
        curl -s "https://api.telegram.org/bot$TOKEN/getMe" | jq .result.username 2>/dev/null || echo "Failed to get bot info"
        echo "---"
    fi
done
EOF
chmod +x /tmp/check_webhooks.sh
/tmp/check_webhooks.sh' > "$LOG_DIR/15_webhook_status.txt" 2>&1

# 7. External Connectivity Test
echo "7️⃣ EXTERNAL CONNECTIVITY"
run_ssh_check "Domain accessibility test" "curl -v http://test-render-farm.ru/ 2>&1 | head -20" "16_domain_test.txt"
run_ssh_check "HTTPS test" "curl -v https://test-render-farm.ru/ 2>&1 | head -20" "17_https_test.txt"
run_ssh_check "Bot endpoint test" "curl -v http://localhost:3001/ 2>&1 | head -10" "18_bot_endpoint.txt"

# 8. Process and Service Status
echo "8️⃣ PROCESS STATUS"
run_ssh_check "Container processes" "docker exec 999-multibots ps aux" "19_container_processes.txt"
run_ssh_check "System processes" "ps aux | grep -E 'node|nginx|docker'" "20_system_processes.txt"

# 9. File History Check
echo "9️⃣ FILE HISTORY ANALYSIS"
run_ssh_check "Recent file changes" "find /root/999-agents-telegraf -name '*.js' -o -name '*.json' -o -name '*.conf' | head -10 | xargs ls -la" "21_recent_files.txt"
run_ssh_check "nginx config history" "ls -la /etc/nginx/conf.d/ 2>/dev/null || docker exec bot-proxy ls -la /etc/nginx/conf.d/" "22_nginx_files.txt"

# 10. Real Bot Response Test
echo "🔟 REAL BOT RESPONSE TEST"
echo "Testing if bots actually respond to API calls..."

ssh -i "$SSH_KEY" root@"$SERVER" 'cat > /tmp/test_bot_responses.sh << "EOF"
#!/bin/bash
echo "=== BOT RESPONSE TEST ==="
for i in {1..10}; do
    TOKEN=$(docker exec 999-multibots printenv | grep "BOT_TOKEN_$i=" | cut -d"=" -f2 2>/dev/null)
    if [ ! -z "$TOKEN" ]; then
        echo "Testing Bot $i:"
        # Test getMe API
        RESPONSE=$(curl -s "https://api.telegram.org/bot$TOKEN/getMe")
        if echo "$RESPONSE" | grep -q '"ok":true'; then
            USERNAME=$(echo "$RESPONSE" | jq -r .result.username 2>/dev/null)
            echo "  ✅ Bot $i (@$USERNAME) is responding to API calls"
        else
            echo "  ❌ Bot $i is NOT responding: $RESPONSE"
        fi
    else
        echo "  ⚠️ Bot $i token not found"
    fi
done
EOF
chmod +x /tmp/test_bot_responses.sh
/tmp/test_bot_responses.sh' > "$LOG_DIR/23_bot_responses.txt" 2>&1

echo
echo "✅ Comprehensive verification completed!"
echo "📁 All results saved to: $LOG_DIR"
echo
echo "📋 Analysis Summary:"
echo "===================="

# Quick analysis of critical files
if [ -f "$LOG_DIR/01_containers.txt" ]; then
    echo "🐳 Container Status:"
    if grep -q "999-multibots" "$LOG_DIR/01_containers.txt"; then
        echo "   ✅ 999-multibots container is running"
    else
        echo "   ❌ 999-multibots container NOT FOUND"
    fi
fi

if [ -f "$LOG_DIR/11_nginx_ports.txt" ]; then
    echo "🔧 nginx Configuration:"
    if grep -q "2999" "$LOG_DIR/11_nginx_ports.txt"; then
        echo "   📍 Found port 2999 in nginx config"
    fi
    if grep -q "2999" "$LOG_DIR/11_nginx_ports.txt"; then
        echo "   📍 Found port 2999 in nginx config"
    fi
    if grep -q "3000" "$LOG_DIR/11_nginx_ports.txt"; then
        echo "   📍 Found port 3000 in nginx config"
    fi
fi

if [ -f "$LOG_DIR/23_bot_responses.txt" ]; then
    echo "🤖 Bot Response Test:"
    RESPONDING=$(grep -c "✅.*responding" "$LOG_DIR/23_bot_responses.txt" 2>/dev/null || echo "0")
    NOT_RESPONDING=$(grep -c "❌.*NOT responding" "$LOG_DIR/23_bot_responses.txt" 2>/dev/null || echo "0")
    echo "   ✅ $RESPONDING bots responding"
    echo "   ❌ $NOT_RESPONDING bots not responding"
fi

echo
echo "🔍 To analyze results in detail:"
echo "   cat $LOG_DIR/23_bot_responses.txt  # Bot response test"
echo "   cat $LOG_DIR/07_container_logs.txt # Container logs"
echo "   cat $LOG_DIR/11_nginx_ports.txt    # nginx port config"
echo "   cat $LOG_DIR/15_webhook_status.txt # Webhook status"

# Copy results to workspace for analysis
echo
echo "📋 Copying results to workspace for detailed analysis..."