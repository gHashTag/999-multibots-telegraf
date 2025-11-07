# Pre-Deployment Checklist

## ✅ Before First Deployment

### 1. GitHub Secrets Configuration
- [ ] Navigate to: `Settings → Secrets and variables → Actions`
- [ ] Verify `SSH_PRIVATE_KEY` secret exists
- [ ] Secret should contain full OpenSSH private key (including BEGIN/END lines)
- [ ] No extra whitespace or line breaks in secret

**Test locally:**
```bash
# Verify you can SSH to server
ssh -i ~/.ssh/zomro root@212.86.115.30 'echo "SSH works"'
```

### 2. Production Branch Status
- [ ] Production branch exists: `git branch -r | grep production`
- [ ] Production branch is up to date with desired code
- [ ] All changes committed and pushed
- [ ] No uncommitted changes: `git status`

**Commands:**
```bash
git checkout production
git pull origin production
git log --oneline -5  # Verify commits
```

### 3. Server Environment
- [ ] Server is accessible: `212.86.115.30`
- [ ] Docker is installed: `ssh -i ~/.ssh/zomro root@212.86.115.30 'docker --version'`
- [ ] Deploy directory exists: `/root/bot-farm`
- [ ] .env file exists: `/root/bot-farm/.env`
- [ ] .env file has correct bot tokens

**Verify:**
```bash
ssh -i ~/.ssh/zomro root@212.86.115.30 << 'EOF'
echo "=== Docker Version ==="
docker --version

echo "=== Deploy Directory ==="
ls -la /root/bot-farm | head -10

echo "=== .env File ==="
test -f /root/bot-farm/.env && echo "✅ .env exists" || echo "❌ .env missing"

echo "=== Disk Space ==="
df -h /

echo "=== Port Availability ==="
netstat -tlnp | grep -E "3000|2999|3001" || echo "✅ Ports available"
EOF
```

### 4. Workflow File
- [ ] Workflow file exists: `.github/workflows/production-deploy.yml`
- [ ] YAML syntax is valid
- [ ] Correct deploy path: `/root/bot-farm`
- [ ] Correct container name: `999-multibots`

**Validate:**
```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/production-deploy.yml'))"
echo "✅ YAML is valid"
```

### 5. Docker Configuration
- [ ] Dockerfile exists and is valid
- [ ] All bot ports mapped: 2999-3010, 3000
- [ ] .env file excluded from Docker context (.dockerignore)

**Test locally:**
```bash
docker build -t test-999-multibots .
echo "✅ Docker build works locally"
```

## 🚀 Deployment Execution

### Option 1: Automatic (Push to Production)
```bash
git checkout production
git merge main  # or your feature branch
git push origin production
# Watch: https://github.com/gHashTag/bot-farm/actions
```

### Option 2: Manual Trigger
1. Go to: https://github.com/gHashTag/bot-farm/actions
2. Click "Production Auto-Deploy"
3. Click "Run workflow"
4. Select branch: `production`
5. Click "Run workflow" button

## 📊 Monitoring Deployment

### Watch GitHub Actions
- [ ] Workflow starts without errors
- [ ] "Setup SSH Key" step succeeds
- [ ] "Sync Code to Server" completes
- [ ] "Deploy and Restart Container" finishes
- [ ] "Verify Deployment" passes
- [ ] See "🎉 DEPLOYMENT SUCCESSFUL!"

### Check Server Status
```bash
# Wait 2 minutes after deployment starts, then check:

# Container running?
ssh -i ~/.ssh/zomro root@212.86.115.30 'docker ps | grep 999-multibots'

# Any errors?
ssh -i ~/.ssh/zomro root@212.86.115.30 'docker logs 999-multibots --tail 50'

# API responding?
curl http://212.86.115.30:3000/health
curl -I ${WEBHOOK_DOMAIN}
```

## ✅ Post-Deployment Verification

### 1. Container Health
- [ ] Container status is "Up": `docker ps | grep 999-multibots`
- [ ] No restarts: Check "Up" duration should be recent
- [ ] All ports mapped correctly

### 2. Application Logs
- [ ] No critical errors in logs
- [ ] All bots initialized successfully
- [ ] Webhooks configured (if applicable)

### 3. Functional Tests
- [ ] Send test message to one bot
- [ ] Bot responds correctly
- [ ] Bot features work as expected
- [ ] No user-facing errors

### 4. Monitoring Setup
- [ ] Logs are accessible: `docker logs 999-multibots`
- [ ] Container auto-restart enabled: `--restart unless-stopped`
- [ ] Resource usage normal: `docker stats 999-multibots --no-stream`

## 🚨 Rollback Plan (If Deployment Fails)

### Emergency Rollback Steps:
```bash
# SSH to server
ssh -i ~/.ssh/zomro root@212.86.115.30

# Check what went wrong
docker logs 999-multibots --tail 100

# If container is broken, restart old version
cd /root/bot-farm
git fetch origin production
git checkout [PREVIOUS_COMMIT_HASH]

# Rebuild
docker stop 999-multibots && docker rm 999-multibots
docker build --no-cache -t 999-multibots .
docker run -d --name 999-multibots --restart unless-stopped \
  --env-file .env -e NODE_ENV=production \
  -p 3000:3000 -p 2999-3010:2999-3010 \
  999-multibots
```

## 📝 Common Issues and Solutions

### Issue: "Permission denied (publickey)"
**Cause**: SSH_PRIVATE_KEY secret incorrect
**Fix**:
1. Copy exact key from `~/.ssh/zomro`
2. Include BEGIN/END lines
3. No extra spaces
4. Re-add to GitHub Secrets

### Issue: "rsync: connection refused"
**Cause**: Server not accessible or SSH port blocked
**Fix**: Test SSH manually: `ssh -i ~/.ssh/zomro root@212.86.115.30`

### Issue: "Container build failed"
**Cause**: TypeScript errors or missing files
**Fix**: Check Dockerfile, should use `--skipLibCheck`

### Issue: "Container starts but crashes immediately"
**Cause**: .env issues or missing bot tokens
**Fix**:
```bash
ssh -i ~/.ssh/zomro root@212.86.115.30
cat /root/bot-farm/.env | head -20  # Verify tokens exist
```

### Issue: "Port already in use"
**Cause**: Old container still running
**Fix**:
```bash
ssh -i ~/.ssh/zomro root@212.86.115.30
docker stop 999-multibots && docker rm 999-multibots
# Then re-run deployment
```

## 📞 Support Resources

- **Full Documentation**: `docs/PRODUCTION_DEPLOYMENT_FIX.md`
- **Quick Commands**: `docs/DEPLOYMENT_QUICK_REFERENCE.md`
- **Summary**: `docs/DEPLOYMENT_FIX_SUMMARY.md`
- **Repository**: https://github.com/gHashTag/bot-farm
- **Actions**: https://github.com/gHashTag/bot-farm/actions

## 🎯 Success Indicators

✅ **Deployment is successful when:**
1. GitHub Actions shows green checkmark
2. Container status shows "Up" (not restarting)
3. No critical errors in `docker logs`
4. Bots respond to test messages
5. API endpoint returns 200 OK (if applicable)
6. CPU/Memory usage is normal

❌ **Deployment failed if:**
1. GitHub Actions shows red X
2. Container status is "Restarting" or "Exited"
3. Logs show "FATAL" or "EXCEPTION"
4. Bots don't respond to messages
5. API endpoint returns 502/503

## 📅 Deployment Schedule

**Recommended:**
- Deploy during low-traffic hours
- Have backup plan ready
- Monitor for 15-30 minutes after deployment
- Keep previous version info for rollback

**Best practices:**
- Test in staging first (if available)
- Deploy small changes frequently
- Keep .env backups on server
- Document all configuration changes

---

**Last Updated**: 2024-10-16
**Status**: ✅ Ready to use
