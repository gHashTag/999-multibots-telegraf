# 🛡️ Webhook Infrastructure Restoration Skill

**CRITICAL SYSTEM COMPONENT** - Everything depends on this webhook working!

**Status**: Production-Critical
**Created**: 2025-11-12
**Owner**: System Infrastructure
**Priority**: P0 (Maximum)

---

## 🎯 Purpose

This skill contains complete procedures for restoring, maintaining, and monitoring the webhook callback infrastructure that enables video generation services (Veo 3, Sora 2, WAN 2.5) to deliver completed videos to users.

**User Quote**:
> "Создай скилл по этому вебхуку, по сертификату, чтобы мы могли восстановиться в любой момент. Ты не забывал вообще о Джинкс, не забывал этот хук, всегда проверял работоспособность его. От него зависит все у нас."

**Translation**: "Create a skill about this webhook and certificates so we can restore it at any time. Never forget about this hook, always check its availability. Everything depends on it."

---

## 📋 System Overview

### Architecture

```
External API (Kie.ai)
    ↓ HTTPS callback
Domain: three-head-dragon.shop (SSL/TLS)
    ↓ nginx reverse proxy (bot-proxy container)
    ↓ proxy_pass
Bot API: 172.17.0.2:2999 (999-multibots container)
    ↓ Express route handler
Webhook Processing: /api/video-callback/:telegramId
    ↓ Send video to user
Telegram Bot → User receives video
```

### Critical Components

1. **Domain**: `three-head-dragon.shop` → 188.137.250.69
2. **SSL Certificates**: Let's Encrypt (auto-renewed)
3. **Nginx Reverse Proxy**: `bot-proxy` Docker container
4. **Bot API Server**: `999-multibots` container on port 2999
5. **Webhook Endpoint**: `/api/video-callback/:telegramId`
6. **Health Check System**: Pre-send URL verification (Plan A/B)

---

## 🚨 When to Use This Skill

**Auto-Activate when detecting:**
- Webhook callback failures in production logs
- Video generation not delivering to users
- Nginx configuration issues
- SSL certificate errors
- Domain DNS resolution problems
- 502/504 Gateway errors from three-head-dragon.shop

**Manual activation:**
- After server reboot or Docker restart
- After nginx container recreation
- When SSL certificates are renewed
- Before major infrastructure changes
- Regular health checks (weekly recommended)

---

## 🔧 Complete Restoration Procedure

### Step 1: Verify Domain DNS Resolution

```bash
# Check DNS resolution
dig three-head-dragon.shop +short
# Expected: 188.137.250.69

# Check from external network
curl -I https://three-head-dragon.shop/api/video-callback/test
# Expected: HTTP/1.1 404 (endpoint reachable, ID not found)
```

**If DNS fails:**
- Update DNS records at domain registrar
- Wait 5-10 minutes for propagation
- Verify with `dig` again

### Step 2: Verify SSL Certificates

```bash
# SSH to production server
ssh root@188.137.250.69

# Check certificate files exist
ls -la /etc/letsencrypt/live/three-head-dragon.shop/
# Expected files:
# - fullchain.pem
# - privkey.pem
# - cert.pem
# - chain.pem

# Check certificate expiration
openssl x509 -in /etc/letsencrypt/live/three-head-dragon.shop/fullchain.pem -noout -dates
# Expected: notAfter should be in future (certificates valid for 90 days)

# Test certificate validity
openssl s_client -connect three-head-dragon.shop:443 -servername three-head-dragon.shop < /dev/null
# Expected: "Verify return code: 0 (ok)"
```

**If certificates are missing or expired:**

```bash
# Install certbot (if not installed)
apt-get update && apt-get install -y certbot

# Stop nginx temporarily (to free port 80)
docker stop bot-proxy

# Generate new certificate
certbot certonly --standalone -d three-head-dragon.shop --email your@email.com --agree-tos

# Restart nginx
docker start bot-proxy

# Verify certificate installed
ls -la /etc/letsencrypt/live/three-head-dragon.shop/
```

### Step 3: Verify Bot Container IP Address

```bash
# Get bot container IP (CRITICAL - nginx needs this)
docker inspect 999-multibots | grep IPAddress | grep -v null

# Expected output example:
# "IPAddress": "172.17.0.2"

# Save this IP - you'll need it for nginx config!
```

### Step 4: Create/Restore Nginx Configuration

```bash
# Create config directory if missing
mkdir -p /root/nginx-config

# Create nginx config file
cat > /root/nginx-config/three-head-dragon.conf << 'EOF'
# HTTPS (SSL) - Primary webhook endpoint
server {
    listen 443 ssl;
    server_name three-head-dragon.shop;

    # SSL certificates from Let's Encrypt
    ssl_certificate /etc/letsencrypt/live/three-head-dragon.shop/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/three-head-dragon.shop/privkey.pem;

    # SSL settings (recommended by Mozilla SSL Configuration Generator)
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Strict-Transport-Security "max-age=31536000" always;

    # Logging
    access_log /var/log/nginx/three-head-dragon.access.log;
    error_log /var/log/nginx/three-head-dragon.error.log;

    # Proxy to bot API (CRITICAL: Use correct bot container IP!)
    location / {
        # ⚠️ IMPORTANT: Replace with actual bot container IP from Step 3
        proxy_pass http://172.17.0.2:2999;

        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}

# HTTP redirect to HTTPS
server {
    listen 80;
    server_name three-head-dragon.shop;
    return 301 https://$host$request_uri;
}
EOF

# Verify config syntax
cat /root/nginx-config/three-head-dragon.conf
```

### Step 5: Recreate Nginx Container

```bash
# Stop and remove existing nginx container
docker stop bot-proxy
docker rm bot-proxy

# Create new nginx container with proper mounts
docker run -d \
  --name bot-proxy \
  --restart unless-stopped \
  -p 80:80 \
  -p 443:443 \
  -v /root/nginx-config:/etc/nginx/conf.d:ro \
  -v /etc/letsencrypt:/etc/letsencrypt:ro \
  -v /var/log/nginx:/var/log/nginx \
  nginx:latest

# Wait for container to start
sleep 5

# Check container status
docker ps | grep bot-proxy
# Expected: Container running

# Test nginx config inside container
docker exec bot-proxy nginx -t
# Expected: "configuration file /etc/nginx/nginx.conf test is successful"

# Reload nginx (apply config)
docker exec bot-proxy nginx -s reload
```

### Step 6: Verify Webhook Endpoint

```bash
# Test from server (internal)
curl -I http://three-head-dragon.shop/api/video-callback/test
# Expected: HTTP/1.1 404 Not Found (endpoint exists, ID not found)

# Test HTTPS from server
curl -I https://three-head-dragon.shop/api/video-callback/test
# Expected: HTTP/1.1 404 Not Found

# Test from external network (use laptop/phone)
curl -I https://three-head-dragon.shop/api/video-callback/test
# Expected: HTTP/1.1 404 Not Found
```

**Expected Response Headers:**
```
HTTP/1.1 404 Not Found
Server: nginx/1.29.3
X-Powered-By: Express
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff
Strict-Transport-Security: max-age=31536000
```

### Step 7: Verify Bot Health Check System

```bash
# Check bot container logs for health checks
docker logs 999-multibots --tail 50 | grep "WEBHOOK HEALTH CHECK"

# Expected logs when video is generated:
# ✅ [WEBHOOK HEALTH CHECK] Callback URL is accessible
#    url: https://three-head-dragon.shop/api/video-callback/...
#    status: 405
```

---

## 🧪 Testing Procedures

### Manual Webhook Test

```bash
# Generate test video (use bot in Telegram)
# /start → Select video generation → Generate video

# Watch logs for webhook callback
ssh root@188.137.250.69 'docker logs 999-multibots --tail 100 -f' | grep -E "WEBHOOK|video-callback"

# Expected flow:
# 1. [WEBHOOK HEALTH CHECK] Checking callback URL availability
# 2. ✅ [WEBHOOK HEALTH CHECK] Callback URL is accessible
# 3. [KieAiProvider] Using callback URL: https://three-head-dragon.shop/...
# 4. [UNIVERSAL VIDEO WEBHOOK] Received webhook callback
# 5. ✅ [UNIVERSAL VIDEO WEBHOOK] Video URL found
# 6. ✅ [UNIVERSAL VIDEO WEBHOOK] User notified successfully
```

### Automated Health Check Script

```bash
# Create health check script
cat > /root/check-webhook-health.sh << 'EOF'
#!/bin/bash
echo "🔍 Webhook Infrastructure Health Check"
echo "========================================"
echo ""

# 1. Check DNS
echo "1️⃣ DNS Resolution:"
dig three-head-dragon.shop +short
echo ""

# 2. Check SSL
echo "2️⃣ SSL Certificate:"
openssl s_client -connect three-head-dragon.shop:443 -servername three-head-dragon.shop < /dev/null 2>&1 | grep "Verify return code"
echo ""

# 3. Check nginx
echo "3️⃣ Nginx Container:"
docker ps | grep bot-proxy
echo ""

# 4. Check bot container
echo "4️⃣ Bot Container:"
docker ps | grep 999-multibots
echo ""

# 5. Check webhook endpoint
echo "5️⃣ Webhook Endpoint (HTTP):"
curl -I http://three-head-dragon.shop/api/video-callback/test 2>&1 | head -1
echo ""

echo "6️⃣ Webhook Endpoint (HTTPS):"
curl -I https://three-head-dragon.shop/api/video-callback/test 2>&1 | head -1
echo ""

# 7. Check recent webhook activity
echo "7️⃣ Recent Webhook Activity (last 10):"
docker logs 999-multibots --tail 500 2>&1 | grep "WEBHOOK HEALTH CHECK" | tail -10
echo ""

echo "✅ Health check complete!"
EOF

chmod +x /root/check-webhook-health.sh

# Run health check
/root/check-webhook-health.sh
```

---

## 🐛 Common Issues & Solutions

### Issue 1: 502 Bad Gateway

**Symptoms:**
```
HTTP/1.1 502 Bad Gateway
Server: nginx/1.29.3
```

**Root Cause:** Nginx can't reach bot container (wrong IP or container down)

**Solution:**
```bash
# 1. Check bot container is running
docker ps | grep 999-multibots

# 2. Get bot container IP
docker inspect 999-multibots | grep IPAddress

# 3. Update nginx config with correct IP
nano /root/nginx-config/three-head-dragon.conf
# Change proxy_pass to correct IP

# 4. Reload nginx
docker exec bot-proxy nginx -s reload

# 5. Test again
curl -I http://three-head-dragon.shop/api/video-callback/test
```

### Issue 2: SSL Certificate Error

**Symptoms:**
```
curl: (60) SSL certificate problem: unable to get local issuer certificate
```

**Root Cause:** Certificate expired or not properly mounted

**Solution:**
```bash
# 1. Check certificate expiration
openssl x509 -in /etc/letsencrypt/live/three-head-dragon.shop/fullchain.pem -noout -dates

# 2. If expired, renew
certbot renew --force-renewal

# 3. Restart nginx to reload certificates
docker restart bot-proxy

# 4. Verify
curl -I https://three-head-dragon.shop/api/video-callback/test
```

### Issue 3: Nginx Container Won't Start

**Symptoms:**
```
Error response from daemon: Cannot start container
```

**Root Cause:** Config syntax error or missing certificate files

**Solution:**
```bash
# 1. Check nginx config syntax
docker run --rm -v /root/nginx-config:/etc/nginx/conf.d:ro nginx nginx -t

# 2. Check certificate files exist
ls -la /etc/letsencrypt/live/three-head-dragon.shop/

# 3. Check nginx logs
docker logs bot-proxy

# 4. If config error, fix and recreate container
nano /root/nginx-config/three-head-dragon.conf
docker rm bot-proxy
# Re-run Step 5 from restoration procedure
```

### Issue 4: Webhook Callbacks Not Arriving

**Symptoms:**
- Video generated successfully
- No webhook callback in logs
- User doesn't receive video

**Root Cause:** Health check failed, wrong URL sent to Kie.ai

**Solution:**
```bash
# 1. Check health check logs
docker logs 999-multibots --tail 100 | grep "WEBHOOK HEALTH CHECK"

# 2. If Plan A failing, verify nginx working
curl -I https://three-head-dragon.shop/api/video-callback/test

# 3. If Plan B used, verify direct access works
curl -I http://188.137.250.69:2999/api/video-callback/test

# 4. Check environment variables in bot container
docker exec 999-multibots env | grep WEBHOOK

# Expected:
# BASE_WEBHOOK_URL=https://three-head-dragon.shop
# DIRECT_WEBHOOK_URL=http://188.137.250.69:2999
```

### Issue 5: Videos Marked as Failed Despite Success

**Symptoms:**
```
❌ [SORA WEBHOOK] Sora generation failed
```
But video URL exists in payload

**Root Cause:** Webhook processing logic error (fixed 2025-11-12)

**Solution:**
This was fixed in `src/api_server/routes/kie-ai-webhook.routes.ts`:

```typescript
// OLD (broken):
const successFlag = ... (payload.code === 200 && payload.data?.state === 'success' && hasResultUrls ? 1 : 2)

// NEW (fixed):
const hasResultUrls = !!(resultUrls || payload.data?.resultUrls || payload.data?.info?.resultUrls)
const successFlag = ... (payload.code === 200 && (payload.data?.state === 'success' || hasResultUrls) ? 1 : 2)
```

**Verification:**
- Deploy latest code to production
- Generate test video
- Check logs show: `✅ [UNIVERSAL VIDEO WEBHOOK] Video generation successful`

---

## 📊 Monitoring & Alerts

### Daily Health Checks

```bash
# Add to crontab for daily checks
crontab -e

# Add this line (runs at 9 AM every day):
0 9 * * * /root/check-webhook-health.sh | mail -s "Webhook Health Report" admin@yourdomain.com
```

### Real-Time Monitoring

```bash
# Watch webhook activity live
docker logs 999-multibots -f --tail 100 | grep -E "WEBHOOK|video-callback"

# Watch nginx access logs
docker exec bot-proxy tail -f /var/log/nginx/three-head-dragon.access.log
```

### Key Metrics to Monitor

1. **Webhook Success Rate**: Should be > 95%
2. **Response Time**: Should be < 500ms
3. **SSL Certificate Expiry**: Alert 7 days before expiration
4. **Nginx Uptime**: Should be 100%
5. **DNS Resolution**: Should always resolve to 188.137.250.69

---

## 🚀 Prevention Best Practices

### 1. Never Manually Edit Live Nginx Config

**Wrong:**
```bash
docker exec bot-proxy nano /etc/nginx/conf.d/three-head-dragon.conf
```

**Correct:**
```bash
# Edit on host
nano /root/nginx-config/three-head-dragon.conf

# Reload nginx
docker exec bot-proxy nginx -s reload
```

### 2. Always Verify Before Deploying

```bash
# 1. Type check
npm run typecheck

# 2. Test webhook health locally
npm run test:webhook

# 3. Deploy
./deploy.sh production

# 4. Verify after deployment
curl -I https://three-head-dragon.shop/api/video-callback/test
```

### 3. Keep SSL Certificates Auto-Renewed

```bash
# Verify certbot timer is active
systemctl status certbot.timer

# If not active
systemctl enable certbot.timer
systemctl start certbot.timer

# Test renewal process (dry run)
certbot renew --dry-run
```

### 4. Monitor Certificate Expiry

```bash
# Create certificate expiry check script
cat > /root/check-cert-expiry.sh << 'EOF'
#!/bin/bash
CERT_PATH="/etc/letsencrypt/live/three-head-dragon.shop/fullchain.pem"
EXPIRY_DATE=$(openssl x509 -in $CERT_PATH -noout -enddate | cut -d= -f2)
EXPIRY_EPOCH=$(date -d "$EXPIRY_DATE" +%s)
NOW_EPOCH=$(date +%s)
DAYS_LEFT=$(( ($EXPIRY_EPOCH - $NOW_EPOCH) / 86400 ))

echo "SSL Certificate expires in $DAYS_LEFT days"

if [ $DAYS_LEFT -lt 7 ]; then
  echo "⚠️ WARNING: Certificate expires soon!"
  # Send alert (email, Telegram, etc.)
fi
EOF

chmod +x /root/check-cert-expiry.sh

# Add to crontab (daily check)
0 8 * * * /root/check-cert-expiry.sh
```

### 5. Backup Critical Configuration

```bash
# Backup nginx config
cp /root/nginx-config/three-head-dragon.conf /root/nginx-config/three-head-dragon.conf.backup.$(date +%Y%m%d)

# Backup SSL certificates (before renewal)
tar -czf /root/letsencrypt-backup-$(date +%Y%m%d).tar.gz /etc/letsencrypt/
```

---

## 📚 Related Documentation

- **Bulletproof Webhook System**: `/WEBHOOK_BULLETPROOF_SYSTEM.md`
- **Webhook Health Check**: `src/utils/webhookHealthCheck.ts`
- **Webhook Processing**: `src/api_server/routes/kie-ai-webhook.routes.ts`
- **Video Provider Integration**: `src/services/video-providers/KieAiProvider.ts`

---

## 🎯 Success Criteria Checklist

When webhook infrastructure is properly configured:

- [ ] DNS resolves: `three-head-dragon.shop` → `188.137.250.69`
- [ ] SSL certificate valid and not expiring within 30 days
- [ ] Nginx container running with proper config mounted
- [ ] Bot container accessible from nginx at correct IP
- [ ] HTTP endpoint returns 404 (endpoint exists)
- [ ] HTTPS endpoint returns 404 (endpoint exists with SSL)
- [ ] External network can reach HTTPS endpoint
- [ ] Health check system reports Plan A accessible
- [ ] Test video generation delivers to user successfully
- [ ] Webhook callback logs show success (not failure)
- [ ] Response time < 500ms for webhook callbacks

---

## ⚠️ Emergency Contacts

**If webhook completely fails:**

1. **Immediate Fallback**: System automatically uses Plan B (direct IP)
   - URL: `http://188.137.250.69:2999/api/video-callback/:telegramId`
   - This should work even if nginx/SSL/domain fails

2. **Restore Procedure**: Follow Step 1-7 in Complete Restoration Procedure

3. **Escalation**: If Plan B also fails:
   - Check bot container is running: `docker ps | grep 999-multibots`
   - Check port 2999 is accessible: `curl http://188.137.250.69:2999/health`
   - Restart bot if needed: `docker restart 999-multibots`

---

**Last Updated**: 2025-11-12
**Version**: 1.0
**Status**: Production-Critical ✅

**Remember**: "От него зависит все у нас" - Everything depends on this working!
