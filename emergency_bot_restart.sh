#!/bin/bash

# EMERGENCY BOT RESTART WITH CORRECT CONFIGURATION
echo "🚨 EMERGENCY BOT RESTART - $(date)"

ssh -i ~/.ssh/selectel root@185.161.67.53 '
echo "=== CHECKING CURRENT STATE ==="
echo "Current nginx config:"
docker exec bot-proxy grep "proxy_pass.*localhost:" /etc/nginx/conf.d/default.conf | head -1

echo ""
echo "Container status:"
docker ps | grep 999-multibots

echo ""
echo "=== APPLYING EMERGENCY FIX ==="

# Stop nginx
echo "Stopping nginx..."
docker exec bot-proxy nginx -s quit || true
sleep 2

# Create CORRECT nginx configuration
echo "Creating correct nginx configuration..."
cat > /tmp/emergency_nginx.conf << "EOF"
server {
    listen 80;
    listen 443 ssl;
    server_name test-render-farm.ru;

    ssl_certificate /etc/letsencrypt/live/test-render-farm.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/test-render-farm.ru/privkey.pem;

    # CORRECT: API server runs on port 2999
    location / {
        proxy_pass http://localhost:2999;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # Bot webhook routes
    location /neuro_blogger_bot {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location /MetaMuse_Manifest_bot {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location /ZavaraBot {
        proxy_pass http://localhost:3003;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location /LeeSolarbot {
        proxy_pass http://localhost:3004;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location /NeuroLenaAssistant_bot {
        proxy_pass http://localhost:3005;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location /NeurostylistShtogrina_bot {
        proxy_pass http://localhost:3006;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location /Gaia_Kamskaia_bot {
        proxy_pass http://localhost:3007;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location /Kaya_easy_art_bot {
        proxy_pass http://localhost:3008;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location /AI_STARS_bot {
        proxy_pass http://localhost:3009;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location /HaimGroupMedia_bot {
        proxy_pass http://localhost:3010;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

# Apply the configuration
echo "Applying nginx configuration..."
docker cp /tmp/emergency_nginx.conf bot-proxy:/etc/nginx/conf.d/default.conf

# Start nginx
echo "Starting nginx..."
docker exec bot-proxy nginx

# Test nginx config
echo "Testing nginx configuration..."
docker exec bot-proxy nginx -t

# Restart bot container if needed
echo ""
echo "=== RESTARTING BOT CONTAINER ==="
cd /root/999-agents-telegraf
docker stop 999-multibots || true
sleep 3
docker start 999-multibots || docker run -d --name 999-multibots \
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

echo ""
echo "=== FINAL VERIFICATION ==="
sleep 5

echo "Final nginx config:"
docker exec bot-proxy grep "proxy_pass.*localhost:" /etc/nginx/conf.d/default.conf | head -1

echo ""
echo "Container status:"
docker ps | grep 999-multibots

echo ""
echo "Port check:"
netstat -tulpn | grep -E ":(2999|3001|3002) "

echo ""
echo "Domain test:"
curl -s -o /dev/null -w "HTTP_STATUS: %{http_code}" http://test-render-farm.ru/ || echo "CURL_FAILED"

echo ""
echo "✅ Emergency restart completed!"
'

echo "🎯 Emergency bot restart script executed"