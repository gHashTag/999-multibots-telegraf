# 🚀 DEPLOYMENT GUIDE - PRODUCTION READY

## 📅 Date: 2025-11-02 20:08

---

## ✅ SYSTEM ARCHITECTURE CONFIGURED

### Production Server (212.86.115.30)
- **Status**: 10 bots in production mode
- **Purpose**: Live production environment for users
- **URL**: https://three-head-dragon.shop
- **SSL**: Configured with Let's Encrypt
- **Load Balancing**: Nginx with automatic distribution
- **Health Monitoring**: Active for all 10 bots

### Development Server (45.66.11.152)
- **Status**: 2 bots in development mode
- **Purpose**: Safe testing and development environment
- **URL**: https://three-head-dev.shop
- **SSL**: Configured with Let's Encrypt
- **Load Balancing**: Nginx with automatic distribution
- **Health Monitoring**: Active for all 2 bots

---

## 🔧 CONNECTION COMMANDS

### Development Server
```bash
ssh -v -i ~/.ssh/zomro root@45.66.11.152
```

### Production Server
```bash
ssh -v -i ~/.ssh/zomro root@212.86.115.30
```

---

## 🚀 DEPLOYMENT INSTRUCTIONS

### Step 1: Development Deployment
```bash
# 1. Push to main branch
git push origin main

# 2. Deploy to development server
ssh root@45.66.11.152 "cd /root/999-agents-telegraf && ./scripts/deploy-development.sh"

# 3. Verify deployment
curl -f http://45.66.11.152:3000/health
curl -f http://45.66.11.152:3001/health
```

### Step 2: Production Deployment (After Testing)
```bash
# 1. Merge to production branch
git checkout production
git merge main
git push origin production

# 2. Deploy to production server
ssh root@212.86.115.30 "cd /root/999-agents-telegraf && ./scripts/deploy-production.sh"

# 3. Verify all bots
for i in {0..9}; do
  curl -f http://212.86.115.30:$((3000 + i))/health
done
```

---

## 🔍 MONITORING COMMANDS

### Check Container Status
```bash
# Production
docker ps | grep prod-bot

# Development
docker ps | grep dev-bot
```

### View Logs
```bash
# Specific bot logs
docker logs prod-bot-0  # Production bot 0
docker logs dev-bot-0   # Development bot 0

# Follow logs
docker logs -f prod-bot-0
```

### Health Checks
```bash
# Production health
curl -f http://212.86.115.30:3000/health
curl -f http://212.86.115.30:3001/health
# ... repeat for all 10 bots

# Development health
curl -f http://45.66.11.152:3000/health
curl -f http://45.66.11.152:3001/health
```

---

## 🛡️ AGENT CONFIGURATION

### Agent Rules (.claude/config.json)
```json
{
  "server_configuration": {
    "production_server": "212.86.115.30",
    "development_server": "45.66.11.152",
    "production_config": {
      "bot_count": 10,
      "mode": "production"
    },
    "development_config": {
      "bot_count": 2,
      "mode": "development"
    }
  }
}
```

### Agent Permissions (.claude/settings.json)
```json
{
  "deny": [
    "Bash(force push to main)",
    "Bash(git push origin production --force)",
    "Bash(force deploy to production)",
    "Bash(skip health check production)",
    "Bash(deploy to production without testing)"
  ]
}
```

---

## 🚨 EMERGENCY PROCEDURES

### If Production Breaks
```bash
# 1. Stop all containers
docker stop $(docker ps -aq)
docker rm $(docker ps -aq)

# 2. Redeploy from last known state
./scripts/deploy-production.sh

# 3. Verify all bots
for i in {0..9}; do
  curl -f http://212.86.115.30:$((3000 + i))/health
done
```

### If Development Breaks
```bash
# 1. Stop containers
docker stop $(docker ps -aq)
docker rm $(docker ps -aq)

# 2. Redeploy development
./scripts/deploy-development.sh

# 3. Verify health
curl -f http://45.66.11.152:3000/health
curl -f http://45.66.11.152:3001/health
```

---

## 📊 VERIFICATION CHECKLIST

### Pre-Production Deployment
- [ ] Test features on development server
- [ ] Verify development health checks (2 bots)
- [ ] Check Inngest features work
- [ ] Test load balancing
- [ ] Verify SSL certificates
- [ ] Check logging

### Post-Production Deployment
- [ ] All 10 production bots responding
- [ ] Health checks passing
- [ ] SSL working correctly
- [ ] Nginx load balancing functional
- [ ] Inngest migration active
- [ ] No errors in logs

---

## 🎯 KEY DIFFERENCES

| Aspect | Production | Development |
|--------|-----------|-------------|
| **Bots** | 10 | 2 |
| **Mode** | Production | Development |
| **Purpose** | Live users | Testing |
| **API** | Production API | Development API |
| **Logging** | Full logging | Reduced logging |
| **Monitoring** | Full metrics | Basic metrics |
| **Safety** | Critical | Safe for experiments |

---

## ✅ CONCLUSION

**DEPLOYMENT SYSTEM: PRODUCTION READY**

✅ **Production Server (212.86.115.30)**
- 10 bots in production mode
- Full feature set enabled
- SSL certificates configured
- Load balancing active
- Health monitoring enabled

✅ **Development Server (45.66.11.152)**
- 2 bots in development mode
- Safe for testing and experiments
- SSL certificates configured
- Load balancing active
- Health monitoring enabled

✅ **Deployment Scripts**
- `deploy-production.sh`: Deploy 10 bots to production
- `deploy-development.sh`: Deploy 2 bots to development
- Both include health checks and monitoring

✅ **Agent Configuration**
- Production deployment allowed with safeguards
- Development deployment always allowed
- Emergency procedures documented
- Health monitoring automated

**Safe workflow: Development → Testing → Production**

---

*Architecture configured at 2025-11-02 20:08 by Claude Code*
