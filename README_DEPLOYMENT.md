# 📚 DEPLOYMENT DOCUMENTATION INDEX

## 🎯 QUICK START

### ⚡ For Deployment Operations
**READ FIRST**: [MASTER_DEPLOYMENT_GUIDE.md](./MASTER_DEPLOYMENT_GUIDE.md)
- ✅ Complete deployment guide (573 lines)
- ✅ All rules, workflows, and procedures
- ✅ Inngest migration details
- ✅ Emergency procedures

### 🔗 Server Connections
- **Development**: `ssh -v -i ~/.ssh/zomro root@45.66.11.152`
- **Production**: `ssh -v -i ~/.ssh/zomro root@212.86.115.30`

---

## 📋 DOCUMENTATION OVERVIEW

### 🚀 Deployment Guides

| Document | Purpose | Audience |
|----------|---------|----------|
| **[MASTER_DEPLOYMENT_GUIDE.md](./MASTER_DEPLOYMENT_GUIDE.md)** | Complete deployment reference | All agents & developers |
| **[DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)** | Step-by-step deployment instructions | DevOps team |
| **[SERVER_ARCHITECTURE.md](./SERVER_ARCHITECTURE.md)** | Server architecture diagrams | Architects |
| **[DEPLOYMENT_RULES.md](./DEPLOYMENT_RULES.md)** | Basic deployment rules | New team members |

### 🔧 Script Documentation

| Script | Purpose | Usage |
|--------|---------|-------|
| **[deploy-production.sh](./scripts/deploy-production.sh)** | Deploy 10 bots to production | Production deployment |
| **[deploy-development.sh](./scripts/deploy-development.sh)** | Deploy 2 bots to development | Development deployment |

### 📊 Reports & History

| Document | Purpose | Date |
|----------|---------|------|
| **[DEPLOYMENT_REPORT.md](./DEPLOYMENT_REPORT.md)** | Main branch deployment status | 2025-11-02 |
| **[PRODUCTION_RECOVERY_REPORT.md](./PRODUCTION_RECOVERY_REPORT.md)** | Production recovery procedures | 2025-11-02 |
| **[INNGEST_MIGRATION_GUIDE.md](./INNGEST_MIGRATION_GUIDE.md)** | Inngest migration testing | 2025-11-02 |

### 🛡️ Agent Configuration

| File | Purpose | Content |
|------|---------|---------|
| **[.claude/config.json](./.claude/config.json)** | Agent deployment rules | Server config, Inngest status, master guide reference |
| **[.claude/settings.json](./.claude/settings.json)** | Agent permissions | Allow/deny lists for deployment commands |
| **[CLAUDECODE_RULES.md](./CLAUDECODE_RULES.md)** | Critical agent rules | MUST READ section with master guide reference |

---

## 🎯 ARCHITECTURE SUMMARY

### Production Server (212.86.115.30)
- **Bots**: 10 in production mode
- **URL**: https://three-head-dragon.shop
- **SSL**: `/etc/letsencrypt/live/three-head-dragon.shop/`
- **Purpose**: Live users

### Development Server (45.66.11.152)
- **Bots**: 2 in development mode
- **URL**: https://three-head-dev.shop
- **SSL**: `/etc/letsencrypt/live/three-head-dev.shop/`
- **Purpose**: Safe testing

---

## 🚀 DEPLOYMENT WORKFLOW

### 1. Development (temp-main)
```bash
git checkout temp-main
# Make changes
git push origin temp-main
```

### 2. Development Server (main)
```bash
git checkout main
git merge temp-main
ssh root@45.66.11.152 "cd /root/999-agents-telegraf && ./scripts/deploy-development.sh"
# Test all features
```

### 3. Production (production)
```bash
git checkout production
git merge main
ssh root@212.86.115.30 "cd /root/999-agents-telegraf && ./scripts/deploy-production.sh"
# Verify all 10 bots
```

---

## ⚠️ CRITICAL RULES

### For All Agents
1. **READ** [MASTER_DEPLOYMENT_GUIDE.md](./MASTER_DEPLOYMENT_GUIDE.md) before any deployment
2. **TEST** on development server first (45.66.11.152)
3. **VERIFY** health checks after deployment
4. **NEVER** force push to main or production

### Forbidden Actions
- ❌ Deploy to production without testing
- ❌ Force push to main branch
- ❌ Skip health checks
- ❌ Direct changes to production branch

---

## 🔍 MONITORING

### Health Checks
```bash
# Production (all 10 bots)
for i in {0..9}; do
  curl -f http://212.86.115.30:$((3000 + i))/health
done

# Development (both bots)
curl -f http://45.66.11.152:3000/health
curl -f http://45.66.11.152:3001/health
```

### Container Status
```bash
docker ps | grep prod-bot    # Production
docker ps | grep dev-bot     # Development
```

---

## 🚨 EMERGENCY PROCEDURES

### If Production Breaks
1. **Stop** all containers: `docker stop $(docker ps -aq)`
2. **Redeploy** from last good state: `./scripts/deploy-production.sh`
3. **Verify** all 10 bots respond to health checks
4. **Notify** team immediately

### If Development Breaks
1. **Stop** containers: `docker stop $(docker ps -aq)`
2. **Redeploy** development: `./scripts/deploy-development.sh`
3. **Verify** 2 bots respond

---

## 📞 SUPPORT

### Resources
- **[Inngest Dashboard](https://dashboard.inngest.com)**: Monitor event processing
- **Server Logs**: `docker logs <container-name>`
- **Health Endpoints**: `/health` on each bot

### Key Files Location
```
📁 Project Root/
├── 📄 MASTER_DEPLOYMENT_GUIDE.md (MAIN DOCUMENT)
├── 📄 DEPLOYMENT_GUIDE.md
├── 📄 SERVER_ARCHITECTURE.md
├── 📄 INNGEST_MIGRATION_GUIDE.md
├── 📁 scripts/
│   ├── 📄 deploy-production.sh
│   └── 📄 deploy-development.sh
└── 📁 .claude/
    ├── 📄 config.json
    └── 📄 settings.json
```

---

## ✅ VERIFICATION CHECKLIST

Before any deployment:
- [ ] Read MASTER_DEPLOYMENT_GUIDE.md
- [ ] Understand server architecture
- [ ] Know which server you're deploying to
- [ ] Have rollback plan ready
- [ ] Test on development first

After production deployment:
- [ ] All 10 bots healthy (health checks pass)
- [ ] SSL working (https://three-head-dragon.shop)
- [ ] Inngest processing working
- [ ] No critical errors in logs
- [ ] Performance metrics normal

---

## 🎯 SUMMARY

**🎯 ONE SOURCE OF TRUTH**: [MASTER_DEPLOYMENT_GUIDE.md](./MASTER_DEPLOYMENT_GUIDE.md)

**🚨 REMEMBER**:
- Production (212.86.115.30) = 10 bots = Live users
- Development (45.66.11.152) = 2 bots = Safe testing
- Always test on development first!
- Read MASTER_DEPLOYMENT_GUIDE.md before ANY deployment!

**🚀 SYSTEM STATUS**: Production Ready
- ✅ Inngest migration complete
- ✅ Deployment scripts tested
- ✅ Health monitoring active
- ✅ Emergency procedures documented
- ✅ Agent configuration updated

---

*Last Updated: 2025-11-02 20:15*
*For questions or issues, refer to MASTER_DEPLOYMENT_GUIDE.md*
