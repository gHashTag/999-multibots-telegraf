# ✅ POST-MIGRATION CHECKLIST

## Phase 1: Code Migration Verification

### 1.1 File Structure ✓
- [ ] All render functions copied to `src/inngest_app/functions/render/`
- [ ] All content functions copied to `src/inngest_app/functions/content/`
- [ ] All training functions copied to `src/inngest_app/functions/training/`
- [ ] All image functions copied to `src/inngest_app/functions/image/`
- [ ] All payment functions copied to `src/inngest_app/functions/payments/`
- [ ] All broadcast functions copied to `src/inngest_app/functions/broadcast/`
- [ ] All monitoring functions copied to `src/inngest_app/functions/monitoring/`
- [ ] Helpers copied to `src/helpers/inngest/`

### 1.2 Import Path Updates ✓
- [ ] Update all imports from `@/core/inngest/...` to `@/inngest_app/...`
- [ ] Update all imports from `@/inngest-functions/...` to `@/inngest_app/functions/...`
- [ ] Update all imports from `@/helpers/inngest/...` to `@/helpers/inngest/...`
- [ ] Fix relative imports (e.g., `../../../` → proper aliases)

### 1.3 Client Configuration ✓
- [ ] Merge `client.ai-server.ts` into `client.ts`
- [ ] Verify Inngest app ID is correct
- [ ] Verify signing key is set in environment
- [ ] Remove duplicate client configurations

### 1.4 Function Registration ✓
- [ ] Create `src/inngest_app/functions/index.ts` with all exports
- [ ] Export render functions
- [ ] Export content functions
- [ ] Export training functions
- [ ] Export image functions
- [ ] Export payment functions
- [ ] Export broadcast functions
- [ ] Export monitoring functions

Example `functions/index.ts`:
```typescript
// Render functions
export * from './render/render'
export * from './render/renderRiddle'
export * from './render/renderAvatarVideo'

// Content functions
export * from './content/analyzeCompetitorReels'
export * from './content/instagramScraper-v2'
// ... etc

// Export array of all functions
import { renderFunction } from './render/render'
import { renderRiddleFunction } from './render/renderRiddle'
// ... import all

export const allFunctions = [
  renderFunction,
  renderRiddleFunction,
  // ... all functions
]
```

---

## Phase 2: Dependencies & Environment

### 2.1 Dependencies Installation ✓
- [ ] Run `./scripts/install-migration-deps.sh`
- [ ] Verify `inngest@^3.37.0` installed
- [ ] Verify `ssh2@^1.17.0` installed
- [ ] Verify `@aws-sdk/client-s3@^3.913.0` installed
- [ ] Verify `@aws-sdk/s3-request-presigner@^3.913.0` installed
- [ ] Verify `archiver@^7.0.1` installed
- [ ] Verify `express@^4.18.1` (not 5.x)

Check with:
```bash
npm list inngest ssh2 @aws-sdk/client-s3 archiver express --depth=0
```

### 2.2 Environment Variables ✓
- [ ] Add `RENDER_SERVER_HOST=212.86.115.30` to `.env`
- [ ] Add `RENDER_SERVER_USER=root`
- [ ] Add `RENDER_SERVER_SSH_KEY_PATH=` (local: `~/.ssh/zomro`, prod: `/root/.ssh/zomro`)
- [ ] Add `RENDER_SERVER_PROJECT_PATH=/root/remotion-render`
- [ ] Add `AWS_ACCESS_KEY_ID=`
- [ ] Add `AWS_SECRET_ACCESS_KEY=`
- [ ] Add `AWS_REGION=us-east-1`
- [ ] Add `AWS_S3_BUCKET=`
- [ ] Add `INNGEST_EVENT_KEY=`
- [ ] Add `INNGEST_SIGNING_KEY=`
- [ ] Merge all API keys from ai-server `.env`

### 2.3 Configuration Files ✓
- [ ] Update `tsconfig.json` if needed (new paths)
- [ ] Update `.gitignore` (exclude `*.ai-server.ts` backup files)
- [ ] Update `Dockerfile` if needed (new dependencies)

---

## Phase 3: Build & Compilation

### 3.1 TypeScript Compilation ✓
```bash
npm run build
```
- [ ] No TypeScript errors
- [ ] All functions compiled to `dist/`
- [ ] Check for missing type definitions

### 3.2 Type Checking ✓
```bash
npm run typecheck
```
- [ ] No type errors in migrated functions
- [ ] All imports resolve correctly
- [ ] Generic types are correct

### 3.3 Linting ✓
```bash
npm run lint
```
- [ ] No linting errors
- [ ] Fix any auto-fixable issues with `npm run lint -- --fix`

---

## Phase 4: Testing

### 4.1 Unit Tests ✓
```bash
npm run test
```
- [ ] All existing tests pass
- [ ] No regressions in bot functionality
- [ ] Run specific test suites if available

### 4.2 Inngest Function Tests ✓
Create test files for migrated functions:
```bash
npm run test -- inngest_app/functions/render
npm run test -- inngest_app/functions/content
```
- [ ] Test render functions in isolation
- [ ] Test content generation functions
- [ ] Test training functions
- [ ] Test image functions
- [ ] Test payment functions
- [ ] Test monitoring functions

### 4.3 SSH Connection Test ✓
```bash
node -e "
const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  console.log('✅ SSH connection successful!');
  conn.end();
}).on('error', (err) => {
  console.error('❌ SSH error:', err.message);
}).connect({
  host: process.env.RENDER_SERVER_HOST,
  port: 22,
  username: process.env.RENDER_SERVER_USER,
  privateKey: require('fs').readFileSync(process.env.RENDER_SERVER_SSH_KEY_PATH)
});
"
```
- [ ] SSH connection works locally
- [ ] SSH connection will work in Docker (verify key path)

### 4.4 S3 Upload Test ✓
```bash
node -e "
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const client = new S3Client({ region: process.env.AWS_REGION });
async function test() {
  await client.send(new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET,
    Key: 'test.txt',
    Body: 'Migration test'
  }));
  console.log('✅ S3 upload successful!');
}
test().catch(err => console.error('❌ S3 error:', err.message));
"
```
- [ ] S3 upload works with test file

### 4.5 Inngest Event Test ✓
```bash
# Local test
node -e "
const { sendEvent } = require('./dist/inngest_app/send-event');
sendEvent({
  name: 'test/migration',
  data: { test: true }
}).then(() => console.log('✅ Event sent!')).catch(err => console.error('❌', err));
"
```
- [ ] Inngest event sending works
- [ ] Check Inngest dashboard for received events

---

## Phase 5: Integration Testing

### 5.1 Inngest Server Integration ✓
Update `src/index.ts` to serve Inngest:
```typescript
import express from 'express'
import { serve } from 'inngest/express'
import { inngest } from './inngest_app/client'
import { allFunctions } from './inngest_app/functions'

// ... existing bot setup ...

// Add Inngest HTTP endpoint
const app = express()
app.use('/api/inngest', serve({ client: inngest, functions: allFunctions }))

const PORT = process.env.INNGEST_PORT || 4000
app.listen(PORT, () => {
  console.log(`🚀 Inngest server listening on port ${PORT}`)
  console.log(`📡 Inngest endpoint: http://localhost:${PORT}/api/inngest`)
})
```
- [ ] Inngest server starts without errors
- [ ] `/api/inngest` endpoint responds
- [ ] Inngest dev server connects: `npx inngest-cli@latest dev -u http://localhost:4000/api/inngest`

### 5.2 End-to-End Test: Telegram → Inngest → Render ✓
1. **Start bot locally**:
   ```bash
   npm run dev
   ```
2. **Send test message** to bot (e.g., trigger AI Reels generation)
3. **Verify Inngest function triggered** (check Inngest dashboard)
4. **Verify render workflow** executes (check render server logs)
5. **Verify S3 upload** happens (check S3 bucket)
6. **Verify Telegram response** sent back to user

- [ ] Full workflow works end-to-end locally

---

## Phase 6: Docker Testing

### 6.1 Docker Build ✓
```bash
docker build -t 999-multibots-test .
```
- [ ] Docker build succeeds
- [ ] No missing dependencies errors
- [ ] Image size is reasonable (check with `docker images`)

### 6.2 Docker Run (Local) ✓
```bash
docker run --rm -p 4000:4000 --env-file .env 999-multibots-test
```
- [ ] Container starts successfully
- [ ] Bot connects to Telegram
- [ ] Inngest server starts
- [ ] No crashes or errors in logs

### 6.3 Docker Logs ✓
```bash
docker logs <container_id> --tail 100
```
- [ ] Check for any ERROR or WARN messages
- [ ] Verify all Inngest functions registered
- [ ] Verify SSH key path works in container

---

## Phase 7: Production Deployment

### 7.1 Pre-Deployment Checklist ✓
- [ ] All tests passing locally
- [ ] Docker image tested locally
- [ ] Environment variables ready for production
- [ ] SSH key available at `/root/.ssh/zomro` on Zomro server
- [ ] Backup ai-server codebase
- [ ] Rollback plan documented

### 7.2 Git Preparation ✓
```bash
git checkout -b feat/inngest-migration
git add .
git commit -m "feat: migrate Inngest functions from ai-server to telegraf

- Migrated 25+ Inngest functions (render, content, training, etc.)
- Updated dependencies (inngest@3.37.0, ssh2, AWS SDK)
- Integrated Inngest server into main bot process
- Added environment variables for render server and S3
- Created migration scripts and documentation

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"

git push origin feat/inngest-migration
```

### 7.3 Production Deployment ✓

**Option 1: Auto-deploy via GitHub Actions**
```bash
git checkout production
git merge feat/inngest-migration
git push origin production
# GitHub Actions will auto-deploy
```

**Option 2: Manual deploy via /deploy**
```bash
/deploy
```

**Option 3: Manual SSH deploy**
```bash
ssh -i ~/.ssh/zomro root@212.86.115.30 << 'EOF'
cd /root/bot-farm
git pull origin production
docker stop 999-multibots
docker rm 999-multibots
docker build --no-cache -t 999-multibots .
docker run -d --name 999-multibots --restart=always \
  -p 3000:3000 -p 4000:4000 -p 2999:2999 -p 3001:3001 -p 3002:3002 \
  -p 3003:3003 -p 3004:3004 -p 3005:3005 -p 3006:3006 -p 3007:3007 \
  -p 3008:3008 -p 3009:3009 -p 3010:3010 \
  -v /root/bot-farm/.env:/app/.env:ro \
  999-multibots
sleep 10
docker logs 999-multibots --tail 50
EOF
```

**Note**: Add port 4000 for Inngest server!

- [ ] Deployment succeeded
- [ ] Docker container running
- [ ] No errors in logs

### 7.4 Production Verification ✓
```bash
# Check container status
ssh -i ~/.ssh/zomro root@212.86.115.30 'docker ps | grep 999-multibots'

# Check logs
ssh -i ~/.ssh/zomro root@212.86.115.30 'docker logs 999-multibots --tail 100'

# Check Inngest endpoint
curl https://999-agents.site/api/inngest
```

- [ ] Container healthy
- [ ] Inngest endpoint responding
- [ ] No critical errors in logs
- [ ] Bot responding to Telegram messages

### 7.5 Update Inngest Webhook ✓
1. Go to Inngest dashboard: https://app.inngest.com
2. Update webhook URL to: `https://999-agents.site/api/inngest`
3. Test webhook connection

- [ ] Inngest webhook updated
- [ ] Test event received

---

## Phase 8: Monitoring & Validation

### 8.1 First 24 Hours ✓
- [ ] Monitor logs every hour: `ssh -i ~/.ssh/zomro root@212.86.115.30 'docker logs 999-multibots --tail 100 -f'`
- [ ] Check Inngest dashboard for function executions
- [ ] Check S3 bucket for new uploads
- [ ] Test render workflows manually
- [ ] Monitor error rates in Supabase logs

### 8.2 Performance Metrics ✓
- [ ] Measure average function execution time
- [ ] Check memory usage: `docker stats 999-multibots`
- [ ] Check CPU usage
- [ ] Compare with ai-server baseline

### 8.3 User Testing ✓
- [ ] Test AI Reels generation (Hedra workflow)
- [ ] Test AI Reels generation (HeyGen workflow)
- [ ] Test model training workflow
- [ ] Test payment processing
- [ ] Test broadcast messages
- [ ] Get feedback from test users

---

## Phase 9: Cleanup

### 9.1 Remove ai-server (After 1 Week Stable Operation) ✓
```bash
ssh -i ~/.ssh/zomro root@212.86.115.30 << 'EOF'
# Stop ai-server Inngest standalone server
pkill -f inngest-sdk-server.js

# Archive ai-server code
cd /root
tar -czf ai-server-backup-$(date +%Y%m%d).tar.gz ai-server/
mv ai-server-backup-*.tar.gz /root/backups/

# (Optional) Remove ai-server directory
# rm -rf /root/ai-server
EOF
```
- [ ] ai-server stopped
- [ ] ai-server backed up
- [ ] No services depend on ai-server

### 9.2 Update Documentation ✓
- [ ] Update CLAUDE.md
- [ ] Update deployment guides
- [ ] Update architecture diagrams
- [ ] Archive migration documentation

### 9.3 Clean Up Migration Artifacts ✓
```bash
# Remove backup files
rm src/inngest_app/client.ai-server.ts
find . -name "*.ai-server.ts" -delete

# Remove migration scripts (or move to archive)
mkdir -p docs/archive/migration-2025-10-30
mv docs/INNGEST_MIGRATION_PLAN.md docs/archive/migration-2025-10-30/
mv scripts/migrate-inngest-functions.sh docs/archive/migration-2025-10-30/
```
- [ ] Backup files removed
- [ ] Migration scripts archived

---

## Phase 10: Optimization (Optional)

### 10.1 Performance Tuning ✓
- [ ] Optimize SSH connection pooling
- [ ] Implement S3 upload retries
- [ ] Add caching for frequently accessed data
- [ ] Optimize Docker image size

### 10.2 Monitoring Enhancements ✓
- [ ] Add custom metrics to Inngest functions
- [ ] Set up alerts for failures
- [ ] Add performance dashboards
- [ ] Implement error tracking (e.g., Sentry)

### 10.3 Code Quality ✓
- [ ] Refactor duplicate code
- [ ] Add JSDoc comments to functions
- [ ] Improve error messages
- [ ] Add more comprehensive tests

---

## ✅ FINAL SIGN-OFF

### Success Criteria (ALL must be ✅):
- [x] All 25+ Inngest functions migrated
- [ ] Zero production downtime during migration
- [ ] All tests passing (unit + integration + E2E)
- [ ] Docker build successful
- [ ] Inngest endpoint responding < 100ms
- [ ] Full render workflows working end-to-end
- [ ] No regressions in existing bot functionality
- [ ] Production stable for 7+ days
- [ ] User feedback positive
- [ ] ai-server deprecated

### Sign-Off:
- [ ] **Developer**: Tested locally and verified all functions work
- [ ] **QA**: Integration tests pass, no critical issues found
- [ ] **DevOps**: Production deployment successful, monitoring in place
- [ ] **Product Owner**: User feedback positive, requirements met

---

**Migration Status**: 🔴 IN PROGRESS
**Started**: 2025-10-30
**Estimated Completion**: TBD
**Last Updated**: 2025-10-30

---

## 🆘 TROUBLESHOOTING

### Issue: TypeScript errors after migration
**Solution**: Check import paths, verify all types are exported, run `npm run build` again

### Issue: Inngest functions not registering
**Solution**: Verify `allFunctions` array in `functions/index.ts` includes all migrated functions

### Issue: SSH connection fails in Docker
**Solution**: Verify SSH key path is `/root/.ssh/zomro` in production `.env`, check file permissions

### Issue: S3 uploads fail
**Solution**: Verify AWS credentials in `.env`, check bucket permissions, test with AWS CLI

### Issue: Render workflows timeout
**Solution**: Check render server logs, verify SSH connection, increase timeout settings

### Issue: Docker build fails
**Solution**: Clear Docker cache (`docker system prune -a`), verify all dependencies in package.json

### Issue: Production bot not responding
**Solution**: Check Docker logs, verify environment variables, restart container

---

## 📞 CONTACTS

For migration issues, contact:
- **Developer**: [Your contact info]
- **DevOps**: [DevOps contact]
- **Documentation**: See `docs/INNGEST_MIGRATION_PLAN.md`

---

**End of Checklist** ✅
