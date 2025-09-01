#!/bin/bash

# IMMEDIATE PRODUCTION STATUS CHECK
echo "🚨 IMMEDIATE PRODUCTION STATUS CHECK"

# Direct SSH check of nginx configuration
echo "Checking nginx configuration..."
ssh -i ~/.ssh/selectel root@185.161.67.53 '
echo "=== CURRENT NGINX CONFIG ==="
docker exec bot-proxy grep -n "proxy_pass" /etc/nginx/conf.d/default.conf | head -5

echo ""
echo "=== CONTAINER STATUS ==="
docker ps | grep -E "(999-multibots|bot-proxy)"

echo ""
echo "=== PORT STATUS ==="
echo "Checking ports 1980, 2999, 3000:"
netstat -tulpn | grep -E ":(1980|2999|3000) "

echo ""
echo "=== DOMAIN TEST FROM SERVER ==="
curl -s -o /dev/null -w "HTTP_STATUS: %{http_code}" http://test-render-farm.ru/ || echo "CURL_FAILED"
' > production_status_$(date +%s).txt 2>&1

echo "✅ Production status check initiated"
echo "Results should be saved to production_status_*.txt file"