#!/bin/bash

# Simple verification approach
echo "Checking container status..."
ssh -i ~/.ssh/selectel root@185.161.67.53 'docker ps | grep 999-multibots'

echo "Checking nginx config..."
ssh -i ~/.ssh/selectel root@185.161.67.53 'docker exec bot-proxy grep proxy_pass /etc/nginx/conf.d/default.conf | head -1'

echo "Testing domain..."
curl -s -o /dev/null -w '%{http_code}' http://test-render-farm.ru/