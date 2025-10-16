# Production Deployment - Quick Reference

## 🚀 Quick Deploy Commands

### Deploy via GitHub Actions
```bash
# Automatic on push
git push origin production

# Manual trigger
gh workflow run "Production Auto-Deploy" --ref production
```

### Manual Deploy from Local Machine
```bash
# Sync code to server
rsync -avz --delete \
  --exclude 'node_modules' --exclude 'dist' --exclude '.env' \
  -e "ssh -i ~/.ssh/zomro" \
  ./ root@212.86.115.30:/root/bot-farm/

# SSH to server and rebuild
ssh -i ~/.ssh/zomro root@212.86.115.30 << 'EOF'
cd /root/bot-farm
docker stop 999-multibots && docker rm 999-multibots
docker build --no-cache -t 999-multibots .
docker run -d --name 999-multibots --restart unless-stopped \
  --env-file .env -e NODE_ENV=production \
  -p 3000:3000 -p 2999:2999 -p 3001:3001 -p 3002:3002 -p 3003:3003 \
  -p 3004:3004 -p 3005:3005 -p 3006:3006 -p 3007:3007 \
  -p 3008:3008 -p 3009:3009 -p 3010:3010 \
  999-multibots
EOF
```

## 🔍 Check Deployment Status

### Check Container
```bash
ssh -i ~/.ssh/zomro root@212.86.115.30 'docker ps | grep 999-multibots'
```

### Check Logs
```bash
ssh -i ~/.ssh/zomro root@212.86.115.30 'docker logs 999-multibots --tail 50'
```

### Follow Logs Live
```bash
ssh -i ~/.ssh/zomro root@212.86.115.30 'docker logs -f 999-multibots'
```

### Check Container Stats
```bash
ssh -i ~/.ssh/zomro root@212.86.115.30 'docker stats 999-multibots --no-stream'
```

## 🛠️ Common Operations

### Restart Container (without rebuild)
```bash
ssh -i ~/.ssh/zomro root@212.86.115.30 'docker restart 999-multibots'
```

### Force Rebuild and Restart
```bash
ssh -i ~/.ssh/zomro root@212.86.115.30 << 'EOF'
cd /root/bot-farm
docker stop 999-multibots && docker rm 999-multibots
docker build --no-cache -t 999-multibots .
docker run -d --name 999-multibots --restart unless-stopped \
  --env-file .env -e NODE_ENV=production \
  -p 3000:3000 -p 2999:2999 -p 3001:3001 -p 3002:3002 -p 3003:3003 \
  -p 3004:3004 -p 3005:3005 -p 3006:3006 -p 3007:3007 \
  -p 3008:3008 -p 3009:3009 -p 3010:3010 \
  999-multibots
EOF
```

### Execute Command in Container
```bash
ssh -i ~/.ssh/zomro root@212.86.115.30 'docker exec 999-multibots [command]'
```

### Enter Container Shell
```bash
ssh -i ~/.ssh/zomro root@212.86.115.30 -t 'docker exec -it 999-multibots sh'
```

## 🔐 Environment Management

### Check Environment Variables
```bash
ssh -i ~/.ssh/zomro root@212.86.115.30 'docker exec 999-multibots printenv | sort'
```

### Update .env File
```bash
ssh -i ~/.ssh/zomro root@212.86.115.30
nano /root/bot-farm/.env
# Then restart container
docker restart 999-multibots
```

### Backup .env File
```bash
ssh -i ~/.ssh/zomro root@212.86.115.30 'cp /root/bot-farm/.env /root/bot-farm/.env.backup.$(date +%Y%m%d-%H%M%S)'
```

## 🚨 Emergency Commands

### Stop All Bots
```bash
ssh -i ~/.ssh/zomro root@212.86.115.30 'docker stop 999-multibots'
```

### Emergency Restart
```bash
ssh -i ~/.ssh/zomro root@212.86.115.30 'docker restart 999-multibots && docker logs -f 999-multibots'
```

### Check System Resources
```bash
ssh -i ~/.ssh/zomro root@212.86.115.30 << 'EOF'
echo "=== Disk Usage ==="
df -h
echo ""
echo "=== Memory Usage ==="
free -h
echo ""
echo "=== Docker Stats ==="
docker stats --no-stream
EOF
```

### View Last Errors
```bash
ssh -i ~/.ssh/zomro root@212.86.115.30 'docker logs 999-multibots 2>&1 | grep -i "error\|fatal\|exception" | tail -20'
```

## 📊 Monitoring

### Check All Running Containers
```bash
ssh -i ~/.ssh/zomro root@212.86.115.30 'docker ps -a'
```

### Check Port Bindings
```bash
ssh -i ~/.ssh/zomro root@212.86.115.30 'docker port 999-multibots'
```

### Check Network Status
```bash
ssh -i ~/.ssh/zomro root@212.86.115.30 'netstat -tlnp | grep -E "3000|2999|300[1-9]|3010"'
```

### Test API Endpoint
```bash
curl http://212.86.115.30:3000/health
curl http://test-render-farm.ru/
```

## 🧹 Cleanup

### Remove Old Images
```bash
ssh -i ~/.ssh/zomro root@212.86.115.30 'docker image prune -a -f'
```

### Remove Unused Volumes
```bash
ssh -i ~/.ssh/zomro root@212.86.115.30 'docker volume prune -f'
```

### Full Docker Cleanup (Careful!)
```bash
ssh -i ~/.ssh/zomro root@212.86.115.30 'docker system prune -a -f'
```

## 📝 Useful Aliases

Add to your `~/.bashrc` or `~/.zshrc`:

```bash
# Production SSH
alias prod-ssh='ssh -i ~/.ssh/zomro root@212.86.115.30'

# Quick logs
alias prod-logs='ssh -i ~/.ssh/zomro root@212.86.115.30 "docker logs 999-multibots --tail 50"'

# Quick status
alias prod-status='ssh -i ~/.ssh/zomro root@212.86.115.30 "docker ps | grep 999-multibots"'

# Quick restart
alias prod-restart='ssh -i ~/.ssh/zomro root@212.86.115.30 "docker restart 999-multibots"'

# Follow logs
alias prod-follow='ssh -i ~/.ssh/zomro root@212.86.115.30 "docker logs -f 999-multibots"'
```

## 🎯 Pre-Deploy Checklist

Before deploying:
- [ ] Test locally with `npm run build`
- [ ] Check no sensitive data in code
- [ ] Update version in package.json if needed
- [ ] Test Docker build: `docker build -t test-build .`
- [ ] Review changes: `git diff production`
- [ ] Ensure .env is up to date on server

## 🔗 Important Paths

- **Server Deploy Path**: `/root/bot-farm`
- **Container Work Dir**: `/app`
- **Environment File**: `/root/bot-farm/.env`
- **Container Name**: `999-multibots`
- **Server IP**: `212.86.115.30`
- **Server Domain**: `test-render-farm.ru`

## 📞 Support

- Workflow file: `.github/workflows/production-deploy.yml`
- Full docs: `docs/PRODUCTION_DEPLOYMENT_FIX.md`
- Repository: https://github.com/gHashTag/999-multibots-telegraf
