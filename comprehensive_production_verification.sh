#!/bin/bash

# COMPREHENSIVE PRODUCTION VERIFICATION
# This script performs complete verification and saves all results to local files

echo "🔍 COMPREHENSIVE PRODUCTION VERIFICATION - $(date)"

# Create results directory
mkdir -p /Users/playra/999-agents-telegraf/verification_results
RESULTS_DIR="/Users/playra/999-agents-telegraf/verification_results"

# Step 1: SSH Connection Test
echo "1️⃣ Testing SSH connection..."
ssh -i ~/.ssh/selectel root@185.161.67.53 'echo "SSH_CONNECTION_OK"' > "$RESULTS_DIR/01_ssh_test.txt" 2>&1

# Step 2: Container Status Check
echo "2️⃣ Checking container status..."
ssh -i ~/.ssh/selectel root@185.161.67.53 '
echo "=== CONTAINER STATUS ===" > /tmp/container_status.txt
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" >> /tmp/container_status.txt
echo "" >> /tmp/container_status.txt
echo "=== 999-multibots DETAILS ===" >> /tmp/container_status.txt
docker inspect 999-multibots --format "{{.State.Status}}: {{.State.Running}}" >> /tmp/container_status.txt
' && scp -i ~/.ssh/selectel root@185.161.67.53:/tmp/container_status.txt "$RESULTS_DIR/02_container_status.txt"

# Step 3: Port Analysis - Check actual listening ports
echo "3️⃣ Checking port configuration..."
ssh -i ~/.ssh/selectel root@185.161.67.53 '
echo "=== LISTENING PORTS ===" > /tmp/port_analysis.txt
echo "API Server ports (1980, 2999, 3000):" >> /tmp/port_analysis.txt
netstat -tulpn | grep -E ":(1980|2999|3000) " >> /tmp/port_analysis.txt
echo "" >> /tmp/port_analysis.txt
echo "Bot ports (3001-3010):" >> /tmp/port_analysis.txt
for port in {3001..3010}; do
    result=$(netstat -tulpn | grep ":$port ")
    if [ ! -z "$result" ]; then
        echo "Port $port: LISTENING" >> /tmp/port_analysis.txt
    else
        echo "Port $port: NOT LISTENING" >> /tmp/port_analysis.txt
    fi
done
' && scp -i ~/.ssh/selectel root@185.161.67.53:/tmp/port_analysis.txt "$RESULTS_DIR/03_port_analysis.txt"

# Step 4: Nginx Configuration Check
echo "4️⃣ Checking nginx configuration..."
ssh -i ~/.ssh/selectel root@185.161.67.53 '
echo "=== NGINX CONFIGURATION ===" > /tmp/nginx_config.txt
echo "Current proxy_pass settings:" >> /tmp/nginx_config.txt
docker exec bot-proxy grep -n "proxy_pass" /etc/nginx/conf.d/default.conf >> /tmp/nginx_config.txt
echo "" >> /tmp/nginx_config.txt
echo "nginx status:" >> /tmp/nginx_config.txt
docker exec bot-proxy nginx -t >> /tmp/nginx_config.txt 2>&1
' && scp -i ~/.ssh/selectel root@185.161.67.53:/tmp/nginx_config.txt "$RESULTS_DIR/04_nginx_config.txt"

# Step 5: Bot Logs Analysis
echo "5️⃣ Analyzing bot logs..."
ssh -i ~/.ssh/selectel root@185.161.67.53 '
echo "=== BOT CONTAINER LOGS (last 50 lines) ===" > /tmp/bot_logs.txt
docker logs --tail 50 999-multibots >> /tmp/bot_logs.txt 2>&1
echo "" >> /tmp/bot_logs.txt
echo "=== BOT STARTUP MESSAGES ===" >> /tmp/bot_logs.txt
docker logs 999-multibots 2>&1 | grep -i "initialized\|listening\|webhook\|bot.*started\|port.*[0-9]" | tail -20 >> /tmp/bot_logs.txt
echo "" >> /tmp/bot_logs.txt
echo "=== ERROR MESSAGES ===" >> /tmp/bot_logs.txt
docker logs 999-multibots 2>&1 | grep -i "error\|failed\|exception" | tail -10 >> /tmp/bot_logs.txt
' && scp -i ~/.ssh/selectel root@185.161.67.53:/tmp/bot_logs.txt "$RESULTS_DIR/05_bot_logs.txt"

# Step 6: Bot API Test
echo "6️⃣ Testing bot API responses..."
ssh -i ~/.ssh/selectel root@185.161.67.53 '
echo "=== BOT API TESTS ===" > /tmp/bot_api_test.txt
for i in {1..5}; do
    TOKEN=$(docker exec 999-multibots printenv | grep "BOT_TOKEN_$i=" | cut -d"=" -f2)
    if [ ! -z "$TOKEN" ]; then
        echo "Testing BOT_TOKEN_$i..." >> /tmp/bot_api_test.txt
        response=$(curl -s "https://api.telegram.org/bot$TOKEN/getMe")
        if echo "$response" | grep -q "\"ok\":true"; then
            bot_username=$(echo "$response" | grep -o "\"username\":\"[^\"]*\"" | cut -d":" -f2 | tr -d "\"")
            echo "BOT_$i (@$bot_username): ✅ WORKING" >> /tmp/bot_api_test.txt
        else
            echo "BOT_$i: ❌ FAILED - $response" >> /tmp/bot_api_test.txt
        fi
    else
        echo "BOT_$i: No token found" >> /tmp/bot_api_test.txt
    fi
done
' && scp -i ~/.ssh/selectel root@185.161.67.53:/tmp/bot_api_test.txt "$RESULTS_DIR/06_bot_api_test.txt"

# Step 7: Domain Accessibility Test
echo "7️⃣ Testing domain accessibility..."
echo "=== DOMAIN ACCESSIBILITY TEST ===" > "$RESULTS_DIR/07_domain_test.txt"
echo "HTTP test:" >> "$RESULTS_DIR/07_domain_test.txt"
curl -s -o /dev/null -w 'Status: %{http_code}\nTime: %{time_total}s\n' http://test-render-farm.ru/ >> "$RESULTS_DIR/07_domain_test.txt" 2>&1
echo "" >> "$RESULTS_DIR/07_domain_test.txt"
echo "HTTPS test:" >> "$RESULTS_DIR/07_domain_test.txt"
curl -s -o /dev/null -w 'Status: %{http_code}\nTime: %{time_total}s\n' https://test-render-farm.ru/ >> "$RESULTS_DIR/07_domain_test.txt" 2>&1

# Step 8: Webhook Configuration Check
echo "8️⃣ Checking webhook configuration..."
ssh -i ~/.ssh/selectel root@185.161.67.53 '
echo "=== WEBHOOK CONFIGURATION ===" > /tmp/webhook_check.txt
echo "Environment variables check:" >> /tmp/webhook_check.txt
docker exec 999-multibots printenv | grep -E "WEBHOOK|DOMAIN|ORIGIN" >> /tmp/webhook_check.txt
echo "" >> /tmp/webhook_check.txt
echo "Testing webhook endpoints:" >> /tmp/webhook_check.txt
for port in 3001 3002 3003; do
    response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$port/ 2>/dev/null)
    echo "Port $port: HTTP $response" >> /tmp/webhook_check.txt
done
' && scp -i ~/.ssh/selectel root@185.161.67.53:/tmp/webhook_check.txt "$RESULTS_DIR/08_webhook_check.txt"

# Step 9: Git History Analysis
echo "9️⃣ Analyzing git history..."
echo "=== GIT HISTORY ANALYSIS ===" > "$RESULTS_DIR/09_git_history.txt"
git log --oneline -10 --since="1 week ago" >> "$RESULTS_DIR/09_git_history.txt" 2>&1
echo "" >> "$RESULTS_DIR/09_git_history.txt"
echo "Recent changes to configuration files:" >> "$RESULTS_DIR/09_git_history.txt"
git log --oneline --since="1 week ago" -- config/ deployment/ scripts/ >> "$RESULTS_DIR/09_git_history.txt" 2>&1

# Step 10: Summary Report Generation
echo "🔟 Generating summary report..."
echo "=== PRODUCTION VERIFICATION SUMMARY ===" > "$RESULTS_DIR/10_summary_report.txt"
echo "Date: $(date)" >> "$RESULTS_DIR/10_summary_report.txt"
echo "" >> "$RESULTS_DIR/10_summary_report.txt"

# Check each result file and summarize
if grep -q "SSH_CONNECTION_OK" "$RESULTS_DIR/01_ssh_test.txt" 2>/dev/null; then
    echo "✅ SSH Connection: WORKING" >> "$RESULTS_DIR/10_summary_report.txt"
else
    echo "❌ SSH Connection: FAILED" >> "$RESULTS_DIR/10_summary_report.txt"
fi

if grep -q "999-multibots.*Up" "$RESULTS_DIR/02_container_status.txt" 2>/dev/null; then
    echo "✅ Container Status: RUNNING" >> "$RESULTS_DIR/10_summary_report.txt"
else
    echo "❌ Container Status: NOT RUNNING" >> "$RESULTS_DIR/10_summary_report.txt"
fi

if grep -q ":2999.*LISTEN" "$RESULTS_DIR/03_port_analysis.txt" 2>/dev/null; then
    echo "✅ Port 2999 (API): LISTENING" >> "$RESULTS_DIR/10_summary_report.txt"
elif grep -q ":1980.*LISTEN" "$RESULTS_DIR/03_port_analysis.txt" 2>/dev/null; then
    echo "⚠️ Port 1980 (API): LISTENING (unexpected)" >> "$RESULTS_DIR/10_summary_report.txt"
else
    echo "❌ API Port: NOT LISTENING" >> "$RESULTS_DIR/10_summary_report.txt"
fi

if grep -q "proxy_pass.*:2999" "$RESULTS_DIR/04_nginx_config.txt" 2>/dev/null; then
    echo "✅ nginx Config: CORRECT (pointing to 2999)" >> "$RESULTS_DIR/10_summary_report.txt"
elif grep -q "proxy_pass.*:1980" "$RESULTS_DIR/04_nginx_config.txt" 2>/dev/null; then
    echo "❌ nginx Config: INCORRECT (pointing to 1980)" >> "$RESULTS_DIR/10_summary_report.txt"
else
    echo "⚠️ nginx Config: UNCLEAR" >> "$RESULTS_DIR/10_summary_report.txt"
fi

bot_count=$(grep -c "✅ WORKING" "$RESULTS_DIR/06_bot_api_test.txt" 2>/dev/null || echo "0")
echo "📊 Working Bots: $bot_count/5 tested" >> "$RESULTS_DIR/10_summary_report.txt"

domain_status=$(grep "Status:" "$RESULTS_DIR/07_domain_test.txt" 2>/dev/null | head -1 | grep -o "[0-9][0-9][0-9]" || echo "unknown")
if [ "$domain_status" = "200" ]; then
    echo "✅ Domain Access: HTTP $domain_status (WORKING)" >> "$RESULTS_DIR/10_summary_report.txt"
else
    echo "❌ Domain Access: HTTP $domain_status (FAILED)" >> "$RESULTS_DIR/10_summary_report.txt"
fi

echo "" >> "$RESULTS_DIR/10_summary_report.txt"
echo "=== NEXT STEPS RECOMMENDATION ===" >> "$RESULTS_DIR/10_summary_report.txt"
if [ "$bot_count" -gt "2" ] && [ "$domain_status" = "200" ]; then
    echo "🎉 BOTS APPEAR TO BE WORKING! Test by sending message to any bot." >> "$RESULTS_DIR/10_summary_report.txt"
else
    echo "🔧 ISSUES DETECTED. Check individual result files for details." >> "$RESULTS_DIR/10_summary_report.txt"
fi

echo ""
echo "🎯 VERIFICATION COMPLETE!"
echo "📁 Results saved to: $RESULTS_DIR/"
echo "📋 Summary: $RESULTS_DIR/10_summary_report.txt"
echo ""
echo "To view summary:"
echo "cat $RESULTS_DIR/10_summary_report.txt"