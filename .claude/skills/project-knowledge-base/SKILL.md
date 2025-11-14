---
name: project-knowledge-base
description: Comprehensive knowledge base of this Telegram bot project architecture, patterns, file locations, and system behavior. Use when you need to understand project structure, find specific files, or need context about how systems interact. Essential reference for ANY task in this project.
---

# 📚 Project Knowledge Base - Центральное Хранилище Знаний

**Цель**: Единый источник правды о структуре, архитектуре и паттернах проекта.

## 🏗️ Project Architecture

### High-Level Structure
```
999-agents-telegraf/
├── src/                       # Main application code
│   ├── bot.ts                 # Bot initialization (368 lines)
│   ├── index.ts               # Main entry point (634 lines)
│   ├── interfaces/            # TypeScript interfaces
│   ├── scenes/                # 43+ Telegram scenes
│   ├── core/                  # Core business logic
│   ├── services/              # External service integrations
│   ├── helpers/               # Utility functions
│   ├── middleware/            # Telegraf middleware
│   ├── inngest_app/           # Inngest background jobs
│   └── utils/                 # Shared utilities
│
├── .claude/                   # Claude Code configuration
│   ├── skills/                # 8 specialized Skills
│   ├── agents/                # 13 sub-agents
│   └── commands/              # Slash commands
│
├── docs/                      # Project documentation
├── scripts/                   # Utility scripts
└── supabase/migrations/       # Database migrations
```

## 📋 Core Systems

### 1. Telegram Bot (Telegraf 4.16.3)
```typescript
Location: src/bot.ts, src/index.ts

Architecture:
  - Multi-bot support (10 bots on ports 2999-3008)
  - Scene-based navigation (43+ scenes)
  - Session management
  - Centralized language detection
  - Middleware stack

Key Files:
  - src/bot.ts                   - Bot creation & configuration
  - src/index.ts                 - Multi-bot orchestration
  - src/interfaces/index.ts      - MyContext type
  - src/middleware/adminOnly.ts  - Admin protection

Admin IDs:
  - Stored in: process.env.ADMIN_IDS
  - Format: Comma-separated string
```

### 2. Telegram Scenes System
```typescript
Location: src/scenes/*

Total: 43+ scene directories
Categories:
  - Wizards (multi-step): 30+
  - Base Scenes (single-step): 13+

Key Scenes:
  - menuScene                      - Main menu
  - neuroPhotoWizard               - Image generation
  - textToVideoWizard              - Video generation
  - lipSyncWizard                  - LipSync operations
  - aiPhotoshopScene               - AI Photoshop
  - trainFluxModelWizard           - Model training
  - subscriptionScene              - Subscription management

Patterns:
  - Always use isRussianFromState()
  - Session initialization in step 1
  - Cancel button in every step
  - Balance checks before operations
  - Zod validation for inputs
  - Error handling with user notifications
```

### 3. Database (Supabase PostgreSQL)
```typescript
Location: src/core/supabase/

Tables (10+):
  - users                    - User profiles
  - assets                   - Generated media
  - payments                 - Payment transactions
  - model_trainings          - Flux model training data
  - clips                    - Video clips
  - instagram_scrapings      - Instagram data
  - synclabs_videos          - SyncLabs video data
  - avatars                  - User avatars
  - idempotency_keys         - Prevent duplicates

Helper Functions:
  - getUserByTelegramId()
  - updateUserBalance()
  - createModelTraining()
  - getActiveUserModelsByType()

Connection:
  - Credentials from Infisical
  - Keys: SUPABASE_URL, SUPABASE_SERVICE_KEY
```

### 4. AI Pipeline (Multi-Provider)
```typescript
Location: src/core/pipeline/, src/core/providers/

Providers:
  - Replicate      - Image/video generation, model training
  - Fal.ai         - Fast image/video models
  - KieAI          - Proprietary models
  - ElevenLabs     - Audio/voice generation
  - OpenAI         - ChatGPT, Sora 2
  - HeyGen         - Avatar videos

Architecture:
  - Provider abstraction pattern
  - Functional programming (TaskEither, pipe)
  - Failover logic
  - Cost estimation
  - Caching strategy

Key Files:
  - src/core/pipeline/media-orchestrator.ts
  - src/core/providers/registry/
  - src/core/lipsync/lipsync-orchestrator.ts
```

### 5. Background Jobs (Inngest)
```typescript
Location: src/inngest_app/

Functions (2):
  - generateModelTrainingFunction.ts  - Long-running training (1-2 hours)
  - kieAiWebhookMonitor.ts           - Webhook health monitoring

Configuration:
  - client.ts                 - Inngest client setup
  - registerFunctions.ts      - Function registration
  - inngest-provider.ts       - Provider configuration
  - render-server-client.ts   - Render server integration

Event-Driven:
  - model/training.start      → Start training
  - model/training.complete   → Training done
  - webhook/monitor.check     → Health check

Environment Variables:
  - INNGEST_EVENT_KEY
  - INNGEST_SIGNING_KEY
  - RENDER_INNGEST_EVENT_KEY
  - RENDER_INNGEST_SIGNING_KEY
```

### 6. Secret Management (Infisical)
```typescript
Location: src/services/infisical.service.ts

Rule: ONLY 5 variables in .env
  1. INFISICAL_CLIENT_ID
  2. INFISICAL_CLIENT_SECRET
  3. INFISICAL_PROJECT_ID
  4. INFISICAL_ENVIRONMENT (dev/production)
  5. NODE_ENV

All other secrets (50+) loaded from Infisical cloud:
  - Bot tokens (BOT_TOKEN_*, 10+ bots)
  - API keys (OPENAI_KEY, FAL_KEY, REPLICATE_TOKEN, etc.)
  - Database credentials (SUPABASE_*)
  - Payment keys (ROBOKASSA_*)
  - Inngest keys (INNGEST_*)
```

## 🎯 Key Patterns & Rules

### Centralized Language Detection
```typescript
// ✅ CORRECT - Only way
import { isRussianFromState } from '@/helpers/centralizedLanguage'
const isRu = isRussianFromState(ctx)

// ❌ WRONG - Never use
const isRu = ctx.from?.language_code === 'ru'
const lang = ctx.session.language
```

### Session Management in Wizards
```typescript
// ✅ CORRECT - Initialize in step 1
async (ctx) => {
  ctx.session.wizardData = {
    step: 1,
    startTime: Date.now(),
    // ... all fields
  }
}

// ❌ WRONG - Uninitialized session
async (ctx) => {
  ctx.session.wizardData.field = 'value'  // Error!
}
```

### Balance Checks
```typescript
// ✅ CORRECT - Check before operation
const balance = await getUserBalance(telegramId)
if (balance < COST) {
  await ctx.reply(isRu ? 'Недостаточно звёзд' : 'Insufficient stars')
  return
}

// Deduct BEFORE operation
await updateUserBalance(telegramId, -COST)
```

### Error Handling
```typescript
// ✅ CORRECT - Always notify user
try {
  await riskyOperation()
} catch (error) {
  console.error('Error:', error)
  await ctx.reply(
    isRu ? '❌ Ошибка. Попробуйте позже.' : '❌ Error. Try later.'
  )
}

// ❌ WRONG - Silent failure
try {
  await riskyOperation()
} catch (error) {
  console.error(error)  // User не знает!
}
```

## 📂 Critical File Locations

### Configuration Files
```
Root Level:
├── package.json                 - Dependencies
├── tsconfig.json                - TypeScript config
├── .env                         - Only 5 variables!
├── .gitignore                   - Git ignore rules
├── Dockerfile                   - Docker config
└── docker-compose.yml           - Docker compose

Claude Code:
├── .claude/config.json          - Claude config
├── .claude/settings.json        - Claude settings
├── .clauderules                 - Project rules
└── CLAUDECODE_RULES.md          - Critical rules

Documentation:
├── DEPLOYMENT_GUIDE.md          - Deployment instructions
├── INNGEST_DEVELOPMENT_RULES.md - Inngest rules
└── NGINX_DEPLOYMENT_CRITICAL_RULES.md - NGINX config
```

### Core Code Files
```
Entry Points:
├── src/index.ts                 - Main entry (634 lines)
├── src/bot.ts                   - Bot creation (368 lines)
└── src/interfaces/index.ts      - TypeScript types

Scenes (Most Important):
├── src/scenes/menuScene/index.ts
├── src/scenes/neuroPhotoWizard/index.ts
├── src/scenes/lipSyncWizard/index.ts
└── src/scenes/textToVideoWizard/

Core Systems:
├── src/core/pipeline/media-orchestrator.ts
├── src/core/lipsync/lipsync-orchestrator.ts
├── src/core/supabase/                        - All DB helpers
└── src/inngest_app/functions/

Utilities:
├── src/helpers/centralizedLanguage.ts       - Language detection
├── src/helpers/getUserUsageCount.ts         - Usage tracking
└── src/utils/logger.ts                      - Logging
```

## 🚀 Development Workflows

### Local Development
```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# TypeScript check
npm run typecheck

# Build
npm run build
```

### Production Deployment
```bash
# Server: 188.137.250.69
# User: root
# Path: /root/999-agents-telegraf

# Full deployment process:
1. SSH to server
2. cd /root/999-agents-telegraf
3. git pull origin production
4. npm install
5. npm run build
6. docker stop 999-multibots
7. docker rm 999-multibots
8. docker build --no-cache -t 999-multibots .
9. docker run -d --name 999-multibots --restart=always \
   -p 3001:3001 \
   -v /root/999-agents-telegraf/.env:/app/.env:ro \
   999-multibots

# Or use slash command:
/deploy
```

### Docker Commands
```bash
# Check container status
docker ps | grep 999-multibots

# View logs
docker logs 999-multibots --tail 100

# Restart container
docker restart 999-multibots

# Stop container
docker stop 999-multibots

# Remove container
docker rm 999-multibots
```

## 🔍 Common Tasks & File Locations

### "Где найти...?"

**Bot Configuration**
```
Question: "Где конфигурация бота?"
Files:
  - src/bot.ts                  - Bot creation
  - src/index.ts                - Multi-bot setup
  - src/interfaces/index.ts     - MyContext type
```

**Scene Implementation**
```
Question: "Где сцена X?"
Location: src/scenes/[sceneName]/
Pattern: Each scene has index.ts

Examples:
  - src/scenes/menuScene/index.ts
  - src/scenes/neuroPhotoWizard/index.ts
  - src/scenes/lipSyncWizard/index.ts
```

**Database Operations**
```
Question: "Как работать с БД?"
Location: src/core/supabase/
Files:
  - getUserByTelegramId.ts      - Get user
  - updateUserBalance.ts        - Update balance
  - createModelTraining.ts      - Create training

Schema: supabase/migrations/
```

**AI Provider Integration**
```
Question: "Как интегрировать нового AI провайдера?"
Location: src/core/providers/
Files:
  - adapters/                   - Provider adapters
  - registry/                   - Provider registry
  - src/core/pipeline/          - Orchestration

Example: src/core/providers/adapters/replicate/
```

**Background Jobs**
```
Question: "Как создать Inngest функцию?"
Location: src/inngest_app/functions/
Template: Copy generateModelTrainingFunction.ts
Register: src/inngest_app/registerFunctions.ts
```

**Language Detection**
```
Question: "Как определить язык?"
File: src/helpers/centralizedLanguage.ts
Function: isRussianFromState(ctx)
Rule: ALWAYS use this, never ctx.from.language_code
```

**Balance Management**
```
Question: "Как проверить/обновить баланс?"
Files:
  - src/core/supabase/getUserBalance.ts
  - src/core/supabase/updateUserBalance.ts
Usage:
  const balance = await getUserBalance(telegramId)
  await updateUserBalance(telegramId, -cost)
```

## 🎭 Scene Categories & Patterns

### Categories (43+ Scenes)

**Generation (15+)**
```
- neuroPhotoWizard        - Image generation
- textToVideoWizard       - T2V generation
- imageToVideoWizard      - I2V generation
- voiceAvatarWizard       - Voice avatar
- digitalAvatarBodyWizard - Digital avatar
- fluxKontextScene        - Flux Kontext
- morphingWizard          - Morphing effects
- faceSwapWizard          - Face swap
```

**Management (10+)**
```
- menuScene               - Main menu
- balanceScene            - Balance display
- subscriptionScene       - Subscription management
- checkBalanceScene       - Balance check
- subscriptionCheckScene  - Sub check
```

**Training & Data (8+)**
```
- trainFluxModelWizard    - Model training
- uploadTrainFluxModelScene - Upload training data
- selectModelWizard       - Model selection
- instagramScrapingWizard - Instagram scraping
- instagramParserWizard   - Instagram parsing
```

**Utility (10+)**
```
- improvePromptWizard     - Prompt improvement
- uploadVideoScene        - Video upload
- cancelPredictionsWizard - Cancel operations
- videoTranscriptionWizard - Transcription
- chatWithAvatarWizard    - Chat with avatar
```

## 🔐 Security & Permissions

### Admin-Only Features
```typescript
Files with Admin Checks:
  - src/middleware/adminOnly.ts         - Admin middleware
  - src/scenes/createUserScene.ts       - User creation

Admin IDs:
  - Environment: process.env.ADMIN_IDS
  - Format: "id1,id2,id3"
  - Check: adminIds.includes(telegram_id)
```

### Secret Management
```typescript
Critical Rule: NEVER add secrets to .env!

Process:
  1. Add secret to Infisical dashboard
  2. Access in code: process.env.SECRET_NAME
  3. Infisical loads automatically on app start

Infisical Service:
  - src/services/infisical.service.ts
  - Loads ALL secrets from cloud
  - Fallback to .env only for 5 core variables
```

## 📊 Monitoring & Logging

### Production Monitoring
```bash
Commands:
  /check              - Full health check
  /logs               - View recent logs
  /autonomous-monitor - Control auto-monitoring

Logs Location:
  - Docker: docker logs 999-multibots
  - Files: /root/999-agents-telegraf/logs/

Key Metrics:
  - Container status (CPU, Memory)
  - Error rate in logs
  - Bot responsiveness
  - Database connectivity
```

### Error Handling
```typescript
Logger: src/utils/logger.ts

Patterns:
  - logger.info('✅ Success message', { context })
  - logger.error('❌ Error message', { error, context })
  - logger.warn('⚠️ Warning message', { context })

Best Practices:
  - Always use emojis for visibility
  - Include context object
  - Log before and after critical operations
```

## 🎯 Quick Reference Cards

### New Scene Checklist
```
✅ Use telegram-scene-builder agent
✅ Copy structure from similar scene
✅ Initialize session in step 1
✅ Use isRussianFromState() for language
✅ Add cancel button in every step
✅ Check balance before paid operations
✅ Validate inputs with Zod
✅ Handle errors with user notifications
✅ Remove keyboard when leaving
✅ Test locally before deploy
```

### New AI Provider Checklist
```
✅ Study ai-pipeline-orchestration skill
✅ Create adapter in src/core/providers/adapters/
✅ Add to registry in src/core/providers/registry/
✅ Implement required interface methods
✅ Add cost estimation
✅ Add error handling with failover
✅ Test with mock data first
✅ Add secrets to Infisical
✅ Document in ai-pipeline-orchestration skill
```

### Deployment Checklist
```
✅ Run npm run typecheck locally
✅ Run npm run build locally
✅ Test changes thoroughly
✅ Commit changes to git
✅ Push to production branch
✅ Use /deploy command OR manual Docker rebuild
✅ Run /check after deployment
✅ Monitor logs for errors
✅ Be ready to rollback if needed
```

## 📚 Related Documentation

### Internal Docs
```
.claude/skills/
  ├── telegram-scenes-ULTIMATE/    - All scene patterns
  ├── telegram-bot-expert/         - Telegraf expertise
  ├── supabase-database/           - Database schema
  ├── inngest-expert/              - Background jobs
  ├── ai-pipeline-orchestration/   - AI providers
  ├── production-deployment/       - Deployment process
  ├── infisical-secrets/           - Secret management
  └── master-orchestrator/         - Coordination system

docs/
  ├── DEPLOYMENT_GUIDE.md
  ├── INNGEST_DEVELOPMENT_RULES.md
  └── NGINX_DEPLOYMENT_CRITICAL_RULES.md
```

### External Resources
```
Frameworks:
  - Telegraf: https://telegraf.js.org/
  - Inngest: https://www.inngest.com/docs

Services:
  - Supabase: https://supabase.com/docs
  - Infisical: https://infisical.com/docs
  - Replicate: https://replicate.com/docs
  - Fal.ai: https://fal.ai/docs
```

## 🎯 When to Use This Skill

### ✅ Use Project Knowledge Base when:
1. Starting ANY task in this project
2. Need to find specific file location
3. Understanding system architecture
4. Looking for similar implementations
5. Checking project patterns and rules
6. Understanding how systems interact
7. Finding documentation location

### 🎼 Use with Master Orchestrator:
```
Orchestrator asks: "What Skills needed?"
Knowledge Base answers: "Here's the project structure"

Orchestrator asks: "Where is file X?"
Knowledge Base answers: "Located at src/path/to/file.ts"

Orchestrator asks: "What's the pattern for Y?"
Knowledge Base answers: "Pattern documented in section Z"
```

---

**Created**: 2025-01-11
**Version**: 1.0
**Status**: Production-ready ✅
**Updates**: Should be updated when major architecture changes occur
