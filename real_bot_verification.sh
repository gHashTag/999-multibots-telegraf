#!/bin/bash

# REAL BOT VERIFICATION - Check if bots are actually working
echo "🔍 REAL BOT VERIFICATION - $(date)"

# Test 1: Domain accessibility
echo "1️⃣ Testing domain accessibility..."
DOMAIN_STATUS=$(curl -s -o /dev/null -w '%{http_code}' http://test-render-farm.ru/ 2>/dev/null || echo "ERROR")
echo "Domain status: $DOMAIN_STATUS"

if [ "$DOMAIN_STATUS" = "200" ]; then
    echo "✅ Domain is accessible"
elif [ "$DOMAIN_STATUS" = "502" ]; then
    echo "❌ Domain returns 502 - nginx/API server issue"
else
    echo "⚠️ Domain returns: $DOMAIN_STATUS"
fi

# Test 2: Check actual nginx configuration via SSH
echo ""
echo "2️⃣ Checking actual nginx configuration..."
ssh -i ~/.ssh/selectel root@185.161.67.53 'docker exec bot-proxy grep "proxy_pass.*localhost:" /etc/nginx/conf.d/default.conf | head -1' > nginx_config_check.txt 2>/dev/null

if [ -f nginx_config_check.txt ]; then
    NGINX_CONFIG=$(cat nginx_config_check.txt)
    echo "Current nginx config: $NGINX_CONFIG"
    
    if echo "$NGINX_CONFIG" | grep -q "localhost:2999"; then
        echo "✅ nginx correctly points to port 2999"
    elif echo "$NGINX_CONFIG" | grep -q "localhost:1980"; then
        echo "❌ nginx incorrectly points to port 1980 (needs correction)"
    else
        echo "⚠️ nginx configuration unclear"
    fi
else
    echo "❌ Could not check nginx configuration"
fi

# Test 3: Check if API server is actually listening
echo ""
echo "3️⃣ Checking API server port status..."
ssh -i ~/.ssh/selectel root@185.161.67.53 'netstat -tulpn | grep -E ":(1980|2999|3000) "' > port_status.txt 2>/dev/null

if [ -f port_status.txt ]; then
    echo "Port status:"
    cat port_status.txt
    
    if grep -q ":2999.*LISTEN" port_status.txt; then
        echo "✅ API server listening on port 2999"
    elif grep -q ":1980.*LISTEN" port_status.txt; then
        echo "⚠️ API server listening on port 1980 (unexpected)"
    else
        echo "❌ API server not listening on expected ports"
    fi
else
    echo "❌ Could not check port status"
fi

# Test 4: Check bot token validity (if .env exists)
echo ""
echo "4️⃣ Testing bot token validity..."
if [ -f .env ]; then
    TOKEN=$(grep "BOT_TOKEN_1=" .env | cut -d'=' -f2 | tr -d '"' | tr -d "'")
    if [ ! -z "$TOKEN" ]; then
        echo "Testing first bot token..."
        BOT_RESPONSE=$(curl -s "https://api.telegram.org/bot$TOKEN/getMe" 2>/dev/null)
        if echo "$BOT_RESPONSE" | grep -q '"ok":true'; then
            BOT_USERNAME=$(echo "$BOT_RESPONSE" | grep -o '"username":"[^"]*"' | cut -d'"' -f4)
            echo "✅ Bot token valid (@$BOT_USERNAME)"
        else
            echo "❌ Bot token invalid or API error"
        fi
    else
        echo "⚠️ No bot token found in .env"
    fi
else
    echo "⚠️ No .env file found"
fi

# Test 5: Container status check
echo ""
echo "5️⃣ Checking container status..."
ssh -i ~/.ssh/selectel root@185.161.67.53 'docker ps | grep 999-multibots' > container_status.txt 2>/dev/null

if [ -f container_status.txt ] && [ -s container_status.txt ]; then
    echo "Container status:"
    cat container_status.txt
    echo "✅ Container is running"
else
    echo "❌ Container not found or not running"
fi

# Summary
echo ""
echo "📋 VERIFICATION SUMMARY:"
echo "========================"

# Cleanup temp files
rm -f nginx_config_check.txt port_status.txt container_status.txt

echo "Domain: $DOMAIN_STATUS"
echo "Run this script to see current production status."
echo ""
echo "If domain returns 502, the nginx/API port issue still exists."
echo "If domain returns 200, bots should be receiving webhooks."