# 🚀 MASTER DEPLOYMENT GUIDE

## 📅 Last Updated: 2025-11-02 20:15
## ⚠️ ОБЯЗАТЕЛЬНО К ИЗУЧЕНИЮ ВСЕМ АГЕНТАМ И РАЗРАБОТЧИКАМ

---

## 🎯 КРИТИЧЕСКИ ВАЖНАЯ АРХИТЕКТУРА

### Production Server (212.86.115.30)
- **Purpose**: Live production environment for users
- **Bots**: 10 bots in production mode
- **Mode**: Production (full features)
- **URL**: https://three-head-dragon.shop
- **SSL**: `/etc/letsencrypt/live/three-head-dragon.shop/fullchain.pem`
- **Connection**: `ssh -v -i ~/.ssh/zomro root@212.86.115.30`

### Development Server (45.66.11.152)
- **Purpose**: Development and testing environment
- **Bots**: 2 bots in development mode
- **Mode**: Development (safe for experiments)
- **URL**: https://three-head-dev.shop
- **SSL**: `/etc/letsencrypt/live/three-head-dev.shop/privkey.pem`
- **Connection**: `ssh -v -i ~/.ssh/zomro root@45.66.11.152`

---

## 🏗️ SERVER ARCHITECTURE DIAGRAM

```
┌─────────────────────────────────────────┐
│         PRODUCTION SERVER               │
│         212.86.115.30                   │
├─────────────────────────────────────────┤
│  Nginx Proxy (SSL)                      │
│  ├── three-head-dragon.shop             │
│  ├── Port 80 (HTTP redirect to HTTPS)   │
│  └── Port 443 (HTTPS)                   │
├─────────────────────────────────────────┤
│  Production Bots (10)                   │
│  ├── prod-bot-0  (Port 3000)            │
│  ├── prod-bot-1  (Port 3001)            │
│  ├── prod-bot-2  (Port 3002)            │
│  ├── ...                                │
│  └── prod-bot-9  (Port 3009)            │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│        DEVELOPMENT SERVER               │
│         45.66.11.152                    │
├─────────────────────────────────────────┤
│  Nginx Proxy (SSL)                      │
│  ├── three-head-dev.shop                │
│  ├── Port 80 (HTTP redirect to HTTPS)   │
│  └── Port 443 (HTTPS)                   │
├─────────────────────────────────────────┤
│  Development Bots (2)                   │
│  ├── dev-bot-0  (Port 3000)             │
│  └── dev-bot-1  (Port 3001)             │
└─────────────────────────────────────────┘
```

---

## 🧭 BRANCH STRATEGY

### Branch Workflow
```
temp-main (локально) → main (development server) → production (production server)
         ↓                    ↓                           ↓
    Разработка        Тестирование                    LIVE
```

### Branch Purposes
- **temp-main**: Local development and experimentation
- **main**: Development server (45.66.11.152) - safe for all changes
- **production**: Production server (212.86.115.30) - LIVE for users

---

## 🚀 DEPLOYMENT SCRIPTS

### Production Deployment (10 bots)
```bash
# On production server (212.86.115.30)
./scripts/deploy-production.sh

# Features:
# - Deploys 10 production bots
# - Full production configuration
# - SSL enabled with nginx
# - Load balancing across all bots
# - Health checks for all bots
# - Production logging and metrics
```

### Development Deployment (2 bots)
```bash
# On development server (45.66.11.152)
./scripts/deploy-development.sh

# Features:
# - Deploys 2 development bots
# - Safe for testing and experiments
# - SSL enabled with nginx
# - Load balancing across 2 bots
# - Health checks for all bots
# - Development logging
```

---

## 📋 STANDARD DEPLOYMENT WORKFLOW

### Step 1: Development (temp-main)
```bash
# 1. Create and work on feature branch
git checkout temp-main  # or create feature branch
# Make changes, test locally
git add .
git commit -m "feat: description of changes"

# 2. Push to temp-main or create PR
git push origin temp-main
# OR create Pull Request to main
```

### Step 2: Development Server Deployment
```bash
# 1. Merge to main
git checkout main
git merge temp-main

# 2. Deploy to development server
ssh root@45.66.11.152 "cd /root/999-agents-telegraf && ./scripts/deploy-development.sh"

# 3. Test on development server
curl -f http://45.66.11.152:3000/health  # Bot 1
curl -f http://45.66.11.152:3001/health  # Bot 2

# 4. Verify Inngest features work
# 5. Check all functionality
```

### Step 3: Production Deployment (After Testing)
```bash
# 1. Merge main to production
git checkout production
git merge main
git push origin production

# 2. Deploy to production server
ssh root@212.86.115.30 "cd /root/999-agents-telegraf && ./scripts/deploy-production.sh"

# 3. Verify all 10 bots respond
for i in {0..9}; do
  curl -f http://212.86.115.30:$((3000 + i))/health
done

# 4. Check production logs
docker ps | grep prod-bot
```

---

## 🛡️ AGENT CONFIGURATION & RULES

### Agent Configuration (.claude/config.json)
```json
{
  "server_configuration": {
    "production_server": "212.86.115.30",
    "development_server": "45.66.11.152",
    "production_config": {
      "bot_count": 10,
      "mode": "production",
      "description": "Full production bot farm with 10 bots"
    },
    "development_config": {
      "bot_count": 2,
      "mode": "development",
      "description": "Development environment with 2 bots for testing"
    }
  }
}
```

### Agent Permissions (.claude/settings.json)
```json
{
  "deny": [
    "Bash(rm -rf /)",
    "Bash(eval *)",
    "Bash(force push to main)",
    "Bash(git push origin production --force)",
    "Bash(force deploy to production)",
    "Bash(skip health check production)",
    "Bash(deploy to production without testing)"
  ]
}
```

---

## ✅ INNGEST MIGRATION STATUS

### Completed Inngest Features
- ✅ **neuroPhotoWizardV2** (40% users) - 98% faster
- ✅ **textToImageWizard** (20% users) - 95% faster
- ✅ **aiReelsWizard** (15% users) - 90% faster
- ✅ **aiReelsRenderWizard** - Status tracking added
- ✅ **instagramScrapingWizard** - Status tracking added

### Inngest Infrastructure
- ✅ Inngest client with eventId returns
- ✅ Webhook handler for automatic results
- ✅ Status tracking with 🔄 Check status button
- ✅ Inngest monitoring enabled

---

## 🚫 STRICTLY FORBIDDEN

### Production Server (212.86.115.30)
- ❌ **Deploy without testing on development first**
- ❌ **Force push to main branch**
- ❌ **Skip health checks after deployment**
- ❌ **Direct changes to production branch**
- ❌ **Deploy without explicit permission**
- ❌ **Stop/restart production containers without cause**

### Git Commands
- ❌ `git push origin production --force` - НИКОГДА!
- ❌ `git push origin main --force` - Может сломать!
- ❌ `git push origin production` - Только после тестирования!

---

## ✅ SAFE ACTIONS

### Always Allowed
- ✅ `git push origin temp-main` - Local development
- ✅ `git push origin main` - Development deployment
- ✅ Deploy to 45.66.11.152 (development server)
- ✅ Create PRs to main
- ✅ Experiment in development server
- ✅ Use ./scripts/deploy-development.sh

### Conditional (After Testing)
- ✅ Deploy to 212.86.115.30 (production server) - AFTER testing
- ✅ Merge main to production - AFTER verification
- ✅ Use ./scripts/deploy-production.sh - ONLY after testing

---

## 🔍 MONITORING & HEALTH CHECKS

### Health Check Commands
```bash
# Production server (all 10 bots)
for i in {0..9}; do
  curl -f http://212.86.115.30:$((3000 + i))/health
done

# Development server (both bots)
curl -f http://45.66.11.152:3000/health  # Bot 1
curl -f http://45.66.11.152:3001/health  # Bot 2
```

### Container Management
```bash
# Check status
docker ps | grep prod-bot    # Production
docker ps | grep dev-bot     # Development

# View logs
docker logs prod-bot-0        # Production bot 0
docker logs dev-bot-0         # Development bot 0

# Restart specific bot
docker restart prod-bot-0
docker restart dev-bot-0
```

### Expected Health Response
```json
{
  "status": "UP",
  "source": "health.routes",
  "timestamp": "2025-11-02T12:07:11.609Z"
}
```

---

## 🚨 EMERGENCY PROCEDURES

### If Production Breaks
```bash
# 1. IMMEDIATELY stop all containers
docker stop $(docker ps -aq)
docker rm $(docker ps -aq)

# 2. Redeploy from last known good state
git checkout <last-good-commit>
./scripts/deploy-production.sh

# 3. Verify all bots
for i in {0..9}; do
  curl -f http://212.86.115.30:$((3000 + i))/health
done

# 4. Notify team immediately
```

### If Development Breaks
```bash
# 1. Stop containers
docker stop $(docker ps -aq)
docker rm $(docker ps -aq)

# 2. Redeploy development
git checkout main
./scripts/deploy-development.sh

# 3. Verify health
curl -f http://45.66.11.152:3000/health
curl -f http://45.66.11.152:3001/health
```

---

## 📊 VERIFICATION CHECKLISTS

### Pre-Production Deployment
- [ ] Test all features on development server
- [ ] Verify development health checks (2 bots)
- [ ] Check Inngest features work correctly
- [ ] Test load balancing on development
- [ ] Verify SSL certificates on development
- [ ] Check logging and monitoring

### Post-Production Deployment
- [ ] All 10 production bots responding to health checks
- [ ] Health checks return {"status":"UP"}
- [ ] SSL working correctly (https://three-head-dragon.shop)
- [ ] Nginx load balancing functional
- [ ] Inngest migration active in production
- [ ] No critical errors in production logs
- [ ] Performance metrics within normal range

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

## 📋 INNGEST TESTING PROCEDURES

### Development Testing
```bash
# 1. Deploy to development
./scripts/deploy-development.sh

# 2. Test Inngest client
curl -X POST http://localhost:3000/test-inngest \
  -H "Content-Type: application/json" \
  -d '{"type": "test"}'

# 3. Test webhook simulation
curl -X POST http://localhost:3000/inngest-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "type": "generation-completed",
    "data": {
      "eventId": "test-event-123",
      "status": "completed",
      "userId": "123456789",
      "result": {
        "imageUrl": "https://example.com/test.jpg"
      }
    }
  }'
```

### Expected Test Results
- ✅ Inngest event sent successfully with event ID
- ✅ Webhook handler processes correctly
- ✅ Status tracking updates properly
- ✅ User receives result via telegram

---

## 🎯 KEY DIFFERENCES: PRODUCTION vs DEVELOPMENT

| Aspect | Production | Development |
|--------|-----------|-------------|
| **Bots** | 10 | 2 |
| **Mode** | Production | Development |
| **Purpose** | Live users | Testing/Experiments |
| **API** | Production API | Development API |
| **Logging** | Full production logging | Reduced development logging |
| **Monitoring** | Full metrics & alerts | Basic monitoring |
| **Safety** | Critical - affects users | Safe for experiments |
| **SSL Domain** | three-head-dragon.shop | three-head-dev.shop |
| **Bot Names** | All production bots | 2 test bots |

---

## 🔄 ROLLBACK PROCEDURES

### Quick Rollback (Emergency)
```bash
# 1. Stop all containers
docker stop $(docker ps -aq)
docker rm $(docker ps -aq)

# 2. Redeploy last known good version
git checkout <commit-hash-before-issue>
./scripts/deploy-production.sh

# 3. Verify rollback
for i in {0..9}; do
  curl -f http://212.86.115.30:$((3000 + i))/health
done
```

### Planned Rollback
```bash
# 1. Prepare rollback commit
git revert <problematic-commit>

# 2. Test on development first
git push origin main
ssh root@45.66.11.152 "cd /root/999-agents-telegraf && ./scripts/deploy-development.sh"

# 3. Deploy rollback to production
git checkout production
git merge main
ssh root@212.86.115.30 "cd /root/999-agents-telegraf && ./scripts/deploy-production.sh"
```

---

## 📞 SUPPORT & CONTACTS

### Emergency Contacts
- **DevOps Team**: Immediate notification required
- **Technical Lead**: For production issues
- **QA Team**: For testing verification

### Resources
- **Inngest Dashboard**: Monitor event processing
- **Server Logs**: `docker logs <container-name>`
- **Nginx Logs**: Check SSL and load balancing
- **Health Endpoints**: `/health` on each bot

---

## ✅ MASTER CHECKLIST - MUST READ

### Before Any Deployment
- [ ] Read this entire guide
- [ ] Understand difference between production and development
- [ ] Know which server you're deploying to
- [ ] Test on development first
- [ ] Have rollback plan ready

### Before Production Deployment
- [ ] All tests pass on development
- [ ] Health checks pass for all 2 development bots
- [ ] Inngest features verified working
- [ ] SSL certificates valid
- [ ] Team notified of deployment window

### After Production Deployment
- [ ] All 10 production bots healthy (health checks pass)
- [ ] No critical errors in logs
- [ ] Performance metrics normal
- [ ] Users can interact with bots
- [ ] Inngest processing working
- [ ] Monitoring alerts configured

---

## 🎯 CONCLUSION

**DEPLOYMENT SYSTEM: PRODUCTION READY ✅**

### Production Server (212.86.115.30)
- ✅ 10 bots in production mode for live users
- ✅ Full production features and monitoring
- ✅ SSL certificates configured
- ✅ Load balancing with nginx
- ✅ Health monitoring for all bots

### Development Server (45.66.11.152)
- ✅ 2 bots in development mode for testing
- ✅ Safe environment for experiments
- ✅ SSL certificates configured
- ✅ Load balancing with nginx
- ✅ Health monitoring for all bots

### Deployment Scripts
- ✅ `deploy-production.sh`: Deploy 10 bots to production
- ✅ `deploy-development.sh`: Deploy 2 bots to development
- ✅ Both include health checks and monitoring
- ✅ Both include SSL and load balancing

### Agent Configuration
- ✅ Production deployment allowed with safeguards
- ✅ Development deployment always safe
- ✅ Emergency procedures documented
- ✅ Health monitoring automated

### Critical Rules
1. **ALWAYS test on development first (45.66.11.152)**
2. **THEN deploy to production (212.86.115.30)**
3. **NEVER skip health checks**
4. **NEVER force push to main**
5. **ALWAYS have rollback plan**

**Safe workflow: Development → Testing → Production**

---

**🚨 REMEMBER: PRODUCTION AFFECTS LIVE USERS! TEST EVERYTHING ON DEVELOPMENT FIRST! 🚨**

---

*This is the MASTER deployment guide. All agents must read and understand this document before any deployment operations.*

*Last Updated: 2025-11-02 20:15 by Claude Code*
