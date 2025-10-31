# 🎯 COMPLETE BUSINESS LOGIC MIGRATION PLAN

> **Цель**: Мигрировать ВСЮ бизнес-логику из ai-server в 999-agents-telegraf
> **Серверы**: Всё на одном сервере Zomro 212.86.115.30
> **Изоляция**: Каждая ветка полностью изолирована
> **Timeline**: 3-5 дней

---

## 📊 EXECUTIVE SUMMARY

### Что мигрируем:

- ✅ **325 TypeScript файлов** (644 MB кода)
- ✅ **17 REST API routes**
- ✅ **17 Controllers**
- ✅ **38 Services**
- ✅ **82+ Core/Supabase модулей**
- ✅ **29 Inngest functions**
- ✅ **Все middlewares, utils, config**

### Архитектура после миграции:

**Один Docker контейнер** `999-multibots` на Zomro 212.86.115.30:
- Telegram Bot (10 ботов)
- REST API (Express)
- Inngest Functions
- Webhook handlers
- Background workers

---

## 🗂️ ПОЛНАЯ СТРУКТУРА МИГРАЦИИ

### 📂 Целевая структура 999-agents-telegraf:

```
/Users/playra/999-agents-telegraf/
├── src/
│   ├── bot.ts                         # ✅ Exists (Telegram bot entry)
│   ├── index.ts                       # ✅ Exists (Main entry point)
│   │
│   ├── api_server/                    # ← НОВОЕ (из ai-server)
│   │   ├── server.ts                  # Express app setup
│   │   ├── routes/                    # 17 routes из ai-server
│   │   │   ├── index.ts
│   │   │   ├── upload.route.ts
│   │   │   ├── webhook.route.ts
│   │   │   ├── payment.route.ts
│   │   │   ├── generation.route.ts
│   │   │   ├── pricing.route.ts
│   │   │   ├── replicateWebhook.route.ts
│   │   │   ├── webhook-bfl-neurophoto.route.ts
│   │   │   ├── broadcast.route.ts
│   │   │   └── ... (всего 17)
│   │   ├── controllers/               # 17 controllers из ai-server
│   │   │   ├── generation.controller.ts (35 KB!)
│   │   │   ├── broadcast.controller.ts (15 KB)
│   │   │   ├── webhook-bfl-neurophoto.controllers.ts
│   │   │   ├── replicateWebhook.controller.ts
│   │   │   ├── render-callback.controller.ts
│   │   │   └── ... (всего 17)
│   │   └── middlewares/               # 4 middlewares из ai-server
│   │       ├── error.middleware.ts
│   │       ├── validation.middleware.ts
│   │       ├── replicateWebhook.middleware.ts
│   │       └── validateUserParams.ts
│   │
│   ├── services/                      # ← НОВОЕ + MERGE (из ai-server)
│   │   ├── generation/
│   │   │   ├── generateNeuroImage.ts (16 KB)
│   │   │   ├── generateNeuroImageV2.ts (13 KB)
│   │   │   ├── generateImageToVideo.ts (14 KB)
│   │   │   ├── generateModelTraining.ts (11 KB)
│   │   │   └── ...
│   │   ├── video/
│   │   │   ├── backgroundMorphingProcessor.ts (22 KB)
│   │   │   ├── generateMorphingVideo.ts (10 KB)
│   │   │   └── ...
│   │   ├── broadcast/
│   │   │   └── broadcast.service.ts (19 KB)
│   │   ├── avatar/
│   │   │   ├── avatar.service.ts
│   │   │   └── createVoiceAvatar.ts
│   │   ├── prompts/
│   │   │   └── brollPromptsService.ts (15 KB)
│   │   └── ... (всего 38 services)
│   │
│   ├── core/                          # ← MERGE (существующее + ai-server)
│   │   ├── supabase/                  # МERGE 82 файла!
│   │   │   ├── index.ts               # ✅ Exists
│   │   │   ├── getUserBalance.ts      # ← Из ai-server
│   │   │   ├── incrementBalance.ts    # ← Из ai-server
│   │   │   ├── setPayments.ts         # ← Из ai-server
│   │   │   ├── isLimitAi.ts           # ← Из ai-server
│   │   │   ├── getUserDetailsSubscription.ts  # ✅ Exists
│   │   │   └── ... (всего 82+)
│   │   ├── openai/                    # ← Из ai-server
│   │   ├── replicate/                 # ← Из ai-server
│   │   ├── instagram/                 # ← Из ai-server
│   │   ├── storytelling/              # ← Из ai-server
│   │   ├── bfl/                       # ← Из ai-server
│   │   ├── kling/                     # ← Из ai-server
│   │   ├── elevenlabs/                # ← Из ai-server
│   │   └── 100ms/                     # ← Из ai-server
│   │
│   ├── inngest_app/                   # ← EXPAND (существующее + ai-server)
│   │   ├── functions/                 # 29 Inngest functions
│   │   │   ├── render/                # Из ai-server
│   │   │   │   ├── render.ts
│   │   │   │   ├── renderRiddle.ts
│   │   │   │   ├── renderAvatarVideo.ts
│   │   │   │   ├── steps.ts
│   │   │   │   ├── types.ts
│   │   │   │   └── schemas.ts
│   │   │   ├── content/               # Из ai-server
│   │   │   │   ├── analyzeCompetitorReels.ts
│   │   │   │   ├── instagramScraper-v2.ts
│   │   │   │   ├── findCompetitors.ts
│   │   │   │   └── ... (7 files)
│   │   │   ├── training/              # Из ai-server
│   │   │   ├── image/                 # Из ai-server
│   │   │   ├── payments/              # Из ai-server
│   │   │   ├── broadcast/             # Из ai-server
│   │   │   ├── monitoring/            # Из ai-server
│   │   │   └── index.ts               # Export all
│   │   ├── client.ts                  # MERGE configs
│   │   ├── inngest-provider.ts        # ✅ Exists
│   │   ├── render-server-client.ts    # ✅ Exists
│   │   └── send-event.ts              # ✅ Exists
│   │
│   ├── helpers/                       # ← MERGE (существующее + ai-server)
│   │   ├── inngest/                   # Из ai-server
│   │   │   ├── balanceHelpers.ts
│   │   │   └── index.ts
│   │   └── ... (existing helpers)
│   │
│   ├── utils/                         # ← MERGE (существующее + ai-server)
│   │   ├── errorReporter.ts           # Из ai-server
│   │   ├── fileUpload.ts              # Из ai-server
│   │   ├── logger.ts                  # Из ai-server (MERGE with existing)
│   │   ├── fileService.ts             # Из ai-server
│   │   ├── checkSecretKey.ts          # Из ai-server
│   │   ├── validateEnv.ts             # Из ai-server
│   │   └── ... (existing utils)
│   │
│   ├── config/                        # ← MERGE
│   ├── interfaces/                    # ← MERGE
│   ├── dtos/                          # ← Из ai-server
│   ├── exceptions/                    # ← Из ai-server
│   ├── database/                      # ← Из ai-server
│   ├── price/                         # ← Из ai-server
│   └── template/                      # ← Из ai-server
```

---

## 📋 MIGRATION PHASES

### 🔴 PHASE 1: Critical Infrastructure (Day 1)

**Цель**: Подготовить инфраструктуру и критичные компоненты

#### 1.1 Create Feature Branch
```bash
cd /Users/playra/999-agents-telegraf
git checkout production
git checkout -b feat/full-ai-server-migration

# OR create worktree (для изоляции)
git worktree add worktrees/full-migration feat/full-ai-server-migration
cd worktrees/full-migration
```

#### 1.2 Install ALL Dependencies
```bash
# Run updated script
./scripts/install-all-migration-deps.sh

# New dependencies for REST API:
npm install express-fileupload@^1.5.1
npm install swagger-jsdoc@^6.2.1
npm install swagger-ui-express@^4.5.0
npm install class-transformer@^0.5.1
npm install class-validator@^0.13.2
npm install compression@^1.7.4
npm install helmet@^5.1.1
npm install hpp@^0.2.3
npm install morgan@^1.10.0

# Already installed (from previous plan):
# inngest@3.37.0, ssh2@1.17.0, @aws-sdk/client-s3, archiver
```

#### 1.3 Create Directory Structure
```bash
mkdir -p src/api_server/{routes,controllers,middlewares}
mkdir -p src/services/{generation,video,broadcast,avatar,prompts}
mkdir -p src/core/{openai,replicate,instagram,storytelling,bfl,kling,elevenlabs,100ms}
mkdir -p src/dtos src/exceptions src/database src/price src/template
```

#### 1.4 Migrate Core Supabase (CRITICAL!)
```bash
# Copy all 82 files
cp -r /Users/playra/ai-server/src/core/supabase/* src/core/supabase/

# ВАЖНО: Мерж с существующими файлами!
# Проверить конфликты:
- getUserBalance.ts (может существовать)
- incrementBalance.ts
- setPayments.ts
# Мерж вручную, оставить лучшую версию
```

---

### 🟡 PHASE 2: REST API & Webhooks (Day 2)

**Цель**: Мигрировать REST API, webhooks, controllers

#### 2.1 Migrate Routes (17 files)
```bash
cp /Users/playra/ai-server/src/routes/*.route.ts src/api_server/routes/
cp /Users/playra/ai-server/src/routes/index.ts src/api_server/routes/
```

**Priority order**:
1. 🔴 `webhook.route.ts` (critical for Inngest)
2. 🔴 `replicateWebhook.route.ts` (critical)
3. 🔴 `webhook-bfl-neurophoto.route.ts` (critical)
4. 🔴 `payment.route.ts` (critical)
5. 🔴 `generation.route.ts` (critical)
6. 🟡 Rest of routes

#### 2.2 Migrate Controllers (17 files)
```bash
cp /Users/playra/ai-server/src/controllers/*.controller.ts src/api_server/controllers/
```

**Update imports** in each controller:
```typescript
// OLD (ai-server)
import { inngest } from '@/core/inngest/clients'
import { supabase } from '@/config/supabase'

// NEW (telegraf)
import { inngest } from '@/inngest_app/client'
import { supabase } from '@/core/supabase'
```

#### 2.3 Migrate Middlewares (4 files)
```bash
cp /Users/playra/ai-server/src/middlewares/*.ts src/api_server/middlewares/
```

#### 2.4 Create Express Server
Create `src/api_server/server.ts`:
```typescript
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import morgan from 'morgan'
import { serve as inngestServe } from 'inngest/express'
import { routes } from './routes'
import { inngest } from '@/inngest_app/client'
import { allFunctions } from '@/inngest_app/functions'
import { errorMiddleware } from './middlewares/error.middleware'

const app = express()

// Middlewares
app.use(helmet())
app.use(cors())
app.use(compression())
app.use(morgan('combined'))
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))

// Inngest endpoint
app.use('/api/inngest', inngestServe({ client: inngest, functions: allFunctions }))

// REST API routes
routes.forEach(route => {
  app.use('/api', route.router)
})

// Error handling
app.use(errorMiddleware)

export { app }
```

---

### 🟡 PHASE 3: Services & Business Logic (Day 3)

**Цель**: Мигрировать все 38 сервисов

#### 3.1 Migrate Generation Services
```bash
cp /Users/playra/ai-server/src/services/generate*.ts src/services/generation/
cp /Users/playra/ai-server/src/services/createTasksService.ts src/services/generation/
```

**Files (10)**:
- generateNeuroImage.ts (16 KB)
- generateNeuroImageV2.ts (13 KB)
- generateImageToVideo.ts (14 KB)
- generateModelTraining.ts (11 KB)
- generateImageToPrompt.ts
- generateLipSync.ts
- и т.д.

#### 3.2 Migrate Video Services
```bash
cp /Users/playra/ai-server/src/services/*Morphing*.ts src/services/video/
cp /Users/playra/ai-server/src/services/*Video*.ts src/services/video/
```

**Files (5)**:
- backgroundMorphingProcessor.ts (22 KB)
- generateMorphingVideo.ts (10 KB)
- и т.д.

#### 3.3 Migrate Broadcast Services
```bash
cp /Users/playra/ai-server/src/services/broadcast.service.ts src/services/broadcast/
```

#### 3.4 Migrate Other Services
```bash
cp /Users/playra/ai-server/src/services/avatar.service.ts src/services/avatar/
cp /Users/playra/ai-server/src/services/createVoiceAvatar.ts src/services/avatar/
cp /Users/playra/ai-server/src/services/brollPromptsService.ts src/services/prompts/
cp /Users/playra/ai-server/src/services/elevenLabs.ts src/services/avatar/
# ... и все остальные (38 total)
```

#### 3.5 Update Service Imports
**Массовая замена импортов**:
```bash
# Find and replace in all service files
find src/services -name "*.ts" -exec sed -i '' 's|@/core/inngest/clients|@/inngest_app/client|g' {} \;
find src/services -name "*.ts" -exec sed -i '' 's|@/config/supabase|@/core/supabase|g' {} \;
```

---

### 🟢 PHASE 4: Core Modules (Day 4)

**Цель**: Мигрировать все core модули (кроме supabase - уже в Phase 1)

#### 4.1 Migrate Core Modules
```bash
# OpenAI
cp -r /Users/playra/ai-server/src/core/openai src/core/

# Replicate
cp -r /Users/playra/ai-server/src/core/replicate src/core/

# Instagram
cp -r /Users/playra/ai-server/src/core/instagram src/core/

# Storytelling
cp -r /Users/playra/ai-server/src/core/storytelling src/core/

# BFL
cp -r /Users/playra/ai-server/src/core/bfl src/core/

# Kling
cp -r /Users/playra/ai-server/src/core/kling src/core/

# ElevenLabs
cp -r /Users/playra/ai-server/src/core/elevenlabs src/core/

# 100ms
cp -r /Users/playra/ai-server/src/core/100ms src/core/

# Bot (если нужно)
cp -r /Users/playra/ai-server/src/core/bot src/core/
```

#### 4.2 Migrate Utils
```bash
cp /Users/playra/ai-server/src/utils/*.ts src/utils/

# Merge with existing:
# - logger.ts (merge logging logic)
# - fileUpload.ts
# - errorReporter.ts
```

#### 4.3 Migrate Config/DTOs/Interfaces
```bash
cp -r /Users/playra/ai-server/src/dtos src/
cp -r /Users/playra/ai-server/src/exceptions src/
cp -r /Users/playra/ai-server/src/database src/
cp -r /Users/playra/ai-server/src/price src/
cp -r /Users/playra/ai-server/src/template src/

# Config - merge carefully
cp /Users/playra/ai-server/src/config/*.ts src/config/

# Interfaces - merge carefully
# Check for duplicates!
```

---

### 🟡 PHASE 5: Inngest Functions (Day 5) - FROM EXISTING PLAN

**Цель**: Мигрировать 29 Inngest функций (уже запланировано)

```bash
# Run existing migration script
./scripts/migrate-inngest-functions.sh

# Or manually:
cp -r /Users/playra/ai-server/src/inngest-functions/render src/inngest_app/functions/
cp -r /Users/playra/ai-server/src/inngest-functions/*.ts src/inngest_app/functions/content/
# ... etc (see INNGEST_MIGRATION_PLAN.md)
```

**Update imports** in all Inngest functions (like in Phase 3).

---

### 🟢 PHASE 6: Integration & Entry Points (Day 5)

**Цель**: Интегрировать REST API с Telegram bot

#### 6.1 Update Main Entry Point
Edit `src/index.ts`:

```typescript
import { app } from './api_server/server'
import './bot' // Telegram bot

const PORT = process.env.PORT || 3000
const INNGEST_PORT = process.env.INNGEST_PORT || 4000

// Start REST API + Inngest server
app.listen(INNGEST_PORT, () => {
  console.log(`🚀 REST API + Inngest server: http://localhost:${INNGEST_PORT}`)
  console.log(`📡 Inngest endpoint: http://localhost:${INNGEST_PORT}/api/inngest`)
})

// Telegram bot starts automatically when ./bot is imported
console.log('🤖 Telegram bot farm started')
```

#### 6.2 Environment Variables
Update `.env` with ALL variables from ai-server:
```bash
# Copy all env vars from ai-server
cat /Users/playra/ai-server/.env >> .env

# Remove duplicates manually
# Merge conflicting values
```

#### 6.3 Update package.json Scripts
```json
{
  "scripts": {
    "start": "node dist/index.js",
    "dev": "bun --watch src/index.ts",
    "api:dev": "nodemon src/api_server/server.ts",
    "bot:dev": "bun --watch src/bot.ts"
  }
}
```

---

## 🧪 TESTING STRATEGY

### Local Testing (Each Phase)

**After Phase 1**:
```bash
npm run build
npm run test -- src/core/supabase
```

**After Phase 2**:
```bash
npm run build
# Start API server
PORT=4000 npm run dev

# Test endpoints
curl http://localhost:4000/api/health
curl http://localhost:4000/api/inngest
```

**After Phase 3**:
```bash
# Test services
npm run test -- src/services
```

**After Phase 4**:
```bash
# Test core modules
npm run test -- src/core
```

**After Phase 5**:
```bash
# Test Inngest functions
npx inngest-cli@latest dev -u http://localhost:4000/api/inngest
```

**After Phase 6**:
```bash
# Full integration test
npm run build
npm run dev

# Test Telegram bot
# Send message to bot

# Test REST API
curl http://localhost:4000/api/generation

# Test Inngest
# Trigger function via dashboard
```

---

## 🚀 PRODUCTION DEPLOYMENT

### Pre-deployment Checklist:
- [ ] All 325 files migrated
- [ ] All imports updated
- [ ] All tests passing
- [ ] Docker build successful
- [ ] Environment variables configured
- [ ] Backup created

### Deployment Steps:

```bash
# 1. Commit all changes
git add .
git commit -m "feat: complete ai-server business logic migration

- Migrated 325 TypeScript files (644 MB)
- Added 17 REST API routes
- Added 17 controllers
- Added 38 services
- Merged 82+ core/supabase modules
- Integrated 29 Inngest functions
- All branches isolated via feature branch

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"

# 2. Push to GitHub
git push origin feat/full-ai-server-migration

# 3. Create PR and merge to production
# (after review and approval)

# 4. Deploy to Zomro
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
sleep 15
docker logs 999-multibots --tail 100
EOF

# 5. Update Inngest webhook
# https://app.inngest.com
# Webhook URL: https://999-agents.site/api/inngest

# 6. Verify all endpoints
curl https://999-agents.site/api/health
curl https://999-agents.site/api/inngest

# 7. Monitor logs for 24 hours
ssh -i ~/.ssh/zomro root@212.86.115.30 'docker logs -f 999-multibots'
```

---

## 🔀 BRANCH ISOLATION STRATEGY

### Option 1: Feature Branch (Recommended)
```bash
cd /Users/playra/999-agents-telegraf
git checkout production
git checkout -b feat/full-ai-server-migration

# All work in this branch
# Merge to production when ready
```

**Isolation**: ✅ Full isolation from production
**Easy merge**: ✅ Single merge when done
**Rollback**: ✅ Easy (git revert merge commit)

### Option 2: Worktree
```bash
git worktree add worktrees/full-migration feat/full-ai-server-migration
cd worktrees/full-migration

# All work in separate directory
# No interference with main repo
```

**Isolation**: ✅ Complete filesystem isolation
**Parallel work**: ✅ Can work on production simultaneously
**Rollback**: ✅ Just delete worktree

### Option 3: Phase Branches
```bash
git checkout -b feat/migrate-phase-1
# Phase 1 work
git checkout production
git merge feat/migrate-phase-1

git checkout -b feat/migrate-phase-2
# Phase 2 work
# etc.
```

**Isolation**: ✅ Each phase isolated
**Incremental**: ✅ Can deploy phase by phase
**Complexity**: ⚠️ More merges to manage

**Recommended**: Option 1 (Feature Branch) для полной миграции сразу

---

## 📊 TIMELINE & RESOURCES

| Phase | Tasks | Time | Files | Complexity |
|-------|-------|------|-------|------------|
| **Phase 1** | Infrastructure, Supabase | 1 day | 82 | HIGH |
| **Phase 2** | REST API, Webhooks | 1 day | 38 | HIGH |
| **Phase 3** | Services | 1 day | 38 | MEDIUM |
| **Phase 4** | Core Modules | 1 day | ~50 | MEDIUM |
| **Phase 5** | Inngest Functions | 4 hours | 29 | LOW |
| **Phase 6** | Integration | 4 hours | 5 | MEDIUM |
| **Testing** | Full integration tests | 4 hours | - | HIGH |
| **Deployment** | Production deploy | 2 hours | - | HIGH |
| **TOTAL** | | **5 days** | **325** | |

**Team**: 1 developer (можно ускорить с 2-3 developers)

---

## ✅ SUCCESS CRITERIA

- [ ] All 325 files migrated
- [ ] All imports updated and working
- [ ] All tests passing (unit + integration)
- [ ] Docker build successful
- [ ] REST API endpoints responding
- [ ] Inngest functions working
- [ ] Telegram bot working
- [ ] Webhooks processing
- [ ] Zero regressions
- [ ] Production stable 24+ hours

---

## 🆘 ROLLBACK PLAN

### If migration fails:

**Option A: Git Revert**
```bash
git revert <migration-merge-commit>
git push origin production --force
/deploy
```

**Option B: Restore ai-server**
```bash
# On Zomro server
ssh -i ~/.ssh/zomro root@212.86.115.30
cd /root/ai-server
git checkout main
pkill -f inngest-sdk-server.js
nohup node inngest-sdk-server.js > /tmp/inngest.log 2>&1 &

# Update Inngest webhook back to ai-server
# https://app.inngest.com
```

**Option C: Restore from backup**
```bash
# Restore Docker container from backup image
docker load < 999-multibots-backup.tar
docker run ...
```

---

## 🎯 FINAL CHECKLIST

### Before Starting:
- [ ] Read this document completely
- [ ] Read CRITICAL_MISSING_BUSINESS_LOGIC.md
- [ ] Create feature branch
- [ ] Backup ai-server code
- [ ] Backup telegraf code
- [ ] Prepare staging environment

### During Migration:
- [ ] Follow phases sequentially
- [ ] Test after each phase
- [ ] Update imports immediately
- [ ] Document issues
- [ ] Commit frequently

### Before Production:
- [ ] All phases complete
- [ ] Full integration test passed
- [ ] Docker build successful
- [ ] Environment vars configured
- [ ] Team approval
- [ ] Backup created

### After Production:
- [ ] Monitor logs 24h
- [ ] Test all features
- [ ] Verify webhooks
- [ ] Check Inngest dashboard
- [ ] User acceptance testing
- [ ] Deprecate ai-server (after 1 week stable)

---

**Document Version**: 1.0
**Created**: 2025-10-30
**Status**: ✅ READY FOR EXECUTION
