#!/bin/bash

# COMPREHENSIVE PRODUCTION VERIFICATION
# This script will verify the actual current state and save results to files

echo "🔍 REAL PRODUCTION VERIFICATION - $(date)"

# Step 1: Check SSH connectivity and container status
ssh -i ~/.ssh/selectel root@185.161.67.53 '
echo "=== PRODUCTION SERVER STATUS ===" > /tmp/production_status.txt
echo "Date: $(date)" >> /tmp/production_status.txt
echo "" >> /tmp/production_status.txt

echo "=== DOCKER CONTAINERS ===" >> /tmp/production_status.txt
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" >> /tmp/production_status.txt
echo "" >> /tmp/production_status.txt

echo "=== LISTENING PORTS ===" >> /tmp/production_status.txt
echo "Port 1980 (API server):" >> /tmp/production_status.txt
netstat -tulpn | grep ":1980" >> /tmp/production_status.txt
echo "" >> /tmp/production_status.txt

echo "Bot ports 3001-3010:" >> /tmp/production_status.txt
for port in {3001..3010}; do
    echo "Port $port:" >> /tmp/production_status.txt
    netstat -tulpn | grep ":$port" >> /tmp/production_status.txt
done
echo "" >> /tmp/production_status.txt

echo "=== NGINX CONFIGURATION ===" >> /tmp/production_status.txt
echo "Current nginx proxy_pass settings:" >> /tmp/production_status.txt
docker exec bot-proxy cat /etc/nginx/conf.d/default.conf | grep proxy_pass >> /tmp/production_status.txt
echo "" >> /tmp/production_status.txt

echo "=== DOMAIN ACCESSIBILITY TEST ===" >> /tmp/production_status.txt
curl -s -o /dev/null -w "HTTP Status: %{http_code}\nResponse time: %{time_total}s\n" http://test-render-farm.ru/ >> /tmp/production_status.txt
echo "" >> /tmp/production_status.txt

echo "=== BOT CONTAINER LOGS (last 20 lines) ===" >> /tmp/production_status.txt
docker logs --tail 20 999-multibots >> /tmp/production_status.txt 2>&1
echo "" >> /tmp/production_status.txt

echo "=== BOT TOKEN TEST ===" >> /tmp/production_status.txt
for i in {1..3}; do
    TOKEN=$(docker exec 999-multibots printenv | grep "BOT_TOKEN_$i=" | cut -d"=" -f2)
    if [ ! -z "$TOKEN" ]; then
        echo "Testing bot $i token..." >> /tmp/production_status.txt
        curl -s "https://api.telegram.org/bot$TOKEN/getMe" | jq -r ".ok" >> /tmp/production_status.txt 2>/dev/null || echo "Token test failed" >> /tmp/production_status.txt
    else
        echo "Bot $i: No token found" >> /tmp/production_status.txt
    fi
done

echo "=== VERIFICATION COMPLETE ===" >> /tmp/production_status.txt
'

# Copy the results back to local machine
scp -i ~/.ssh/selectel root@185.161.67.53:/tmp/production_status.txt /tmp/production_status_$(date +%s).txt

echo "✅ Verification complete. Results saved to local file."