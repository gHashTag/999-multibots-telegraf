#!/bin/bash

# Direct bot check - saves results to local files
echo "🔍 DIRECT BOT VERIFICATION"

# Check 1: Container status
ssh -i ~/.ssh/selectel root@185.161.67.53 'docker ps | grep 999-multibots' > /Users/playra/999-agents-telegraf/container_status.txt 2>&1

# Check 2: Port analysis
ssh -i ~/.ssh/selectel root@185.161.67.53 'netstat -tulpn | grep -E ":(2999|3001|3002|3003|3004|3005|3006|3007|3008|3009|3010)"' > /Users/playra/999-agents-telegraf/port_analysis.txt 2>&1

# Check 3: Nginx configuration
ssh -i ~/.ssh/selectel root@185.161.67.53 'docker exec bot-proxy grep proxy_pass /etc/nginx/conf.d/default.conf' > /Users/playra/999-agents-telegraf/nginx_config.txt 2>&1

# Check 4: Domain test
curl -s -o /dev/null -w '%{http_code}' http://test-render-farm.ru/ > /Users/playra/999-agents-telegraf/domain_test.txt 2>&1

# Check 5: Bot API test
ssh -i ~/.ssh/selectel root@185.161.67.53 '
TOKEN=$(docker exec 999-multibots printenv | grep "BOT_TOKEN_1=" | cut -d"=" -f2)
if [ ! -z "$TOKEN" ]; then
    curl -s "https://api.telegram.org/bot$TOKEN/getMe" | grep -o "\"ok\":[^,]*"
else
    echo "No token found"
fi
' > /Users/playra/999-agents-telegraf/bot_api_test.txt 2>&1

echo "✅ Results saved to workspace files"
