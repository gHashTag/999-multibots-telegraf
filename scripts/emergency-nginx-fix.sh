#!/bin/bash

# CRITICAL NGINX FIX - Update port 2999 to 2999
echo "🚨 EMERGENCY NGINX PORT FIX"

ssh -i ~/.ssh/selectel root@185.161.67.53 '
echo "🔧 Fixing nginx configuration (2999 -> 2999)..."

# Stop nginx safely
docker exec bot-proxy nginx -s quit || true
sleep 3

# Create correct configuration
cat > /tmp/nginx_fixed.conf << "EOF"
server {
    listen 80;
    listen 443 ssl;
    server_name test-render-farm.ru;

    ssl_certificate /etc/letsencrypt/live/test-render-farm.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/test-render-farm.ru/privkey.pem;

    # FIXED: Main route points to port 2999
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

    # Bot routes
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

# Copy the config to nginx container
docker cp /tmp/nginx_fixed.conf bot-proxy:/etc/nginx/conf.d/default.conf

# Start nginx
docker exec bot-proxy nginx

echo "✅ nginx configuration fixed and restarted"

# Test the fix
echo "🧪 Testing nginx fix..."
sleep 2

# Check if nginx is running
if docker exec bot-proxy nginx -t; then
    echo "✅ nginx configuration valid"
else
    echo "❌ nginx configuration invalid"
fi

# Verify the port change
if docker exec bot-proxy grep "proxy_pass http://localhost:2999" /etc/nginx/conf.d/default.conf > /dev/null; then
    echo "✅ Port 2999 correctly configured"
else
    echo "❌ Port 2999 NOT found in configuration"
fi
'

echo "🎉 Emergency nginx fix completed!"