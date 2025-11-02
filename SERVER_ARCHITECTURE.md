# 🏗️ SERVER ARCHITECTURE

## 📅 Updated: 2025-11-02 20:08

---

## 🎯 ARCHITECTURE OVERVIEW

### Production Server (212.86.115.30)
- **Purpose**: Live production environment
- **Bots**: 10 production bots
- **Mode**: Production (full features)
- **URL**: https://three-head-dragon.shop
- **SSL**: `/etc/letsencrypt/live/three-head-dragon.shop/fullchain.pem`

### Development Server (45.66.11.152)
- **Purpose**: Development and testing environment
- **Bots**: 2 development bots
- **Mode**: Development (safe for experiments)
- **URL**: https://three-head-dev.shop
- **SSL**: `/etc/letsencrypt/live/three-head-dev.shop/privkey.pem`

---

## 🚀 DEPLOYMENT SCRIPTS

### Production Deployment
```bash
# On production server (212.86.115.30)
./scripts/deploy-production.sh

# Features:
# - Deploys 10 production bots
# - Full production configuration
# - SSL enabled
# - Load balancing with nginx
# - Health checks for all bots
```

### Development Deployment
```bash
# On development server (45.66.11.152)
./scripts/deploy-development.sh

# Features:
# - Deploys 2 development bots
# - Safe for testing and experiments
# - SSL enabled
# - Load balancing with nginx
# - Health checks for all bots
```

---

## 🔧 CONNECT COMMANDS

### Development Server
```bash
ssh -v -i ~/.ssh/zomro root@45.66.11.152
```

### Production Server
```bash
ssh -v -i ~/.ssh/zomro root@212.86.115.30
```

---

## 📊 CONTAINER STRUCTURE

### Production Server
```
┌─────────────────────────────────────┐
│         PRODUCTION SERVER           │
│         212.86.115.30               │
├─────────────────────────────────────┤
│  Nginx Proxy (SSL)                  │
│  ├── Port 80 (HTTP)                 │
│  └── Port 443 (HTTPS)               │
├─────────────────────────────────────┤
│  Production Bots (10)               │
│  ├── prod-bot-0  (Port 3000)        │
│  ├── prod-bot-1  (Port 3001)        │
│  ├── prod-bot-2  (Port 3002)        │
│  ├── ...                            │
│  └── prod-bot-9  (Port 3009)        │
├─────────────────────────────────────┤
│  Management Ports (4000-4009)       │
│  └── Debug/Management               │
└─────────────────────────────────────┘
```

### Development Server
```
┌─────────────────────────────────────┐
│        DEVELOPMENT SERVER           │
│         45.66.11.152                │
├─────────────────────────────────────┤
│  Nginx Proxy (SSL)                  │
│  ├── Port 80 (HTTP)                 │
│  └── Port 443 (HTTPS)               │
├─────────────────────────────────────┤
│  Development Bots (2)               │
│  ├── dev-bot-0  (Port 3000)         │
│  └── dev-bot-1  (Port 3001)         │
├─────────────────────────────────────┤
│  Management Ports (4000-4001)       │
│  └── Debug/Management               │
└─────────────────────────────────────┘
```

---

## 🔍 MONITORING & HEALTH CHECKS

### Health Check Commands
```bash
# Production server
curl -f http://212.86.115.30:3000/health  # Bot 1
curl -f http://212.86.115.30:3001/health  # Bot 2
# ... continue for all 10 bots

# Development server
curl -f http://45.66.11.152:3000/health  # Bot 1
curl -f http://45.66.11.152:3001/health  # Bot 2
```

### Container Status
```bash
# Check all containers
docker ps

# Check specific bot logs
docker logs prod-bot-0  # Production bot 0
docker logs dev-bot-0   # Development bot 0

# Restart specific bot
docker restart prod-bot-0
docker restart dev-bot-0
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

## 🚨 DEPLOYMENT WORKFLOW

### 1. Development First
```bash
# 1. Deploy to development server first
git push origin main
ssh root@45.66.11.152 "cd /root/999-agents-telegraf && ./scripts/deploy-development.sh"

# 2. Test features on development
curl -f http://45.66.11.152:3000/health
curl -f http://45.66.11.152:3001/health

# 3. Verify Inngest features work
# 4. Check all functionality
```

### 2. Production Deployment
```bash
# 1. Merge main to production branch
git checkout production
git merge main
git push origin production

# 2. Deploy to production server
ssh root@212.86.115.30 "cd /root/999-agents-telegraf && ./scripts/deploy-production.sh"

# 3. Verify all bots respond
for i in {0..9}; do
  curl -f http://212.86.115.30:$((3000 + i))/health
done

# 4. Check production logs
docker ps | grep prod-bot
```

---

## 🔄 EMERGENCY PROCEDURES

### If Production Breaks
```bash
# 1. Stop all containers
docker stop $(docker ps -aq)
docker rm $(docker ps -aq)

# 2. Redeploy from last known good state
git checkout <last-good-commit>
./scripts/deploy-production.sh

# 3. Verify health
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
git checkout main
./scripts/deploy-development.sh

# 3. Verify health
curl -f http://45.66.11.152:3000/health
curl -f http://45.66.11.152:3001/health
```

---

## 📋 VERIFICATION CHECKLIST

### Pre-Production Deployment
- [ ] Test on development server first
- [ ] Verify health checks pass
- [ ] Check Inngest features work
- [ ] Verify load balancing
- [ ] Test SSL certificates
- [ ] Check logging

### Post-Production Deployment
- [ ] All 10 bots responding
- [ ] Health checks passing
- [ ] SSL working correctly
- [ ] Nginx load balancing
- [ ] Inngest migration active
- [ ] No errors in logs

---

## 🎯 CONCLUSION

**SYSTEM ARCHITECTURE: PRODUCTION READY**

- Production: 10 bots for live users (212.86.115.30)
- Development: 2 bots for testing (45.66.11.152)
- SSL certificates configured
- Health monitoring active
- Deployment scripts ready
- Emergency procedures documented

**Safe deployment workflow: Development → Testing → Production**
