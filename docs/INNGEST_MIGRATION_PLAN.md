# 🚀 INNGEST MIGRATION PLAN: ai-server → 999-agents-telegraf

## 📊 EXECUTIVE SUMMARY

**Цель**: Перенести все Inngest функции и бизнес-логику из `ai-server` в `999-agents-telegraf` для унификации архитектуры.

**Статус проектов**:
- **ai-server**: https://999-agents.site (порт 4000, Zomro 212.86.115.30)
- **999-agents-telegraf**: Docker контейнер `999-multibots` (порты 2999-3010)

**Ключевые преимущества миграции**:
1. ✅ Единая кодовая база для Telegram ботов и Inngest функций
2. ✅ Упрощенный деплоймент (один Docker контейнер)
3. ✅ Общие зависимости и конфигурация
4. ✅ Консистентная бизнес-логика
5. ✅ Упрощенный мониторинг и отладка

---

## 🗂️ АРХИТЕКТУРНЫЙ АНАЛИЗ

### ai-server Structure (Source)
```
/Users/playra/ai-server/
├── src/
│   ├── inngest-functions/           # 🎯 МИГРАЦИЯ: Основные функции
│   │   ├── render/                  # 🎬 Render workflows (3 функции)
│   │   │   ├── render.ts           # renderFunction
│   │   │   ├── renderRiddle.ts     # renderRiddleFunction
│   │   │   ├── renderAvatarVideo.ts # renderAvatarVideoFunction
│   │   │   ├── steps.ts            # Shared render steps
│   │   │   ├── types.ts            # TypeScript types
│   │   │   └── schemas.ts          # Zod validation
│   │   ├── analyzeCompetitorReels.ts
│   │   ├── instagramScraper-v2.ts
│   │   ├── findCompetitors.ts
│   │   ├── extractTopContent.ts
│   │   ├── generateContentScripts.ts
│   │   ├── generateScenarioClips.ts
│   │   ├── generateDetailedScript.ts
│   │   ├── generateModelTraining.ts
│   │   ├── modelTrainingV2.ts
│   │   ├── neuroImageGeneration.ts
│   │   ├── broadcastMessage.ts
│   │   ├── paymentProcessing.ts
│   │   ├── morphImages.ts
│   │   ├── logMonitor.ts
│   │   ├── criticalErrorMonitor.ts
│   │   ├── helloworld.ts
│   │   └── index.ts                # Export all functions
│   ├── core/
│   │   └── inngest/
│   │       ├── clients.ts          # Inngest client setup
│   │       └── instagram-client.ts
│   ├── routes/
│   │   └── inngest.route.ts        # Express route для Inngest
│   ├── helpers/
│   │   └── inngest/
│   │       ├── balanceHelpers.ts
│   │       └── index.ts
│   └── inngest/                    # Inngest SDK setup
│       ├── client.ts
│       ├── index.ts
│       └── validation/
│           └── inngest-rules.ts
├── inngest-sdk-server.js           # 🚨 STANDALONE SERVER (Node.js)
├── ecosystem.mcp.config.js         # PM2 config
└── package.json
```

### 999-agents-telegraf Structure (Target)
```
/Users/playra/999-agents-telegraf/
├── src/
│   ├── inngest_app/                # ✅ СУЩЕСТВУЮЩАЯ структура
│   │   ├── functions/
│   │   │   ├── generateAIReelsFunction.ts
│   │   │   ├── generateModelTrainingFunction.ts
│   │   │   ├── generateAdvancedLoopingVideoFunction.ts
│   │   │   └── wan25-helpers.ts
│   │   ├── client.ts               # Inngest client
│   │   ├── inngest-provider.ts     # Provider setup
│   │   ├── render-server-client.ts # Render server client
│   │   └── send-event.ts           # Event sender
│   ├── bot.ts                      # Main bot file
│   ├── index.ts                    # Entry point
│   ├── core/
│   │   └── supabase/
│   ├── scenes/                     # Telegram scenes
│   ├── handlers/                   # Bot handlers
│   └── helpers/
├── Dockerfile
└── package.json
```

---

## 📋 MIGRATION MAPPING (File-by-File)

### Phase 1: Render Workflows (Priority HIGH)
| Source (ai-server) | Target (telegraf) | Status | Dependencies |
|-------------------|-------------------|--------|--------------|
| `inngest-functions/render/render.ts` | `inngest_app/functions/render/render.ts` | 🔴 TODO | ssh2, ffmpeg |
| `inngest-functions/render/renderRiddle.ts` | `inngest_app/functions/render/renderRiddle.ts` | 🔴 TODO | render.ts, OpenAI |
| `inngest-functions/render/renderAvatarVideo.ts` | `inngest_app/functions/render/renderAvatarVideo.ts` | 🔴 TODO | render.ts, Hedra API |
| `inngest-functions/render/steps.ts` | `inngest_app/functions/render/steps.ts` | 🔴 TODO | SSH, S3, Supabase |
| `inngest-functions/render/types.ts` | `inngest_app/functions/render/types.ts` | 🔴 TODO | Zod |
| `inngest-functions/render/schemas.ts` | `inngest_app/functions/render/schemas.ts` | 🔴 TODO | Zod |
| `inngest-functions/render/helpers/` | `inngest_app/functions/render/helpers/` | 🔴 TODO | Multiple |

### Phase 2: Content Generation (Priority MEDIUM)
| Source | Target | Status | Dependencies |
|--------|--------|--------|--------------|
| `analyzeCompetitorReels.ts` | `inngest_app/functions/content/analyzeCompetitorReels.ts` | 🔴 TODO | OpenAI, Instagram |
| `instagramScraper-v2.ts` | `inngest_app/functions/content/instagramScraper-v2.ts` | 🔴 TODO | Apify, Supabase |
| `findCompetitors.ts` | `inngest_app/functions/content/findCompetitors.ts` | 🔴 TODO | OpenAI, Supabase |
| `extractTopContent.ts` | `inngest_app/functions/content/extractTopContent.ts` | 🔴 TODO | Supabase |
| `generateContentScripts.ts` | `inngest_app/functions/content/generateContentScripts.ts` | 🔴 TODO | OpenAI |
| `generateScenarioClips.ts` | `inngest_app/functions/content/generateScenarioClips.ts` | 🔴 TODO | OpenAI, Replicate |
| `generateDetailedScript.ts` | `inngest_app/functions/content/generateDetailedScript.ts` | 🔴 TODO | OpenAI |

### Phase 3: Model Training & Image Generation (Priority MEDIUM)
| Source | Target | Status | Dependencies |
|--------|--------|--------|--------------|
| `generateModelTraining.ts` | `inngest_app/functions/training/generateModelTraining.ts` | 🟡 EXISTS | Replicate, S3 |
| `modelTrainingV2.ts` | `inngest_app/functions/training/modelTrainingV2.ts` | 🔴 TODO | Replicate, Supabase |
| `neuroImageGeneration.ts` | `inngest_app/functions/image/neuroImageGeneration.ts` | 🔴 TODO | Replicate, FAL |
| `morphImages.ts` | `inngest_app/functions/image/morphImages.ts` | 🔴 TODO | Replicate |

### Phase 4: Payments & Monitoring (Priority LOW)
| Source | Target | Status | Dependencies |
|--------|--------|--------|--------------|
| `paymentProcessing.ts` | `inngest_app/functions/payments/paymentProcessing.ts` | 🔴 TODO | Supabase |
| `broadcastMessage.ts` | `inngest_app/functions/broadcast/broadcastMessage.ts` | 🔴 TODO | Telegraf |
| `logMonitor.ts` | `inngest_app/functions/monitoring/logMonitor.ts` | 🔴 TODO | Supabase, SSH |
| `criticalErrorMonitor.ts` | `inngest_app/functions/monitoring/criticalErrorMonitor.ts` | 🔴 TODO | Supabase |

### Phase 5: Core Infrastructure (Priority CRITICAL)
| Source | Target | Status | Notes |
|--------|--------|--------|-------|
| `core/inngest/clients.ts` | `inngest_app/client.ts` | 🟢 MERGE | Merge configurations |
| `helpers/inngest/` | `helpers/inngest/` | 🔴 TODO | Copy helpers |
| `routes/inngest.route.ts` | `api_server/routes/inngest.ts` | 🔴 TODO | Express route |
| `inngest-sdk-server.js` | ❌ REMOVE | 🔴 TODO | Integrate into index.ts |

---

## 🏗️ NEW DIRECTORY STRUCTURE (Target)

```
/Users/playra/999-agents-telegraf/
├── src/
│   ├── inngest_app/
│   │   ├── functions/
│   │   │   ├── render/              # 🎬 Render workflows (from ai-server)
│   │   │   │   ├── render.ts
│   │   │   │   ├── renderRiddle.ts
│   │   │   │   ├── renderAvatarVideo.ts
│   │   │   │   ├── steps.ts
│   │   │   │   ├── types.ts
│   │   │   │   ├── schemas.ts
│   │   │   │   └── helpers/
│   │   │   ├── content/             # 📝 Content generation
│   │   │   │   ├── analyzeCompetitorReels.ts
│   │   │   │   ├── instagramScraper-v2.ts
│   │   │   │   ├── findCompetitors.ts
│   │   │   │   ├── extractTopContent.ts
│   │   │   │   ├── generateContentScripts.ts
│   │   │   │   ├── generateScenarioClips.ts
│   │   │   │   └── generateDetailedScript.ts
│   │   │   ├── training/            # 🧠 Model training
│   │   │   │   ├── generateModelTraining.ts (merge existing)
│   │   │   │   └── modelTrainingV2.ts
│   │   │   ├── image/               # 🎨 Image generation
│   │   │   │   ├── neuroImageGeneration.ts
│   │   │   │   └── morphImages.ts
│   │   │   ├── payments/            # 💰 Payment processing
│   │   │   │   └── paymentProcessing.ts
│   │   │   ├── broadcast/           # 📢 Broadcasting
│   │   │   │   └── broadcastMessage.ts
│   │   │   ├── monitoring/          # 📊 Monitoring & logs
│   │   │   │   ├── logMonitor.ts
│   │   │   │   └── criticalErrorMonitor.ts
│   │   │   └── index.ts             # Export all functions
│   │   ├── client.ts                # Inngest client (merge configs)
│   │   ├── inngest-provider.ts      # Provider setup
│   │   ├── render-server-client.ts  # Render server client
│   │   └── send-event.ts            # Event sender
│   ├── api_server/
│   │   └── routes/
│   │       └── inngest.ts           # Inngest HTTP endpoint
│   ├── helpers/
│   │   └── inngest/                 # Inngest helpers (from ai-server)
│   │       ├── balanceHelpers.ts
│   │       └── index.ts
│   └── index.ts                     # Main entry (integrate Inngest server)
```

---

## 🔧 DEPENDENCY CHANGES

### Dependencies to ADD to telegraf package.json:
```json
{
  "dependencies": {
    "ssh2": "^1.17.0",          // SSH for remote rendering
    "archiver": "^7.0.1",        // Archive creation
    "adm-zip": "^0.5.16",        // ZIP handling
    "@aws-sdk/client-s3": "^3.913.0",           // S3 uploads
    "@aws-sdk/s3-request-presigner": "^3.913.0", // S3 presigned URLs
    "fluent-ffmpeg": "^2.1.3"    // Video processing (if local rendering)
  }
}
```

### Dependencies ALREADY in telegraf:
- ✅ `inngest` (v2.7.2 → upgrade to v3.37.0)
- ✅ `openai`
- ✅ `replicate`
- ✅ `@supabase/supabase-js`
- ✅ `telegraf`
- ✅ `axios`
- ✅ `dotenv`
- ✅ `elevenlabs`
- ✅ `zod`

---

## 🌍 ENVIRONMENT VARIABLES

### Variables to ADD to telegraf .env:
```bash
# Render Server (SSH)
RENDER_SERVER_HOST=212.86.115.30
RENDER_SERVER_USER=root
RENDER_SERVER_SSH_KEY_PATH=/root/.ssh/zomro
RENDER_SERVER_PROJECT_PATH=/root/remotion-render

# S3 (AWS)
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_REGION=us-east-1
AWS_S3_BUCKET=your_bucket

# Inngest (Production)
INNGEST_EVENT_KEY=your_inngest_event_key
INNGEST_SIGNING_KEY=your_inngest_signing_key

# API Keys (merge from ai-server)
OPENAI_API_KEY=
REPLICATE_API_TOKEN=
HEDRA_API_KEY=
HEYGEN_API_KEY=
RUNWAY_API_KEY=
ELEVENLABS_API_KEY=
FAL_KEY=
```

---

## 📡 API INTEGRATION CHANGES

### 1. Inngest Server Integration

**Current ai-server setup** (standalone server):
```javascript
// inngest-sdk-server.js (REMOVE after migration)
const express = require('express')
const { serve } = require('inngest/express')
const { inngest } = require('./dist/core/inngest/clients')
const { functions } = require('./dist/inngest-functions')

const app = express()
app.use('/api/inngest', serve({ client: inngest, functions }))
app.listen(4000)
```

**New telegraf setup** (integrated):
```typescript
// src/index.ts (MODIFY)
import express from 'express'
import { serve } from 'inngest/express'
import { inngest } from './inngest_app/client'
import { functions } from './inngest_app/functions'

// ... existing bot setup ...

// Add Inngest HTTP endpoint
const app = express()
app.use('/api/inngest', serve({ client: inngest, functions }))

app.listen(4000, () => {
  console.log('🚀 Inngest server listening on port 4000')
  console.log('📡 Inngest endpoint: https://999-agents.site/api/inngest')
})
```

### 2. Telegram Bot → Inngest Events

**Pattern** (ALREADY EXISTS in telegraf):
```typescript
// src/scenes/someScene.ts
import { sendEvent } from '@/inngest_app/send-event'

export const someScene = new Scenes.BaseScene<MyContext>('scene_id')

someScene.action('button', async (ctx) => {
  // Send event to Inngest function
  await sendEvent({
    name: 'render/riddle.requested',
    data: {
      telegram_id: ctx.from.id,
      // ... other data
    },
  })
})
```

---

## 🚀 MIGRATION EXECUTION PLAN

### Step 1: Preparation (Day 1)
1. ✅ Create migration plan (this document)
2. 🔴 Backup ai-server codebase
3. 🔴 Create feature branch in telegraf: `feat/inngest-migration`
4. 🔴 Update telegraf package.json dependencies
5. 🔴 Add new environment variables to .env

### Step 2: Core Infrastructure (Day 2)
1. 🔴 Merge `core/inngest/clients.ts` into `inngest_app/client.ts`
2. 🔴 Copy `helpers/inngest/` to telegraf
3. 🔴 Create Inngest HTTP route in `api_server/routes/inngest.ts`
4. 🔴 Integrate Inngest server into `index.ts`
5. 🔴 Test Inngest endpoint locally

### Step 3: Phase 1 - Render Workflows (Day 3-4)
1. 🔴 Create `inngest_app/functions/render/` directory
2. 🔴 Copy all render files from ai-server
3. 🔴 Update imports and paths
4. 🔴 Test SSH connections to render server
5. 🔴 Test S3 uploads
6. 🔴 Test full render workflow locally

### Step 4: Phase 2 - Content Generation (Day 5-6)
1. 🔴 Create `inngest_app/functions/content/` directory
2. 🔴 Migrate content generation functions
3. 🔴 Update Instagram scraper integrations
4. 🔴 Test OpenAI API calls
5. 🔴 Test Supabase queries

### Step 5: Phase 3 - Training & Images (Day 7)
1. 🔴 Merge existing `generateModelTraining.ts`
2. 🔴 Migrate `modelTrainingV2.ts`
3. 🔴 Migrate image generation functions
4. 🔴 Test Replicate API integrations
5. 🔴 Test FAL API integrations

### Step 6: Phase 4 - Payments & Monitoring (Day 8)
1. 🔴 Migrate payment processing
2. 🔴 Migrate broadcast functions
3. 🔴 Migrate monitoring functions
4. 🔴 Test payment flows
5. 🔴 Test monitoring alerts

### Step 7: Testing & Validation (Day 9-10)
1. 🔴 Unit tests for migrated functions
2. 🔴 Integration tests (Telegram → Inngest → Render)
3. 🔴 Load testing
4. 🔴 Error handling validation
5. 🔴 Performance benchmarking

### Step 8: Production Deployment (Day 11)
1. 🔴 Merge migration branch to `production`
2. 🔴 Deploy to Zomro via GitHub Actions or `/deploy`
3. 🔴 Update Inngest webhook URL (https://999-agents.site/api/inngest)
4. 🔴 Monitor logs for errors
5. 🔴 Gradually migrate traffic from ai-server

### Step 9: Cleanup (Day 12)
1. 🔴 Deprecate ai-server (`inngest-sdk-server.js`)
2. 🔴 Update production Nginx config (if needed)
3. 🔴 Archive ai-server repository
4. 🔴 Update documentation
5. 🔴 Notify team of changes

---

## ⚠️ RISKS & MITIGATION

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Breaking existing bot functionality | 🔴 HIGH | 🟡 MEDIUM | Thorough testing, feature flags |
| Inngest version incompatibility | 🟡 MEDIUM | 🟢 LOW | Test with inngest@3.37.0 locally first |
| SSH/Render server connection issues | 🔴 HIGH | 🟢 LOW | Test SSH connections in isolation |
| Missing dependencies | 🟡 MEDIUM | 🟡 MEDIUM | Add all deps before migration |
| Docker build failures | 🟡 MEDIUM | 🟡 MEDIUM | Test Docker build locally |
| Production downtime | 🔴 HIGH | 🟢 LOW | Blue-green deployment, rollback plan |

---

## 📊 SUCCESS METRICS

- ✅ All 25+ Inngest functions migrated
- ✅ Zero downtime during migration
- ✅ All tests passing (unit + integration)
- ✅ Docker build < 5 minutes
- ✅ Inngest endpoint responding < 100ms
- ✅ Render workflows working end-to-end
- ✅ No regressions in existing bot functionality

---

## 🔗 ROLLBACK PLAN

If migration fails in production:

1. **Immediate rollback**:
   ```bash
   git revert <migration-commit-hash>
   git push origin production --force
   /deploy  # Redeploy previous version
   ```

2. **Restore ai-server**:
   ```bash
   ssh -i ~/.ssh/zomro root@212.86.115.30
   cd /root/ai-server
   git checkout main
   pkill -f inngest-sdk-server.js
   nohup node inngest-sdk-server.js > /tmp/inngest.log 2>&1 &
   ```

3. **Update Inngest webhook**: Point back to ai-server URL

---

## 📚 REFERENCES

- **ai-server GitHub**: https://github.com/gHashTag/ai-server.git
- **telegraf Local**: `/Users/playra/999-agents-telegraf`
- **Production server**: `ssh -i ~/.ssh/zomro root@212.86.115.30`
- **Inngest Docs**: https://www.inngest.com/docs
- **CLAUDE.md**: Project instructions

---

## 🎯 NEXT STEPS

1. ✅ Review this migration plan
2. 🔴 Get approval from team/stakeholders
3. 🔴 Create `feat/inngest-migration` branch
4. 🔴 Start with Step 1: Preparation
5. 🔴 Execute migration steps sequentially
6. 🔴 Deploy to production
7. 🔴 Monitor and optimize

---

**Document Version**: 1.0
**Created**: 2025-10-30
**Author**: Claude Code
**Status**: DRAFT - Awaiting Approval
