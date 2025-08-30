#!/bin/bash

# COMPREHENSIVE PRODUCTION VERIFICATION WITH FILE OUTPUT
echo "🔍 COMPREHENSIVE PRODUCTION VERIFICATION - $(date)"

# Create verification results directory
mkdir -p verification_results

# Task 1: Verify container is running
echo "1️⃣ Verifying container status..."
ssh -i ~/.ssh/selectel root@185.161.67.53 'docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"' > verification_results/container_status.txt 2>&1
echo "Container status saved to verification_results/container_status.txt"

# Task 2: Check API server port
echo "2️⃣ Checking API server port..."
ssh -i ~/.ssh/selectel root@185.161.67.53 '
echo "=== LISTENING PORTS ===" > /tmp/port_check.txt
netstat -tulpn | grep -E ":(1980|2999|3000|3001|3002) " >> /tmp/port_check.txt
echo "" >> /tmp/port_check.txt
echo "=== CONTAINER PROCESSES ===" >> /tmp/port_check.txt
docker exec 999-multibots ps aux | grep node >> /tmp/port_check.txt 2>&1 || echo "Container not accessible" >> /tmp/port_check.txt
' && scp -i ~/.ssh/selectel root@185.161.67.53:/tmp/port_check.txt verification_results/port_analysis.txt
echo "Port analysis saved to verification_results/port_analysis.txt"

# Task 3: Verify nginx configuration
echo "3️⃣ Checking nginx configuration..."
ssh -i ~/.ssh/selectel root@185.161.67.53 '
echo "=== NGINX PROXY_PASS CONFIGURATION ===" > /tmp/nginx_check.txt
docker exec bot-proxy grep -n "proxy_pass" /etc/nginx/conf.d/default.conf >> /tmp/nginx_check.txt 2>&1
echo "" >> /tmp/nginx_check.txt
echo "=== NGINX STATUS ===" >> /tmp/nginx_check.txt
docker exec bot-proxy nginx -t >> /tmp/nginx_check.txt 2>&1
' && scp -i ~/.ssh/selectel root@185.161.67.53:/tmp/nginx_check.txt verification_results/nginx_config.txt
echo "Nginx configuration saved to verification_results/nginx_config.txt"

# Task 4: Test domain response
echo "4️⃣ Testing domain response..."
echo "=== LOCAL DOMAIN TEST ===" > verification_results/domain_test.txt
curl -s -o /dev/null -w 'HTTP_STATUS: %{http_code}\nTime: %{time_total}s\n' http://test-render-farm.ru/ >> verification_results/domain_test.txt 2>&1
echo "" >> verification_results/domain_test.txt
echo "=== SERVER-SIDE DOMAIN TEST ===" >> verification_results/domain_test.txt
ssh -i ~/.ssh/selectel root@185.161.67.53 'curl -s -o /dev/null -w "HTTP_STATUS: %{http_code}\nTime: %{time_total}s\n" http://test-render-farm.ru/' >> verification_results/domain_test.txt 2>&1
echo "Domain test results saved to verification_results/domain_test.txt"

# Task 5: Check bot logs
echo "5️⃣ Examining bot container logs..."
ssh -i ~/.ssh/selectel root@185.161.67.53 '
echo "=== RECENT BOT LOGS (last 50 lines) ===" > /tmp/bot_logs.txt
docker logs 999-multibots --tail 50 >> /tmp/bot_logs.txt 2>&1
echo "" >> /tmp/bot_logs.txt
echo "=== STARTUP MESSAGES ===" >> /tmp/bot_logs.txt
docker logs 999-multibots 2>&1 | grep -i "listening\|port\|started\|webhook\|bot.*initialized" | tail -20 >> /tmp/bot_logs.txt
echo "" >> /tmp/bot_logs.txt
echo "=== ERROR MESSAGES ===" >> /tmp/bot_logs.txt
docker logs 999-multibots 2>&1 | grep -i "error\|failed\|exception\|crash" | tail -10 >> /tmp/bot_logs.txt
' && scp -i ~/.ssh/selectel root@185.161.67.53:/tmp/bot_logs.txt verification_results/bot_logs.txt
echo "Bot logs saved to verification_results/bot_logs.txt"

# Task 6: Test bot tokens
echo "6️⃣ Testing bot token validity..."
echo "=== BOT TOKEN VALIDATION ===" > verification_results/bot_token_test.txt
if [ -f .env ]; then
    for i in {1..3}; do
        TOKEN=$(grep "BOT_TOKEN_$i=" .env | cut -d'=' -f2 | tr -d '"' | tr -d "'")
        if [ ! -z "$TOKEN" ]; then
            echo "Testing BOT_TOKEN_$i..." >> verification_results/bot_token_test.txt
            response=$(curl -s "https://api.telegram.org/bot$TOKEN/getMe" 2>/dev/null)
            if echo "$response" | grep -q '"ok":true'; then
                bot_username=$(echo "$response" | grep -o '"username":"[^"]*"' | cut -d'"' -f4)
                echo "BOT_$i (@$bot_username): ✅ VALID" >> verification_results/bot_token_test.txt
            else
                echo "BOT_$i: ❌ INVALID" >> verification_results/bot_token_test.txt
            fi
        else
            echo "BOT_$i: No token found" >> verification_results/bot_token_test.txt
        fi
    done
else
    echo "No .env file found" >> verification_results/bot_token_test.txt
fi
echo "Bot token tests saved to verification_results/bot_token_test.txt"

# Task 7: Check webhook status
echo "7️⃣ Checking webhook configuration..."
echo "=== WEBHOOK STATUS CHECK ===" > verification_results/webhook_status.txt
if [ -f .env ]; then
    TOKEN=$(grep "BOT_TOKEN_1=" .env | cut -d'=' -f2 | tr -d '"' | tr -d "'")
    if [ ! -z "$TOKEN" ]; then
        echo "Checking webhook info for first bot..." >> verification_results/webhook_status.txt
        curl -s "https://api.telegram.org/bot$TOKEN/getWebhookInfo" >> verification_results/webhook_status.txt 2>&1
    else
        echo "No bot token found for webhook check" >> verification_results/webhook_status.txt
    fi
else
    echo "No .env file found for webhook check" >> verification_results/webhook_status.txt
fi
echo "Webhook status saved to verification_results/webhook_status.txt"

# Task 8: Generate comprehensive summary
echo "8️⃣ Generating verification summary..."
echo "=== PRODUCTION VERIFICATION SUMMARY ===" > verification_results/summary.txt
echo "Date: $(date)" >> verification_results/summary.txt
echo "" >> verification_results/summary.txt

# Analyze results and generate summary
if grep -q "999-multibots.*Up" verification_results/container_status.txt 2>/dev/null; then
    echo "✅ Container Status: 999-multibots is running" >> verification_results/summary.txt
else
    echo "❌ Container Status: 999-multibots NOT running or not found" >> verification_results/summary.txt
fi

if grep -q ":2999.*LISTEN" verification_results/port_analysis.txt 2>/dev/null; then
    echo "✅ API Server: Listening on port 2999" >> verification_results/summary.txt
elif grep -q ":1980.*LISTEN" verification_results/port_analysis.txt 2>/dev/null; then
    echo "⚠️ API Server: Listening on port 1980 (unexpected)" >> verification_results/summary.txt
else
    echo "❌ API Server: NOT listening on expected ports" >> verification_results/summary.txt
fi

if grep -q "proxy_pass.*:2999" verification_results/nginx_config.txt 2>/dev/null; then
    echo "✅ Nginx Config: Correctly pointing to port 2999" >> verification_results/summary.txt
elif grep -q "proxy_pass.*:1980" verification_results/nginx_config.txt 2>/dev/null; then
    echo "❌ Nginx Config: Incorrectly pointing to port 1980" >> verification_results/summary.txt
else
    echo "❌ Nginx Config: Configuration unclear or inaccessible" >> verification_results/summary.txt
fi

domain_status=$(grep "HTTP_STATUS:" verification_results/domain_test.txt 2>/dev/null | head -1 | grep -o "[0-9][0-9][0-9]" || echo "unknown")
if [ "$domain_status" = "200" ]; then
    echo "✅ Domain Access: HTTP 200 (working)" >> verification_results/summary.txt
elif [ "$domain_status" = "502" ]; then
    echo "❌ Domain Access: HTTP 502 (nginx/API server issue)" >> verification_results/summary.txt
else
    echo "❌ Domain Access: HTTP $domain_status (issue detected)" >> verification_results/summary.txt
fi

valid_tokens=$(grep -c "✅ VALID" verification_results/bot_token_test.txt 2>/dev/null || echo "0")
echo "📊 Bot Tokens: $valid_tokens/3 tested tokens are valid" >> verification_results/summary.txt

if grep -q '"url":' verification_results/webhook_status.txt 2>/dev/null; then
    webhook_url=$(grep -o '"url":"[^"]*"' verification_results/webhook_status.txt | cut -d'"' -f4)
    if [ "$webhook_url" != "" ] && [ "$webhook_url" != "null" ]; then
        echo "✅ Webhook Status: Configured ($webhook_url)" >> verification_results/summary.txt
    else
        echo "❌ Webhook Status: Not configured" >> verification_results/summary.txt
    fi
else
    echo "❌ Webhook Status: Could not check" >> verification_results/summary.txt
fi

echo "" >> verification_results/summary.txt
echo "=== DIAGNOSIS ===" >> verification_results/summary.txt
if [ "$domain_status" = "502" ]; then
    echo "🚨 PRIMARY ISSUE: Domain returns 502 - nginx/API server connection problem" >> verification_results/summary.txt
    echo "   → Check if API server is running and nginx points to correct port" >> verification_results/summary.txt
elif [ "$domain_status" = "200" ] && [ "$valid_tokens" -gt "0" ]; then
    echo "🎉 SYSTEM APPEARS FUNCTIONAL: Domain accessible and tokens valid" >> verification_results/summary.txt
    echo "   → Bots should be receiving webhooks. Test by sending message." >> verification_results/summary.txt
else
    echo "⚠️ MIXED RESULTS: Some components working, others not" >> verification_results/summary.txt
    echo "   → Review individual result files for details" >> verification_results/summary.txt
fi

echo ""
echo "🎯 VERIFICATION COMPLETE!"
echo "📁 All results saved to verification_results/ directory"
echo "📋 Check verification_results/summary.txt for quick overview"