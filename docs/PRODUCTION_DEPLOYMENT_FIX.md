# Production Deployment Fix - Complete Documentation

## 🚨 Problems Identified and Fixed

### 1. **Directory Path Mismatch**
**Problem**: Workflow was using `/root/999-agents-telegraf` but actual deployment is at `/root/bot-farm`
**Solution**: Updated workflow to use correct path `/root/bot-farm`

### 2. **Git SSH Access Failure**
**Problem**: Server's git remote uses `git@github.com:gHashTag/999-multibots-telegraf.git` (SSH) but server doesn't have GitHub SSH keys configured, causing `git pull` to fail
**Solution**: Switched to rsync as primary deployment method (reliable and doesn't need GitHub access from server)

### 3. **SSH Key Format Issues**
**Problem**: GitHub Secrets may contain Windows line endings (CRLF) that break SSH keys
**Solution**: Added `tr -d '\r'` to strip carriage returns and proper chmod permissions

### 4. **Complex Workflow**
**Problem**: Original workflow tried git pull first, then rsync as fallback - too complex and error-prone
**Solution**: Simplified to pure rsync deployment with clear steps

## ✅ What Was Fixed

### New Workflow Structure:
1. **Setup SSH Key** - Proper key handling with format cleanup
2. **Sync Code** - Direct rsync to server (no git needed)
3. **Deploy Container** - Stop old → Build new → Start new
4. **Verify** - Check container status and logs
5. **Cleanup** - Remove SSH keys securely

### Key Improvements:
- ✅ Removed dependency on git pull (server doesn't need GitHub access)
- ✅ Fixed SSH key permissions and format handling
- ✅ Correct deployment path (`/root/bot-farm`)
- ✅ Proper Docker rebuild with `--no-cache`
- ✅ All bot ports mapped correctly (2999-3010 + 3000)
- ✅ Better error handling and logging
- ✅ Health checks for deployment verification

## 🔧 GitHub Secrets Required

### SSH_PRIVATE_KEY
The private SSH key for accessing the production server. Must be in OpenSSH format.

**How to add:**
1. Go to repository Settings → Secrets and variables → Actions
2. Add new secret named `SSH_PRIVATE_KEY`
3. Copy entire content of `~/.ssh/zomro` (including header/footer)
4. Format:
```
-----BEGIN OPENSSH PRIVATE KEY-----
[key content here]
-----END OPENSSH PRIVATE KEY-----
```

## 🚀 Deployment Process

### Automatic Deployment:
```bash
# Push to production branch triggers deployment
git push origin production
```

### Manual Deployment:
1. Go to GitHub Actions → "Production Auto-Deploy"
2. Click "Run workflow"
3. Select branch: `production`
4. Click "Run workflow" button

## 📊 Deployment Flow

```
┌─────────────────┐
│  Push to Prod   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Checkout Code  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Setup SSH Key  │  ← Fix: Proper format handling
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Rsync to       │  ← Fix: Direct rsync (no git pull)
│  /root/bot-farm │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Stop Container │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Build Image    │  ← Fix: --no-cache for fresh build
│  (no cache)     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Start New      │  ← Fix: All ports mapped correctly
│  Container      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Verify Deploy  │  ← New: Health checks
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Cleanup Keys   │
└─────────────────┘
```

## 🔍 Verification Steps

### What Gets Checked:
1. **Container Running**: `docker ps | grep 999-multibots`
2. **Container Logs**: Check for errors/exceptions
3. **API Endpoint**: Test HTTP response (optional)
4. **Port Exposure**: All bot ports accessible

### Expected Output:
```
✅ SSH connection successful
✅ Code synced successfully
✅ Container started successfully
✅ Container is running
✅ No critical errors found in logs
```

## 🛠️ Manual Deployment (SSH)

If GitHub Actions fails, deploy manually:

```bash
# 1. SSH to server
ssh -i ~/.ssh/zomro root@212.86.115.30

# 2. Go to deployment directory
cd /root/bot-farm

# 3. Pull latest code (if git works)
git fetch origin production && git reset --hard origin/production

# OR sync from local
rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude 'dist' \
  --exclude '.env' \
  -e "ssh -i ~/.ssh/zomro" \
  ./ root@212.86.115.30:/root/bot-farm/

# 4. Stop old container
docker stop 999-multibots
docker rm 999-multibots

# 5. Build fresh image
docker build --no-cache -t 999-multibots .

# 6. Start new container
docker run -d \
  --name 999-multibots \
  --restart unless-stopped \
  --env-file .env \
  -e NODE_ENV=production \
  -p 3000:3000 \
  -p 2999:2999 -p 3001:3001 -p 3002:3002 -p 3003:3003 \
  -p 3004:3004 -p 3005:3005 -p 3006:3006 -p 3007:3007 \
  -p 3008:3008 -p 3009:3009 -p 3010:3010 \
  999-multibots

# 7. Check logs
docker logs 999-multibots --tail 50
```

## 🚨 Troubleshooting

### Issue: "SSH connection failed"
**Cause**: SSH_PRIVATE_KEY secret not configured or wrong format
**Fix**:
1. Check secret exists in GitHub Settings
2. Ensure key includes header/footer
3. No extra spaces or line breaks

### Issue: "Container build failed"
**Cause**: TypeScript errors or missing dependencies
**Fix**:
1. Check Dockerfile (uses `--skipLibCheck` to ignore type errors)
2. Review build logs in GitHub Actions
3. Test build locally: `docker build -t 999-multibots .`

### Issue: "Container not running after start"
**Cause**: .env file issues or port conflicts
**Fix**:
1. SSH to server: `ssh -i ~/.ssh/zomro root@212.86.115.30`
2. Check logs: `docker logs 999-multibots`
3. Verify .env file: `cat /root/bot-farm/.env | head -5`
4. Check ports: `netstat -tlnp | grep -E "3000|2999|3001"`

### Issue: "Rsync failed"
**Cause**: Network issues or permissions
**Fix**:
1. Test SSH: `ssh -i ~/.ssh/zomro root@212.86.115.30 'echo OK'`
2. Check disk space: `ssh -i ~/.ssh/zomro root@212.86.115.30 'df -h'`
3. Manual rsync with verbose: Add `-v` flag to see details

## 📋 Checklist for First Deployment

- [ ] SSH_PRIVATE_KEY secret added to GitHub
- [ ] Production branch exists and is up to date
- [ ] Server has Docker installed and running
- [ ] .env file exists at `/root/bot-farm/.env`
- [ ] Ports 2999-3010 and 3000 are not in use
- [ ] Server has enough disk space (check `df -h`)
- [ ] Test SSH connection from local machine works

## 🎯 Success Criteria

Deployment is successful when:
1. ✅ GitHub Actions workflow completes without errors
2. ✅ Container shows as "Up" in `docker ps`
3. ✅ No critical errors in `docker logs 999-multibots`
4. ✅ Bots respond to Telegram messages
5. ✅ API endpoint responds (if applicable)

## 📝 Next Steps for CI/CD Optimization

After first successful deployment, consider:
1. **Add staging environment** for testing before production
2. **Implement blue-green deployment** for zero-downtime updates
3. **Add automated rollback** on deployment failure
4. **Setup monitoring alerts** (Prometheus/Grafana)
5. **Add deployment notifications** (Slack/Discord)
6. **Optimize Docker build** with multi-stage caching
7. **Add deployment metrics** tracking

## 🔗 Related Files

- Workflow: `.github/workflows/production-deploy.yml`
- Dockerfile: `Dockerfile`
- Entry script: `scripts/docker-entrypoint.sh`
- Environment: `/root/bot-farm/.env` (on server)

## 📅 Change History

**2024-10-16**: Initial deployment workflow fix
- Fixed directory path to `/root/bot-farm`
- Switched from git pull to rsync
- Fixed SSH key format handling
- Added comprehensive verification steps
- Simplified workflow structure
