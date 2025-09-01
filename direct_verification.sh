#!/bin/bash

# DIRECT VERIFICATION SCRIPT
# Tests all components directly and saves to local files

echo "🔍 DIRECT PRODUCTION VERIFICATION"
mkdir -p verification_results

# Test 1: SSH Connection
echo "Testing SSH connection..."
echo "SSH_TEST_RESULT:" > verification_results/ssh_test.txt
timeout 10 ssh -i ~/.ssh/selectel root@185.161.67.53 'echo "SSH_OK"' >> verification_results/ssh_test.txt 2>&1 || echo "SSH_FAILED" >> verification_results/ssh_test.txt

# Test 2: Domain Accessibility  
echo "Testing domain accessibility..."
echo "DOMAIN_TEST_RESULT:" > verification_results/domain_test.txt
curl -s -m 10 -o /dev/null -w 'HTTP_STATUS:%{http_code}\n' http://test-render-farm.ru/ >> verification_results/domain_test.txt 2>&1 || echo "DOMAIN_FAILED" >> verification_results/domain_test.txt

# Test 3: HTTPS Domain
echo "Testing HTTPS domain..."
curl -s -m 10 -o /dev/null -w 'HTTPS_STATUS:%{http_code}\n' https://test-render-farm.ru/ >> verification_results/domain_test.txt 2>&1 || echo "HTTPS_FAILED" >> verification_results/domain_test.txt

# Test 4: Bot API (using local token if available)
echo "Testing bot API..."
echo "BOT_API_TEST:" > verification_results/bot_test.txt
if [ -f .env ]; then
    TOKEN=$(grep "BOT_TOKEN_1=" .env | cut -d'=' -f2 | tr -d '"' | tr -d "'")
    if [ ! -z "$TOKEN" ]; then
        response=$(curl -s -m 10 "https://api.telegram.org/bot$TOKEN/getMe" 2>/dev/null)
        if echo "$response" | grep -q '"ok":true'; then
            echo "BOT_API_OK" >> verification_results/bot_test.txt
            echo "$response" | grep -o '"username":"[^"]*"' >> verification_results/bot_test.txt
        else
            echo "BOT_API_FAILED" >> verification_results/bot_test.txt
        fi
    else
        echo "NO_TOKEN_FOUND" >> verification_results/bot_test.txt
    fi
else
    echo "NO_ENV_FILE" >> verification_results/bot_test.txt
fi

echo "✅ Direct verification complete"
echo "📁 Results in: verification_results/"