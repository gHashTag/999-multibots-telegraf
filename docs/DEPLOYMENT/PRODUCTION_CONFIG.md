# Production Environment Configuration Documentation

## Current Status: ✅ PRODUCTION READY

**Date**: August 30, 2025  
**Branch**: `production`  
**Container Status**: Healthy and Running  

---

## 🚀 Active Bots (6/10)

| Bot Name | Port | Status | Token Slot |
|----------|------|--------|------------|
| `neuro_blogger_bot` | 3001 | ✅ Active | BOT_TOKEN_1 |
| `MetaMuse_Manifest_bot` | 3002 | ✅ Active | BOT_TOKEN_2 |
| `ZavaraBot` | 3003 | ✅ Active | BOT_TOKEN_3 |
| `Gaia_Kamskaia_bot` | 3004 | ✅ Active | BOT_TOKEN_4 |
| `Kaya_easy_art_bot` | 3005 | ✅ Active | BOT_TOKEN_5 |
| `HaimGroupMedia_bot` | 3006 | ✅ Active | BOT_TOKEN_6 |

---

## 🔧 Server Configuration

**Host**: `185.161.67.53`  
**Container Name**: `999-multibots`  
**Image**: `999-agents-vibecoder_app`  
**Network**: Bridge network  
**Environment**: Production  

### Port Mappings
```
2999:2999   # Health check endpoint
3000:3000   # API server
3001:3001   # neuro_blogger_bot
3002:3002   # MetaMuse_Manifest_bot  
3003:3003   # ZavaraBot
3004:3004   # Gaia_Kamskaia_bot
3005:3005   # Kaya_easy_art_bot
3006:3006   # HaimGroupMedia_bot
3007:3007   # (Available)
3008:3008   # (Available)
3009:3009   # (Available)
3010:3010   # (Available)
```

---

## 🌐 Webhook Configuration

**Domain**: `${WEBHOOK_DOMAIN}`  
**Path**: `${WEBHOOK_PATH:-/webhook}`  
**Mode**: Webhook (not polling)  
**SSL**: Managed by Let’s Encrypt on Zomro (e.g. 999-agents.site, three-head-dragon.shop)  

### Nginx Proxy
- **Container**: `bot-proxy`
- **Ports**: `80:80, 443:443`
- **Config**: `/nginx-config/default.conf`

---

## 🔐 Environment Variables

### Critical Settings
```bash
NODE_ENV=production
WEBHOOK_DOMAIN=https://999-agents.site
WEBHOOK_PATH=/webhook
```

### Bot Tokens (Loaded via --env-file .env)
- ✅ BOT_TOKEN_1 through BOT_TOKEN_10 present
- ✅ BOT_TOKEN_TEST_1, BOT_TOKEN_TEST_2 present
- ⚠️ TEST_BOT_NAME commented out (prevents dev mode)

---

## 🐋 Docker Runtime Command

```bash
docker run -d --name 999-multibots \
  --env-file .env \
  -e NODE_ENV=production \
  -e TEST_BOT_NAME= \
  -p 2999:2999 -p 3000:3000 -p 3001:3001 -p 3002:3002 \
  -p 3003:3003 -p 3004:3004 -p 3005:3005 -p 3006:3006 \
  -p 3007:3007 -p 3008:3008 -p 3009:3009 -p 3010:3010 \
  --restart unless-stopped \
  999-agents-vibecoder_app
```

---

## 🔍 Health Monitoring

### Container Health
- **Status**: Up and healthy
- **Uptime**: Stable since last restart
- **Memory Usage**: Normal
- **CPU Usage**: Normal

### Application Health
- **API Server**: Running on port 2999
- **Webhook Responses**: Active
- **Bot Initialization**: All 6 bots started successfully
- **Scene Registration**: 42 scenes registered

---

## 🚨 Recent Issues Resolved

1. **Missing Environment Variables**: Fixed by using `--env-file .env`
2. **Development Mode Override**: Disabled `TEST_BOT_NAME` variable
3. **Webhook Domain**: Managed via `WEBHOOK_DOMAIN`
4. **Container Restart Loop**: Resolved by proper environment configuration

---

## 📋 Maintenance Commands

### Check Status
```bash
ssh -i ~/.ssh/selectel root@185.161.67.53 "docker ps | grep 999-multibots"
```

### View Logs
```bash
ssh -i ~/.ssh/selectel root@185.161.67.53 "docker logs 999-multibots --tail 50"
```

### Restart Container
```bash
ssh -i ~/.ssh/selectel root@185.161.67.53 "docker restart 999-multibots"
```

### Check Environment
```bash
ssh -i ~/.ssh/selectel root@185.161.67.53 "docker exec 999-multibots printenv | grep BOT_TOKEN"
```

---

## 🎯 Next Steps

1. ✅ Monitor bot responsiveness
2. ✅ Verify webhook delivery from Telegram
3. ⏳ Scale up remaining 4 bots if needed
4. ⏳ Implement SSH Container Inspection System for ongoing monitoring

---

*Last Updated: August 30, 2025*  
*Status: Production Ready and Operational*