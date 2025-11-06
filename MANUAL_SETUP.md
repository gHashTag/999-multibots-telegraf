# Manual Server Setup for 45.66.11.152

## Quick Setup Commands

Connect to server:
```bash
ssh -i ~/.ssh/zomro root@45.66.11.152
# Password: 9fhI5F^\Jn6C\4u
```

Run these commands in order:

### 1. Install Docker

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
docker --version

# Install Docker Compose
curl -L "https://github.com/docker/compose/releases/download/v2.23.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose
docker-compose --version
```

### 2. Clone Repository

```bash
cd /root
git clone https://github.com/gHashTag/999-multibots-telegraf.git 999-multibots
cd 999-multibots
git checkout main
```

### 3. Create .env File

```bash
cd /root/999-multibots

# Copy from production or create new
cp .env.example .env

# Edit .env with your credentials
nano .env
```

Required variables:
```env
# Telegram Bot Tokens
BOT_TOKEN_1=your_token_here
BOT_TOKEN_2=your_token_here
# ... etc

# Inngest (will get from dashboard)
BOT_INNGEST_EVENT_KEY=temporary_key
BOT_INNGEST_SIGNING_KEY=temporary_key
BOT_INNGEST_BASE_URL=http://45.66.11.152:3000/api/inngest

# Database
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_key
```

### 4. Build and Run

```bash
cd /root/999-multibots

# Build
docker-compose build --no-cache

# Start
docker-compose up -d

# Check logs
docker-compose logs -f --tail 100
```

Look for:
- ✅ `[API] Server started on port 3000`
- ✅ `🚀 [INNGEST] Registering functions {"count":7,...}`

### 5. Setup Nginx (for public URL)

```bash
# Install nginx
apt update
apt install -y nginx

# Create config
cat > /etc/nginx/sites-available/bot-api << 'EOF'
server {
    listen 80;
    server_name 45.66.11.152;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
EOF

# Enable site
ln -s /etc/nginx/sites-available/bot-api /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
```

Test:
```bash
curl http://45.66.11.152/api/inngest
```

### 6. Register with Inngest Cloud

1. Go to https://app.inngest.com
2. Navigate to **Apps** → **Sync App**
3. Enter URL: `http://45.66.11.152/api/inngest`
4. Click **Sync**
5. Copy **Event Key** and **Signing Key**

### 7. Update .env with Inngest Keys

```bash
cd /root/999-multibots
nano .env

# Update these lines:
BOT_INNGEST_EVENT_KEY=<your_event_key_from_dashboard>
BOT_INNGEST_SIGNING_KEY=<your_signing_key_from_dashboard>
BOT_INNGEST_BASE_URL=http://45.66.11.152/api/inngest

# Restart
docker-compose restart
docker-compose logs -f --tail 50
```

### 8. Verify

Check Inngest Dashboard - should show 7 functions:
- 🔔 AI Reels Callback Handler
- 🎬 Render Workflow
- 🎥 Render Avatar Video Workflow
- 🧩 Render Riddle Workflow
- AI Reels Generation
- Generate Kling Morphing Loop v7
- Model Training - Flux LoRA

## Troubleshooting

### Docker not starting
```bash
systemctl status docker
systemctl start docker
```

### Port 3000 in use
```bash
lsof -i :3000
docker ps -a
docker stop $(docker ps -aq)
```

### Nginx 502
```bash
docker-compose ps
docker-compose logs
systemctl status nginx
```

## Complete Deployment Check

```bash
# 1. Docker running
docker ps

# 2. App logs OK
docker-compose logs --tail 20

# 3. Endpoint accessible
curl http://localhost:3000/api/inngest

# 4. Nginx working
curl http://45.66.11.152/api/inngest

# 5. Inngest Dashboard shows 7 functions
```

All done! 🚀
