# CLAUDE.md - Project Context for Claude Code

> **Как здесь работать — в [AGENTS.md](AGENTS.md).** Там шлюзы, ловушки и
> правила, которые нельзя нарушать. Этот файл описывает ПРОЕКТ, тот — РАБОТУ.

## 🎯 Миссия: t27 в центре

**t27 — центральный репозиторий. trios — второстепенный.**

Цель: чтобы файлы не писались руками, а **порождались из спецификаций `.t27`**.
Когда человек подключает свой репозиторий, тот сканируется на логику, уже
существующую спекой; чего нет — получает спеку, и она возвращается в общий банк.
Так один и тот же код перестаёт писаться дважды.

Замер 07.09.2026: **760 спеков**, 216 982 строки, пять движков — t27 (575),
tri-net (113), trinity-fpga (64), tt-trinity-corona (5), trinity (3).
Здоровье: 522 ok, 235 warn, 3 fail.

Королева на `t27.ai/#/queen` судит код и держит доску; её живые данные —
`trios-agent-server-production.up.railway.app/queen/*`. В приложении это
вкладка «Улей» (`/hive/:tab`, шесть подвкладок).

## 🌐 Язык

**Код — по-английски, разговор — по-русски.** Идентификаторы и комментарии
английские (проверяет `scripts/no-cyrillic-guard.cjs` на каждом коммите),
кириллица допустима внутри строковых литералов и по маркеру `cyrillic-ok`.
Текст интерфейса — только через словарь `player/src/atoms/language.ts`.
**Английский по умолчанию**: `getInitialLanguage` возвращает `'en'`, если
браузер не просит русский.

## 🛡️ Шлюзы коммита

`lefthook run pre-commit`: секреты, prettier, eslint, tsc, no-cyrillic,
check:player-types. **До 07.09.2026 они не запускались вовсе** — `core.hooksPath`
указывал на `.husky`, и husky печатал «Все проверки пройдены», выполнив одну
проверку из пяти. Починено; см. AGENTS.md §3.

⚠️ `npx lefthook run pre-commit` руками **теряет незакоммиченное**. Сначала
коммит, потом хуки.

## 🚨 CRITICAL NAVIGATION RULE - SINGLE SOURCE OF TRUTH

**ЕДИНСТВЕННЫЙ источник правды для навигации: `/src/navigation/`**

NEVER use or create navigation code outside of `/src/navigation/`:

- `/src/services/NavigationService.ts` - DEPRECATED, TO BE DELETED
- `/src/menu/` - DEPRECATED, TO BE DELETED

ALL navigation imports MUST come from `@/navigation`:

```typescript
// ✅ CORRECT
import { showMainMenu, createMainMenuKeyboard } from '@/navigation'
import { buttonMatcher, safeEnterScene } from '@/navigation'

// ❌ WRONG - DO NOT USE
import { showMainMenu } from '@/services/NavigationService'
```

---

**Project**: 999-agents-telegraf - Multi-bot Telegram Platform with AI Generation
**Language**: TypeScript + Node.js 20
**Framework**: Telegraf 4.16.3
**Database**: Supabase (PostgreSQL)
**Secrets**: Infisical (cloud-first, only 5 vars in .env)
**Background Jobs**: Inngest (event-driven async)
**AI Providers**: Replicate, Fal, KieAI, OpenAI, Sora, HeyGen, etc.
**Deployment**: fly.io (app: 999-multibots-telegraf, org: Abbie Connell)

---

## 🎯 Project Overview

Multi-bot platform для генерации AI-контента (видео, изображения, музыка, LipSync):

- 43+ Telegram scenes (wizards)
- 10+ AI providers с failover
- User subscription system
- Background job processing (1-2 hour tasks)
- Multi-language support (RU/EN)

---

## 📂 Project Structure

```
999-agents-telegraf/
├── src/
│   ├── bot.ts                 # Main bot initialization
│   ├── index.ts               # Entry point
│   ├── scenes/                # 43+ Telegram wizards
│   │   ├── neuroPhotoWizard/
│   │   ├── neuroVideoWizard/
│   │   ├── lipSyncWizard/
│   │   └── ...
│   ├── services/              # Business logic layer
│   │   ├── ai-providers/      # AI provider integrations
│   │   ├── inngest/           # Background job functions
│   │   └── supabase/          # Database queries
│   ├── helpers/               # Utilities
│   │   ├── centralizedLanguage.ts  # isRussianFromState()
│   │   ├── keyboard-composers/ # Button builders
│   │   └── logger.ts          # Logging
│   └── types/                 # TypeScript types
├── .claude/                   # Claude Code configuration
│   ├── skills/                # 11 specialized skills
│   │   ├── master-orchestrator/
│   │   ├── telegram-scenes-ULTIMATE/
│   │   └── ...
│   ├── agents/                # 15+ specialized agents
│   │   ├── devops-automation.md
│   │   ├── continuous-optimizer.md
│   │   └── ...
│   └── commands/              # Slash commands
├── Dockerfile                 # esbuild production build (fast 2min)
├── deploy.sh                  # Unified deployment (dev/staging/prod)
├── CLAUDECODE_RULES.md        # Critical project rules
└── package.json
```

---

## 🚀 Common Development Workflows

### 1. Local Development

```bash
# Install dependencies
npm install

# Type check (ALWAYS before commit)
npm run typecheck

# Build TypeScript
npm run build

# Run locally
npm run dev

# Watch mode
npm run dev:watch
```

### 2. Testing (NEW! Docker Test Environment)

```bash
# 🆕 Local Docker testing (recommended)
docker-compose -f docker-compose.test.yml up -d

# Watch mode (auto-reload on changes)
docker-compose -f docker-compose.test.yml exec app-test npm run test:watch

# Run all tests in isolated environment
docker-compose -f docker-compose.test.yml exec app-test npm test

# Run specific test file
docker-compose -f docker-compose.test.yml exec app-test \
  npm test -- neuroPhotoWizard.test.ts

# Test with coverage
docker-compose -f docker-compose.test.yml exec app-test npm run test:coverage

# Integration tests (with real DB)
docker-compose -f docker-compose.test.yml exec app-test npm run test:integration

# E2E tests (full stack with mocks)
docker-compose -f docker-compose.test.yml --profile e2e up --abort-on-container-exit

# CI test suite (full validation)
docker-compose -f docker-compose.test.yml --profile ci up --abort-on-container-exit

# View test logs
docker-compose -f docker-compose.test.yml logs -f app-test

# Check container health
docker-compose -f docker-compose.test.yml ps

# Cleanup test environment
docker-compose -f docker-compose.test.yml down -v

# TDD: Test-First development in Docker
# 1. Start watch mode: docker-compose exec app-test npm run test:watch
# 2. Write test (RED) - test fails
# 3. Write minimal code (GREEN) - test passes
# 4. Refactor (REFACTOR) - tests keep passing

# Legacy (local testing without Docker)
npm test
npm test -- neuroPhotoWizard.test.ts
npm test -- --coverage
```

### 3. Деплой (Railway)

```bash
# Проект Railway: 999. Сервис бота: 999-multibots-telegraf.
# Деплой идёт САМ при merge в main — руками ничего запускать не нужно.

railway link                                  # один раз
railway service 999-multibots-telegraf        # привязать сервис

railway deployment list                       # состояние последних сборок
railway logs                                  # логи сервиса
railway variables --kv                        # имена и значения переменных
railway variables --set KEY=VALUE             # задать переменную
```

**Про fly.io.** Раздел с командами `flyctl` и токеном жил здесь по инерции.
Проверено 2026-08-23: `https://999-multibots-telegraf.fly.dev/health` не
отвечает вовсе (код 000, соединение не устанавливается), а рабочие деплои
идут в Railway. Инструкция вела на мёртвую площадку, поэтому убрана.

**Токены в этом файле больше не хранятся.** Раньше здесь лежали открытым
текстом `FLY_API_TOKEN`, `INNGEST_EVENT_KEY` и `INNGEST_SIGNING_KEY`. Файл
отслеживается git и уходит в репозиторий вместе с кодом — значение в нём
равносильно опубликованному. Секрет берётся из Railway или Infisical:

```bash
railway variables --kv | grep '^ИМЯ='         # значение из окружения сервиса
infisical secrets get ИМЯ                     # значение из Infisical
```

### 4. Secret Management (Infisical)

```bash
# RULE: Only 5 variables in .env (local)
# All other secrets MUST be in Infisical

# 🚨 ПРАВИЛО: значения ключей НЕ хранятся в документации и не вставляются
# в файлы репозитория. Читать их из Railway (`railway variables --kv`)
# или Infisical (`infisical secrets get ИМЯ`). Значение, попавшее в
# отслеживаемый файл, придётся ОТЗЫВАТЬ, а не удалять.

# Local .env (5 variables only):
INFISICAL_CLIENT_ID=xxx
INFISICAL_CLIENT_SECRET=xxx
INFISICAL_PROJECT_ID=xxx
INFISICAL_ENVIRONMENT=dev
NODE_ENV=development

# Production .env (5 variables only):
INFISICAL_CLIENT_ID=xxx
INFISICAL_CLIENT_SECRET=xxx
INFISICAL_PROJECT_ID=xxx
INFISICAL_ENVIRONMENT=prod
NODE_ENV=production

# All other secrets in Infisical:
# - TELEGRAM_BOT_TOKEN
# - SUPABASE_URL
# - SUPABASE_SERVICE_KEY
# - REPLICATE_API_KEY
# - FAL_KEY
# - OPENAI_API_KEY
# - etc. (50+ secrets)

# Loading secrets (automatic in code):
import { getInfisicalSecrets } from './services/infisical';
const secrets = await getInfisicalSecrets();
const botToken = secrets.TELEGRAM_BOT_TOKEN;
```

### 5. Database Operations

```bash
# Connect to Supabase
# Dashboard: https://supabase.com/dashboard/project/...

# Common queries (use helpers):
import { getUserByTelegramId, updateUserBalance } from './services/supabase/users';

const user = await getUserByTelegramId(ctx.from.id);
await updateUserBalance(user.telegram_id, -10); // Deduct balance
```

### 6. Monitoring & Health Checks

```bash
# Quick health check
/check

# View logs
/logs

# User diagnostics (auto-triggers on 8-12 digit ID)
/user-check 8190001592

# Server SSH
ssh root@188.137.250.69

# Container logs
docker logs 999-multibots --tail 100 --follow

# Container status
docker ps | grep 999-multibots

# Resource usage
docker stats 999-multibots --no-stream
```

---

## 🎭 Claude Code Skills & Agents

### Master Skills (Use First)

1. **master-orchestrator** - Central coordination for ALL complex tasks
2. **project-knowledge-base** - File locations, patterns, architecture

### Domain Skills

3. **telegram-scenes-ULTIMATE** - Scene creation (ZERO-ERROR guarantee)
4. **supabase-database** - Database queries and schema
5. **inngest-expert** - Background jobs (1-2 hour tasks)
6. **ai-pipeline-orchestration** - Multi-provider AI integration
7. **production-deployment** - Deployment procedures
8. **infisical-secrets** - Secret management rules

### System Skills

9. **error-recovery-debugging** - Error patterns and recovery

### Key Agents

- **devops-automation** - Local build + remote deploy (NEW!)
- **continuous-optimizer** - Daily code optimization (NEW!)
- **telegram-scene-builder** - Scene creation patterns
- **code-reviewer** - Strict quality control
- **anti-duplication-guardian** - Prevent code duplication
- **business-logic-guardian** - Clean Architecture enforcer
- **tdd-test-engineer** - Test-First development

---

## 🔒 Critical Rules (From CLAUDECODE_RULES.md)

### ABSOLUTE PROHIBITIONS

0. **🚫 NEVER use git force push** - `git push --force`, `git push -f` - ABSOLUTELY FORBIDDEN!
   - Deletes commit history permanently
   - Overwrites other developers' work
   - Makes rollback impossible
   - ONLY use Pull Request workflow: `git checkout -b feat/name && git push -u origin feat/name && gh pr create`

1. **NEVER add secrets to .env** (only 5 Infisical variables)

2. **NEVER skip type checking** before deployment

3. **NEVER deploy without health check**

4. **NEVER ignore TypeScript errors** (`|| true` forbidden)

5. **NEVER create duplicate code** (use anti-duplication-guardian)

### Telegram Scene Rules (5 Absolute Rules)

1. **ALWAYS** `answerCbQuery()` as FIRST line in action handlers
2. **ALWAYS** validate message type before accessing properties
3. **ALWAYS** initialize `ctx.session.wizardData` in step 1
4. **ALWAYS** use `isRussianFromState(ctx)` for language detection
5. **NEVER** access `ctx.message.text` without type guard

### Business Logic Rules

1. **NEVER** put business logic in scenes (use services/)
2. **ALWAYS** separate UI from business logic
3. **ALWAYS** use Clean Architecture principles

### Testing Rules

1. **ALWAYS** write tests for new features
2. **ALWAYS** follow TDD (RED-GREEN-REFACTOR)
3. **TARGET**: 80%+ test coverage

---

## 📊 Performance Targets

```yaml
Build:
  - Type check: < 30s
  - Docker build (local): 3-5 min
  - Docker image size: < 200MB

Deployment:
  - Full deployment: < 5 min
  - Health check: Pass within 30s
  - Zero-downtime: REQUIRED

Response Times:
  - API endpoints: < 500ms
  - Database queries: < 100ms
  - Background jobs: 1-2 hours (Inngest)

Code Quality:
  - Test coverage: > 80%
  - Cyclomatic complexity: < 10
  - Code duplication: < 2%
  - Technical Debt Score: < 50
```

---

## 🐛 Common Issues & Solutions

### Issue 1: "Cannot read property 'text' of undefined"

```typescript
// ❌ WRONG
const text = ctx.message.text

// ✅ CORRECT
if (!ctx.message || !('text' in ctx.message)) {
  await ctx.reply('Send a text message')
  return
}
const text = ctx.message.text
```

### Issue 2: "400: Bad Request: query is too old"

```typescript
// ❌ WRONG
myScene.action('button', async ctx => {
  // Some logic
  await ctx.answerCbQuery() // TOO LATE!
})

// ✅ CORRECT
myScene.action('button', async ctx => {
  await ctx.answerCbQuery() // FIRST LINE!
  // Rest of logic
})
```

### Issue 3: Session not initialized

```typescript
// ❌ WRONG (step 2 tries to use wizardData)
async ctx => {
  ctx.session.wizardData.name = 'test' // Error!
}

// ✅ CORRECT (initialize in step 1)
async ctx => {
  ctx.session.wizardData = {
    step: 1,
    name: '',
    // all fields
  }
}
```

### Issue 4: Balance deduction race condition

> ⚠️ **ВНИМАНИЕ (2026-08-29): `deduct_balance` RPC НЕ СУЩЕСТВУЕТ.** Раздел ниже
> показывает целевой паттерн, но в реальности его нет. Grep `src/` на
> `rpc('...deduct...')` пуст; единственный балансовый RPC — read-only
> `get_user_balance`. Баланс — это СУММА леджера `payments_v2`, не колонка,
> поэтому все текущие пути списания (`updateUserBalance`, `directPayment`,
> `processBalanceOperation`) используют именно «❌ WRONG» read-check-write и
> подвержены double-spend при двойном тапе. Пока RPC не создан (миграция — в
> issue), НЕ полагайтесь на атомарность списания: см. **#999**.

```typescript
// ❌ WRONG (race condition) — ЭТО ТО, ЧТО СЕЙЧАС В КОДЕ
const balance = await getBalance(userId)
if (balance >= cost) {
  await deductBalance(userId, cost)
  await generateContent()
}

// ✅ CORRECT (atomic transaction) — ЦЕЛЬ, RPC ещё НЕ создан (#999)
const { data, error } = await supabase.rpc('deduct_balance', {
  p_telegram_id: userId,
  p_amount: cost,
})
if (!error && data) {
  await generateContent()
} else {
  await ctx.reply('Insufficient balance')
}
```

---

## 🎯 Code Patterns & Best Practices

### Pattern 1: Scene Structure

```typescript
import { Scenes } from 'telegraf'
import { MyContext } from '../../types/MyContext'
import { isRussianFromState } from '../../helpers/centralizedLanguage'

const myWizard = new Scenes.WizardScene<MyContext>(
  'myWizard',

  // Step 1: Initialize
  async ctx => {
    const isRu = await isRussianFromState(ctx)

    ctx.session.wizardData = {
      step: 1,
      // Initialize all fields
    }

    await ctx.reply(
      isRu ? 'Привет!' : 'Hello!',
      Markup.inlineKeyboard([
        [Markup.button.callback(isRu ? 'Далее' : 'Next', 'next')],
      ])
    )

    return ctx.wizard.next()
  },

  // Step 2: Process input
  async ctx => {
    if (!ctx.message || !('text' in ctx.message)) {
      await ctx.reply('Send text')
      return
    }

    // Business logic via service
    await myService.process(ctx.message.text)

    return ctx.scene.leave()
  }
)

// Action handlers
myWizard.action('next', async ctx => {
  await ctx.answerCbQuery() // FIRST LINE!

  const isRu = await isRussianFromState(ctx)
  await ctx.reply(isRu ? 'Отлично!' : 'Great!')

  return ctx.wizard.next()
})

export default myWizard
```

### Pattern 2: Service Layer (Business Logic)

```typescript
// src/services/myFeature/myService.ts

import { supabase } from '../supabase/client'
import { logger } from '../../helpers/logger'

export async function processUserRequest(
  telegramId: string,
  input: string
): Promise<{ success: boolean; result?: any }> {
  try {
    // 1. Validate input
    if (!input || input.length === 0) {
      throw new Error('Invalid input')
    }

    // 2. Check balance
    const user = await getUserByTelegramId(telegramId)
    if (user.balance < COST) {
      return { success: false }
    }

    // 3. Deduct balance (atomic)
    const { data, error } = await supabase.rpc('deduct_balance', {
      p_telegram_id: telegramId,
      p_amount: COST,
    })

    if (error || !data) {
      throw new Error('Balance deduction failed')
    }

    // 4. Process (could be Inngest for long operations)
    const result = await aiProvider.generate(input)

    // 5. Save to database
    await saveResult(telegramId, result)

    logger.info('Request processed', { telegramId })

    return { success: true, result }
  } catch (error) {
    logger.error('Process failed', { error, telegramId })

    // Refund if needed
    if (balanceDeducted) {
      await refundBalance(telegramId, COST)
    }

    throw error
  }
}
```

### Pattern 3: Inngest Background Job

```typescript
// src/services/inngest/functions/trainModel.ts

import { inngest } from '../client'

export const trainModel = inngest.createFunction(
  {
    id: 'train-model',
    retries: 3,
    concurrency: {
      limit: 2,
      key: 'event.data.userId',
    },
  },
  { event: 'model/train.requested' },
  async ({ event, step }) => {
    const { userId, modelData } = event.data

    // Step 1: Prepare data (can be retried independently)
    const preparedData = await step.run('prepare-data', async () => {
      return await prepareTrainingData(modelData)
    })

    // Step 2: Train model (1-2 hours)
    const trainedModel = await step.run('train-model', async () => {
      return await replicateClient.trainings.create({
        version: 'model-version',
        input: preparedData,
        webhook: process.env.INNGEST_WEBHOOK_URL,
      })
    })

    // Step 3: Wait for completion (webhook)
    await step.waitForEvent('model/train.completed', {
      timeout: '2h',
      match: 'data.trainingId',
      if: `async.data.trainingId == '${trainedModel.id}'`,
    })

    // Step 4: Save result
    await step.run('save-result', async () => {
      await supabase.from('models').insert({
        user_id: userId,
        model_id: trainedModel.id,
        status: 'completed',
      })
    })

    return { success: true, modelId: trainedModel.id }
  }
)
```

---

## 🎯 Quick Reference Commands

```bash
# Development
npm run dev           # Start dev server
npm run typecheck     # Type check
npm run build         # Build TypeScript

# Deployment (NEW!)
./deploy-local-build.sh   # Full automated deployment

# Monitoring
/check                # Server health
/logs                 # View logs
/user-check [id]      # User diagnostics

# Optimization
/optimize analyze     # Run continuous-optimizer
/optimize autofix     # Auto-fix safe issues

# Release readiness — ОДНА команда вместо CI
bun run verify        # все 13 проверок по КОДАМ ВОЗВРАТА, ~100 с
                      # Нужен, пока GitHub Actions не запускается (биллинг):
                      # последний успешный прогон — 2026-06-02.

# Testing
npm test              # Run tests
npm run test:coverage # Coverage report
```

---

## 🌐 Important URLs

```
Fly.io Dashboard: https://fly.io/dashboard/abbie-connell
Fly.io App: https://fly.io/apps/999-multibots-telegraf
Health Check: https://999-multibots-telegraf.fly.dev/health

Supabase Dashboard: https://supabase.com/dashboard/project/...
Infisical Dashboard: https://app.infisical.com/
Replicate: https://replicate.com/
Inngest: https://app.inngest.com/
```

---

## 📚 Additional Resources

```
Project Rules: CLAUDECODE_RULES.md
Skills Ecosystem: .claude/skills/README.md
Agent Documentation: .claude/agents/README.md

Telegraf Docs: https://telegraf.js.org/
TypeScript: https://www.typescriptlang.org/
Supabase: https://supabase.com/docs
Inngest: https://www.inngest.com/docs
```

---

## 🎭 Working with Claude Code

### For Complex Tasks

1. Start with **master-orchestrator** skill
2. Let it analyze and create execution plan
3. Follow the coordinated workflow
4. Validate each step

### For Specific Tasks

- Creating scene → **telegram-scenes-ULTIMATE**
- Database query → **supabase-database**
- Background job → **inngest-expert**
- AI integration → **ai-pipeline-orchestration**
- Deployment → **devops-automation** agent
- Bug fix → **error-recovery-debugging**

### For Quality Assurance

- **code-reviewer** - Before PR
- **continuous-optimizer** - Daily improvements
- **anti-duplication-guardian** - Prevent duplicates
- **tdd-test-engineer** - Test coverage

---

## 🎓 SKILLS MANAGEMENT - КРИТИЧЕСКИ ВАЖНО!

### ⚠️ ОБЯЗАТЕЛЬНОЕ ПРАВИЛО: Правильное использование Skills

**ПРОБЛЕМА**: Claude AI Agent НЕ ПОНИМАЕТ структуру Skills без явных правил!

**РЕШЕНИЕ**: Следуй этим правилам ВСЕГДА:

### 📁 Правильная структура Skills

**✅ ПРАВИЛЬНО: .claude/skills/**

Skills хранятся ТОЛЬКО в директории `.claude/skills/` в корне проекта:

```
.claude/
└── skills/
    ├── restore-env-from-infisical/
    │   ├── SKILL.md              # Required: название С БОЛЬШОЙ БУКВЫ!
    │   ├── resources/            # Optional: supporting files
    │   └── scripts/              # Optional: helper scripts
    ├── telegram-scene-builder/
    │   └── SKILL.md
    └── ...
```

**❌ НЕПРАВИЛЬНО:**

- ~~`.claude-skills/`~~ - неправильная директория
- ~~`.clinerules-global`~~ - это НЕ место для skills, только для глобальных правил
- ~~`CLAUDE.md`~~ - это документация проекта, не skills
- ~~`skill.md`~~ - lowercase, НЕПРАВИЛЬНО! Должно быть `SKILL.md`

### 📝 Формат SKILL.md

**Обязательные компоненты:**

```markdown
---
name: 'Skill Name'
description: 'When and how to use this skill'
---

# Skill Name

## When to Use This Skill

[Detailed activation triggers]

## Quick Diagnosis

[Fast problem detection]

## Solution Steps

[Step-by-step instructions]

## Common Issues

[Known problems and fixes]

## Related Resources

[Links to docs, scripts, etc.]
```

### 🔧 Когда создавать новый Skill

**Создавай Skill когда:**

1. Решение проблемы требует 5+ шагов
2. Проблема повторяется регулярно
3. Есть чёткие триггеры для активации
4. Требуется специализированное знание

**НЕ создавай Skill для:**

1. Одноразовых задач
2. Простых команд (1-2 шага)
3. Общих правил (используй CLAUDE.md)

### 📚 Существующие Skills

**Production Skills (в `.claude/skills/`):**

- `fix-empty-api-keys/` - Исправление пустых API ключей в payload (ElevenLabs, HeyGen)
- `restore-env-from-infisical/` - Восстановление .env из Infisical
- `telegram-scene-builder/` - Создание Telegram wizards
- `deployment-automation/` - Production deployment
- ... (и другие по мере создания)

### 🚨 Проверка перед коммитом

**ВСЕГДА проверяй:**

```bash
# 1. Правильная структура
ls -la .claude/skills/*/SKILL.md

# 2. Наличие YAML frontmatter
head -5 .claude/skills/*/SKILL.md | grep "^name:"

# 3. Не создал случайно неправильную директорию
ls -d .claude-skills/ 2>/dev/null && echo "❌ НЕПРАВИЛЬНО!"
```

### 💡 Как использовать Skills в работе

**Claude автоматически загружает Skills когда:**

1. Видит триггерные фразы из `description`
2. Контекст задачи совпадает с `When to Use This Skill`
3. Пользователь явно упоминает проблему, описанную в Skill

**Пример активации:**

```
User: "У меня пустые API ключи в запросе"
→ Claude загружает: restore-env-from-infisical
→ Выполняет: Quick Diagnosis
→ Применяет: Solution Steps
```

### 📖 Документация vs Skills

**CLAUDE.md (документация):**

- Общая структура проекта
- Правила разработки
- Deployment процессы
- Архитектурные решения

**Skills (специализированные инструкции):**

- Конкретные проблемы и решения
- Пошаговые инструкции
- Автоматическая активация по триггерам
- Переиспользуемые рецепты

### 🔄 Обновление Skills

**При обнаружении новых паттернов:**

1. Проверь, нужен ли новый Skill или обновление существующего
2. Обнови `SKILL.md` с новыми триггерами/решениями
3. Добавь примеры в `resources/` если нужно
4. Обнови эту секцию в `CLAUDE.md` со списком Skills

### ⚠️ Типичные ошибки

**❌ НЕ ДЕЛАЙ:**

```bash
# Неправильная директория
mkdir .claude-skills/

# Lowercase название
touch SKILL.md → skill.md

# Skills в .clinerules-global
echo "## SKILL:" >> .clinerules-global
```

**✅ ПРАВИЛЬНО:**

```bash
# Создать новый Skill
mkdir -p .claude/skills/my-skill/
cat > .claude/skills/my-skill/SKILL.md <<'EOF'
---
name: "My Skill"
description: "What it does"
---
# My Skill
...
EOF
```

### 🎯 Цель

**100% автоматизации повторяющихся проблем через Skills**

Каждый раз, когда решаешь проблему второй раз → создай Skill!

---

**Last Updated**: 2025-01-12
**Version**: 3.0 (esbuild + Unified Deployment)
**Status**: Production-ready ✅
