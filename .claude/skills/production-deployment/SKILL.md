---
name: production-deployment
description: Production deployment procedures, Docker workflow, SSH automation, and health monitoring for 188.137.250.69 server
---

# Production Deployment Skill

Expert knowledge for deploying this Telegram bot to production server.

## Server Information

**Current Production Server**: 188.137.250.69 (changed from 212.86.115.30)
**SSH User**: root
**Deployment Path**: `/root/bot-farm/`
**Docker Container**: Running on production with auto-restart

## Deployment Methods

### 1. Automated Deployment (Recommended)

```bash
npm run deploy
# or run the very same script directly:
./deploy.sh [dev|staging|production] [--force] [--no-cache]
```

`npm run deploy` is defined in `package.json` as `chmod +x deploy.sh && ./deploy.sh`,
so both commands run `deploy.sh` in the repository root (production by default).

This script:

1. Syncs `.env` file to production
2. Copies source code via rsync
3. Rebuilds Docker container on production
4. Starts new container with health checks
5. Monitors startup for errors

### 2. Manual Deployment

```bash
# SSH to production
ssh root@188.137.250.69

# Navigate to bot directory
cd /root/bot-farm

# Pull latest code (if using git)
git pull

# Rebuild Docker
docker-compose down
docker-compose build --no-cache
docker-compose up -d

# Check logs
docker-compose logs -f --tail=100
```

### 3. Quick Check Deployment

```bash
bun run typecheck          # ошибки типов
npm run test:gate          # регрессии против baseline
```

## Docker Configuration

### docker-compose.yml Location

`/root/bot-farm/docker-compose.yml` on production

### Key Docker Commands

```bash
# View running containers
docker ps

# Check logs
docker-compose logs -f bot-farm
docker-compose logs --tail=100 bot-farm

# Restart container
docker-compose restart bot-farm

# Rebuild and restart
docker-compose down
docker-compose up -d --build

# Stop all
docker-compose down

# Remove and rebuild
docker-compose down
docker system prune -f
docker-compose up -d --build
```

## Health Monitoring

Деплой идёт в Railway (сервис `999-multibots-telegraf`), поэтому состояние
смотрится его инструментами:

```bash
railway deployment list   # состояние последних сборок
railway logs              # логи сервиса
```

Проверять после деплоя:

- сборка в состоянии SUCCESS, а не CRASHED
- в логах нет критических ошибок старта
- бот отвечает на `/start` в Telegram

### Log Monitoring

```bash
railway logs                                     # прод, стрим
docker logs 999-multibots --tail 100 --follow    # локальный контейнер
docker-compose logs -f --tail=100                # локальный стек
```

## Deployment Checklist

### Pre-Deployment

- [ ] Run `bun test` locally
- [ ] Run `npm run typecheck`
- [ ] Run `npm run build:nocheck`
- [ ] Check `.env` has all required Infisical keys
- [ ] Test locally with `bun run dev`
- [ ] Review recent git commits

### During Deployment

- [ ] Run `npm run deploy`
- [ ] Watch deployment output for errors
- [ ] Verify Docker container starts
- [ ] Check initial logs for startup errors

### Post-Deployment

- [ ] Run `npm run test:gate`
- [ ] Test bot in Telegram (send /start)
- [ ] Check critical features work
- [ ] Monitor logs for 5-10 minutes
- [ ] Verify webhooks/polling active

## Common Issues and Fixes

### Issue: Container Won't Start

```bash
# Check Docker logs
ssh root@188.137.250.69 "cd /root/bot-farm && docker-compose logs --tail=50"

# Common causes:
# 1. Infisical credentials invalid
# 2. Port already in use
# 3. Syntax errors in code
# 4. Missing environment variables
```

### Issue: JavaScript Errors in Production

```bash
# Check errors
bun run typecheck

# View detailed logs
railway logs

# If simple fix needed
bunx eslint . --ext .ts --fix

# Manual fix and redeploy
# Fix code locally, then:
npm run deploy
```

### Issue: Old Container Running

```bash
ssh root@188.137.250.69
docker ps -a
docker-compose down
docker-compose up -d --build
```

### Issue: Port Conflicts

```bash
# Check what's using port
ssh root@188.137.250.69 "lsof -i :3000"

# Kill conflicting process
ssh root@188.137.250.69 "pkill -f 'node.*bot'"

# Restart
npm run deploy
```

## Environment Variables

### Production .env Location

- Local: `/Users/playra/999-agents-telegraf/.env`
- Production: `/root/bot-farm/.env`

### Critical Variables (Managed by Infisical)

```bash
INFISICAL_CLIENT_ID=...
INFISICAL_CLIENT_SECRET=...
INFISICAL_PROJECT_ID=...
INFISICAL_ENVIRONMENT=dev  # or prod
NODE_ENV=production
```

**IMPORTANT**: Only these 5 variables in .env. All other secrets loaded from Infisical!

## Deployment Scripts Reference

### deploy.sh (repository root)

Main deployment script, the one `npm run deploy` invokes:

- Syncs code to production over rsync
- Rebuilds Docker container
- Monitors startup and the `/health` endpoint
- Reports errors

Do not use `scripts/deploy/deploy.sh`: it is the pre-cleanup copy of this
script, and it still deploys over SSH to the decommissioned server
`212.86.115.30` (see "Server Information" above).

### scripts/health-monitor.sh

Health monitoring:

- `check`: Single health check
- `monitor`: Continuous monitoring
- `rollback`: Emergency rollback

### scripts/logs-monitor.js

Log analysis:

- Real-time error detection
- Error context extraction
- Fix suggestions
- Auto-fix capability

### scripts/js-error-check.sh

Production error checker:

- Scans last 100 log lines
- Identifies JS errors
- Provides detailed error info
- Can attempt auto-fix

## SSH Configuration

### SSH Access

```bash
# Direct SSH
ssh root@188.137.250.69

# With command execution
ssh root@188.137.250.69 "command here"

# Copy files
scp local-file root@188.137.250.69:/root/bot-farm/
rsync -avz src/ root@188.137.250.69:/root/bot-farm/src/
```

### Pre-approved SSH Commands

These commands don't require user approval in Claude Code:

- `ssh root@188.137.250.69:*`
- `scp * root@188.137.250.69:/root/bot-farm/`
- `rsync * root@188.137.250.69:/root/bot-farm/`

## Rollback Procedure

### Quick Rollback

```bash
railway deployment list
```

### Manual Rollback

```bash
ssh root@188.137.250.69
cd /root/bot-farm

# Checkout previous version
git log --oneline -10
git checkout <previous-commit-hash>

# Rebuild
docker-compose down
docker-compose up -d --build

# Verify
docker-compose logs -f
```

## Performance Monitoring

### Resource Usage

```bash
ssh root@188.137.250.69 "docker stats --no-stream"
```

### Log Size Management

```bash
# Check log size
ssh root@188.137.250.69 "du -sh /root/bot-farm/logs"

# Rotate logs
ssh root@188.137.250.69 "cd /root/bot-farm && find logs -name '*.log' -mtime +7 -delete"
```

## Emergency Procedures

### Bot Completely Down

```bash
# 1. Check if container running
ssh root@188.137.250.69 "docker ps"

# 2. Check logs for errors
ssh root@188.137.250.69 "cd /root/bot-farm && docker-compose logs --tail=100"

# 3. Restart container
ssh root@188.137.250.69 "cd /root/bot-farm && docker-compose restart"

# 4. If still down, rebuild
npm run deploy

# 5. If still issues, rollback
railway deployment list
```

### Database Connection Issues

```bash
# Check Supabase status
# Check Infisical for correct credentials
# Verify SUPABASE_URL and SUPABASE_SERVICE_KEY loaded

ssh root@188.137.250.69
cd /root/bot-farm
docker-compose logs | grep -i "supabase\|database"
```

### Memory Issues

```bash
# Check memory usage
ssh root@188.137.250.69 "free -h"
ssh root@188.137.250.69 "docker stats --no-stream"

# Restart to clear memory
ssh root@188.137.250.69 "cd /root/bot-farm && docker-compose restart"

# If persistent, restart server
ssh root@188.137.250.69 "reboot"
```

## Best Practices

1. **Always test locally first** before deploying
2. **Use automated deployment** script, not manual
3. **Monitor logs immediately** after deployment
4. **Keep .env synced** between local and production
5. **Don't modify code directly** on production server
6. **Use Git** for version control
7. **Document changes** in commit messages
8. **Have rollback plan** ready
9. **Monitor for 10 minutes** after deploy
10. **Test critical features** after deploy

## Deployment Workflow

```
Local Development
       ↓
npm run typecheck
       ↓
npm run build:nocheck
       ↓
bun test
       ↓
git commit & push
       ↓
npm run deploy
       ↓
Watch deployment output
       ↓
bun run typecheck
       ↓
Test in Telegram
       ↓
railway logs (monitor)
       ↓
Success ✅
```

## Support Commands

```bash
# Quick status check
ssh root@188.137.250.69 "cd /root/bot-farm && docker-compose ps"

# Full system check
railway deployment list

# View recent errors
railway logs

# Test bot responsiveness
# Send /start command in Telegram

# Check webhook status
ssh root@188.137.250.69 "cd /root/bot-farm && docker-compose logs | grep -i webhook"
```
