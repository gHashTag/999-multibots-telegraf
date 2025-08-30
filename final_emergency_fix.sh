#!/bin/bash

# FINAL EMERGENCY BOT FIX WITH REAL VERIFICATION
echo "🚨 FINAL EMERGENCY BOT FIX - $(date)"

ssh -i ~/.ssh/selectel root@185.161.67.53 '
echo "=== STEP 1: CURRENT STATUS CHECK ==="
echo "Checking containers..."
docker ps | grep -E "(999-multibots|bot-proxy)"

echo ""
echo "Checking ports..."
netstat -tulpn | grep -E ":(1980|2999|3000|3001) "

echo ""
echo "Checking nginx config..."
docker exec bot-proxy grep "proxy_pass.*localhost:" /etc/nginx/conf.d/default.conf | head -1

echo ""
echo "=== STEP 2: EMERGENCY FIXES ==="

# Fix 1: Ensure containers are running
echo "Starting containers if needed..."
docker start bot-proxy 2>/dev/null || echo "bot-proxy already running"
docker start 999-multibots 2>/dev/null || echo "999-multibots container issue"

# Fix 2: Apply correct nginx configuration
echo "Applying emergency nginx fix..."
cat > /tmp/final_nginx.conf << "EOF"
server {
    listen 80;
    listen 443 ssl;
    server_name test-render-farm.ru;

    ssl_certificate /etc/letsencrypt/live/test-render-farm.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/test-render-farm.ru/privkey.pem;

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

# Apply nginx configuration
docker exec bot-proxy nginx -s quit || true
sleep 2
docker cp /tmp/final_nginx.conf bot-proxy:/etc/nginx/conf.d/default.conf
docker exec bot-proxy nginx

# Fix 3: Restart bot container if needed
echo "Checking bot container health..."
if ! docker exec 999-multibots ps aux | grep -q node; then
    echo "Bot container not healthy, restarting..."
    cd /root/999-agents-telegraf
    docker stop 999-multibots 2>/dev/null
    docker rm 999-multibots 2>/dev/null
    docker run -d --name 999-multibots \
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
    echo "Waiting for container to start..."
    sleep 10
fi

echo ""
echo "=== STEP 3: VERIFICATION ==="

echo "Final container status:"
docker ps | grep -E "(999-multibots|bot-proxy)"

echo ""
echo "Final nginx config:"
docker exec bot-proxy grep "proxy_pass.*localhost:" /etc/nginx/conf.d/default.conf | head -1

echo ""
echo "Final port status:"
netstat -tulpn | grep -E ":(2999|3001) "

echo ""
echo "Domain test:"
curl -s -o /dev/null -w "HTTP_STATUS: %{http_code}" http://test-render-farm.ru/

echo ""
echo "Bot container logs (last 10 lines):"
docker logs 999-multibots --tail 10

echo ""
echo "=== FINAL STATUS ==="
if netstat -tulpn | grep -q ":2999.*LISTEN"; then
    if docker exec bot-proxy grep -q "proxy_pass.*localhost:2999" /etc/nginx/conf.d/default.conf; then
        echo "✅ SYSTEM SHOULD BE WORKING: API on 2999, nginx points to 2999"
    else
        echo "❌ PORT MISMATCH: API on 2999 but nginx config unclear"
    fi
else
    echo "❌ API SERVER NOT LISTENING on port 2999"
fi
'

echo "🎯 Final emergency fix completed"