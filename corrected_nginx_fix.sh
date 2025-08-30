#!/bin/bash

# CORRECTED NGINX FIX - Revert back to port 2999 (CORRECT PORT!)
echo "🚨 CORRECTED NGINX PORT FIX - REVERTING TO CORRECT PORT 2999"

ssh -i ~/.ssh/selectel root@185.161.67.53 '
echo "🔧 CORRECTING nginx configuration back to port 2999..."

# Stop nginx safely
docker exec bot-proxy nginx -s quit || true
sleep 3

# Create CORRECT configuration pointing to port 2999
cat > /tmp/nginx_corrected.conf << "EOF"
server {
    listen 80;
    listen 443 ssl;
    server_name test-render-farm.ru;

    ssl_certificate /etc/letsencrypt/live/test-render-farm.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/test-render-farm.ru/privkey.pem;

    # CORRECTED: Main route points to port 2999 (where API server actually runs)
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

    # Bot routes (correct)
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

# Copy the CORRECTED config to nginx container
docker cp /tmp/nginx_corrected.conf bot-proxy:/etc/nginx/conf.d/default.conf

# Start nginx
docker exec bot-proxy nginx

echo "✅ nginx configuration CORRECTED and restarted"

# Test the fix
echo "🧪 Testing nginx correction..."
sleep 2

# Check if nginx is running
if docker exec bot-proxy nginx -t; then
    echo "✅ nginx configuration valid"
else
    echo "❌ nginx configuration invalid"
fi

# Verify the corrected port
if docker exec bot-proxy grep "proxy_pass http://localhost:2999" /etc/nginx/conf.d/default.conf > /dev/null; then
    echo "✅ Port 2999 correctly configured (CORRECTED!)"
else
    echo "❌ Port 2999 NOT found in configuration"
fi

# Check if API server is actually listening on port 2999
echo "🔍 Checking if API server is listening on port 2999..."
if netstat -tulpn | grep ":2999.*LISTEN"; then
    echo "✅ API server IS listening on port 2999"
else
    echo "❌ API server NOT listening on port 2999"
fi
'

echo "🎉 nginx configuration CORRECTED back to proper port 2999!"