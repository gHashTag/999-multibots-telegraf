# 🚀 DEPLOYMENT COMMANDS - QUICK REFERENCE

## ⚡ FAST ACCESS COMMANDS

### 📋 Validation Commands
```bash
# Run all validations (RECOMMENDED BEFORE ANY DEPLOYMENT)
make check-all

# Install git protection hooks (FIRST TIME ONLY)
make install-hooks

# Check if hooks are installed
make check-hooks

# Validate deployment readiness
make check-deploy

# Quick automated check
make check-auto
```

### 🚀 Deployment Commands
```bash
# Deploy to development server (SAFE)
make deploy-dev

# Deploy to production server (WITH WARNINGS)
make deploy-prod
```

### 🔍 Health Checks
```bash
# Check development server (2 bots)
make health-dev

# Check production server (10 bots)
make health-prod
```

### 📚 Documentation
```bash
# Open deployment guide
make guide

# Open README
make readme

# Show all available commands
make help
```

### 🚨 Emergency Commands
```bash
# Emergency stop production (DANGER!)
make emergency-stop-prod

# Emergency stop development
make emergency-stop-dev
```

---

## 🔒 PROTECTION LAYERS

### Layer 1: Git Hooks
- **Pre-push**: Blocks production branch pushes
- **Pre-commit**: Validates changes before commit
- **Commit-msg**: Enforces conventional commit format

**Install**: `make install-hooks`

### Layer 2: Agent Permissions
- Blocks dangerous commands in agent settings
- Prevents force pushes and unauthorized deployments

**Configuration**: `.claude/settings.json`

### Layer 3: Validation Scripts
- `deployment-validator.sh`: Comprehensive validation
- `auto-deployment-check.sh`: Quick automated checks
- `git-protection-hooks.sh`: Install protection hooks

**Run**: `make check-all`

### Layer 4: Makefile Commands
- Safe, documented commands
- Built-in warnings and validation
- Clear separation of concerns

**Use**: `make <command>`

### Layer 5: Documentation
- `MASTER_DEPLOYMENT_GUIDE.md`: Complete guide (573 lines)
- `README_DEPLOYMENT.md`: Navigation index
- `DEPLOYMENT_COMMANDS.md`: This file

**Read**: `make guide`

---

## 🌐 SERVER INFORMATION

### Development Server (45.66.11.152)
- **Bots**: 2 in development mode
- **URL**: https://three-head-dev.shop
- **Connection**: `ssh -v -i ~/.ssh/zomro root@45.66.11.152`
- **Deployment**: `make deploy-dev`

### Production Server (212.86.115.30)
- **Bots**: 10 in production mode
- **URL**: https://three-head-dragon.shop
- **Connection**: `ssh -v -i ~/.ssh/zomro root@212.86.115.30`
- **Deployment**: `make deploy-prod`

---

## 🔄 STANDARD WORKFLOW

### 1. Development (temp-main)
```bash
# Work on feature
git checkout temp-main
# Make changes
git add .
git commit -m "feat: description"
git push origin temp-main
```

### 2. Test on Development
```bash
# Merge to main
git checkout main
git merge temp-main

# Validate everything
make check-all

# Deploy to development
make deploy-dev

# Test all features
make health-dev
```

### 3. Deploy to Production (After Testing)
```bash
# Merge to production
git checkout production
git merge main

# Validate everything
make check-all

# Deploy to production (WITH WARNINGS!)
make deploy-prod

# Verify all 10 bots
make health-prod
```

---

## ⚠️ CRITICAL WARNINGS

### Before Production Deployment
- [ ] ✅ Tested on development server
- [ ] ✅ All health checks pass (make health-dev)
- [ ] ✅ All validations pass (make check-all)
- [ ] ✅ Team approval received
- [ ] ✅ Read MASTER_DEPLOYMENT_GUIDE.md (make guide)
- [ ] ✅ Deployment window scheduled

### Emergency Procedures
**If Production Breaks**:
1. `make emergency-stop-prod`
2. Investigate issue
3. Redeploy from last known good state
4. Notify team immediately

**If Development Breaks**:
1. `make emergency-stop-dev`
2. Redeploy development
3. Test and fix

---

## 📊 MONITORING

### Health Check URLs
```
# Development
http://45.66.11.152:3000/health  # Bot 1
http://45.66.11.152:3001/health  # Bot 2

# Production
http://212.86.115.30:3000/health  # Bot 1
http://212.86.115.30:3001/health  # Bot 2
...
http://212.86.115.30:3009/health  # Bot 10
```

### Container Status
```bash
# Development
docker ps | grep dev-bot

# Production
docker ps | grep prod-bot
```

---

## 🎯 QUICK DECISION TREE

```
Need to deploy?
├─ Is it to production?
│  ├─ Yes → ⚠️ STOP! Read MASTER_DEPLOYMENT_GUIDE.md first
│  │         Then: make check-all → make deploy-prod
│  └─ No → Deploy to development: make deploy-dev
│
├─ Need to check something?
│  ├─ Health: make health-dev or make health-prod
│  ├─ Validation: make check-all
│  └─ Help: make help
│
└─ Emergency?
   ├─ Production broken: make emergency-stop-prod
   └─ Development broken: make emergency-stop-dev
```

---

## 📞 SUPPORT

### Key Files
```
📄 MASTER_DEPLOYMENT_GUIDE.md     # Complete guide
📄 README_DEPLOYMENT.md           # Navigation index
📄 DEPLOYMENT_COMMANDS.md         # This file
📄 MAKEFILE                       # All commands
```

### Scripts Location
```
📁 scripts/
├── 📄 deploy-production.sh        # Production deployment
├── 📄 deploy-development.sh       # Development deployment
├── 📄 deployment-validator.sh     # Validation script
├── 📄 auto-deployment-check.sh    # Auto-check script
└── 📄 git-protection-hooks.sh     # Install hooks
```

---

## ✅ REMEMBER

**🚨 PRODUCTION AFFECTS LIVE USERS! 🚨**

**✅ ALWAYS TEST ON DEVELOPMENT FIRST!**

**✅ ALWAYS RUN VALIDATION (make check-all)!**

**✅ ALWAYS READ THE GUIDE (make guide)!**

**✅ ALL PROTECTION LAYERS ACTIVE!**

---

*Quick Reference Guide - Use `make help` for all commands*
