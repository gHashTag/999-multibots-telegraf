# CLAUDE.md - Project Context for Claude Code

> **How to work here is in [AGENTS.md](AGENTS.md).** It holds the gates, traps
> and rules that must not be broken. This file describes the PROJECT, that one
> describes the WORK.

## 🎯 Mission: t27 at the centre

**t27 is the central repository. trios is secondary.**

Goal: files are not written by hand but **generated from `.t27` specifications**.
When a person connects their repository, it is scanned for logic that already
exists as a spec; whatever is missing gets a spec, and that spec returns to the
shared bank. This way the same code stops being written twice.

Measured 2026-09-07: **760 specs**, 216 982 lines, five engines --
t27 (575), tri-net (113), trinity-fpga (64), tt-trinity-corona (5), trinity (3).
Health: 522 ok, 235 warn, 3 fail.

The Queen at `t27.ai/#/queen` judges code and keeps the board; her live data is
at `trios-agent-server-production.up.railway.app/queen/*`. In the app this is
the "Hive" tab (`/hive/:tab`, six sub-tabs).

## 📐 .t27 specs -- the default standard

**Owner decision 2026-09-27.** A vertical with numbers and rules is written as a
spec in `gHashTag/t27` FIRST, copied into the host next to the output of
`t27c gen-ts` (`apps/vibee-editor/render/src/spec/`), the host imports the
numbers, and `<id>.test.ts` runs every test of the spec against the code.
`scripts/check-t27-specs.mjs` checks this strictly (pre-commit, `bun run verify`,
render tests); unbound specs of the repo are debt in `scripts/t27-specs.json`,
and that list only shrinks. Recipe, laws and traps -- the skill
**`t27-spec-first`**.

**Owner, 2026-10-07: «все пишем на .t27» ("we write everything in
.t27").** Every number, threshold and rule -- not only money but also the screen
(widths, order, what collapses) -- is a spec first. Every skill carries the
section «Пишем на .t27» ("We write in .t27", a pointer to `t27-spec-first`); a
skill without it turns the test
`src/__tests__/tools/everySkillPointsToT27.test.ts` red.

**Owner, 2026-10-09: «на .t27 логику писать и никак иначе» ("write
logic in .t27 and no other way"), «запрети писать в боте новую логику на других
языках» ("forbid writing new logic in the bot in other languages").** A spec's
rule is executed from the spec: `node scripts/t27-logic.mjs <t27> <kind/id> --out=<dir>`
compiles `fn` to WASM and writes `<id>.logic.ts`; the host imports from there. A
new predicate function or threshold in `src/`/`render/src/` does not pass
pre-commit (`t27-only`), a hand copy of `fn` breaks the law `mirror`, a spec
without logic breaks `logic-required` (old debt is the list `mirrored`, which
only shrinks).

## 🌐 Language

**Code in English, conversation in Russian.** Identifiers and comments are
English (checked by `scripts/no-cyrillic-guard.cjs` on every commit); Cyrillic
is allowed inside string literals and with the marker `cyrillic-ok`. Interface
text goes only through the dictionary `player/src/atoms/language.ts`.
**English by default**: `getInitialLanguage` returns `'en'` unless the browser
asks for Russian.

**Skills and documents are written in English (owner, 2026-10-11); the
conversation with the owner stays Russian.**

## 🛡️ Commit gates

`lefthook run pre-commit`: secrets, prettier, eslint, tsc, no-cyrillic,
check:player-types. **Until 2026-09-07 they did not run at all** --
`core.hooksPath` pointed to `.husky`, and husky printed "All checks passed"
(in Russian) after running one check out of five. Fixed; see AGENTS.md
§3.

⚠️ Running `npx lefthook run pre-commit` by hand **loses uncommitted work**.
Commit first, then hooks.

## 🚨 CRITICAL NAVIGATION RULE - SINGLE SOURCE OF TRUTH

**The ONLY source of truth for navigation: `/src/navigation/`**

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

## 💰 CRITICAL MONEY RULE — ONE WALLET

**Owner decision 2026-09-20. The only live wallet: `user_tokens` in the render
Postgres (`getPool()`). Rate: 1 star = 1 token.**

```
✅ CREDIT AND DEBIT        user_tokens  (+ star_payments)  — render Postgres
🧊 ARCHIVE, READ ONLY      payments_v2                     — cloud Supabase
```

- **Do NOT write new rows to `payments_v2`.** Deleting it is ALSO FORBIDDEN: it
  is the only record of real money; refunds and disputes are still possible.
- Balance migration: `min(actually paid, current balance)`. Admin grants are not migrated.
- Until `src/core/supabase/*` is moved to `user_tokens`, both wallets are alive
  -- crediting "the wrong wallet" remains a real trap.

Full analysis, formula, bottleneck and the mandatory order of steps:
**`docs/architecture/single-wallet-decision.md`**

---

## 💳 MONETISATION — the club and tokens

**Owner decision, confirmed 2026-09-22.** There is ONE subscription -- **the
club: 10 000 stars for 30 days** (a Telegram Stars subscription), 30% of every
charge comes back as tokens. Everything else is **tokens, 1 star = 1 token**,
the live wallet `user_tokens`.

- **NEUROVIDEO, NEUROPHOTO, NEUROTESTER, NEUROBLOGGER, NEUROBASE no longer
  exist.** They remain only as history in the `payments_v2` archive. Do not
  grant them and do not check them as access.
- **Free club access:** bot owners and keepers (computed), and the **guest
  pass** -- `CLUB_GUESTS` on the `vibee-render` service (names and ids
  comma-separated, edited without a deploy). Access is granted by the pass, not
  by a "subscription" row.
- The source of truth is the code: `render/src/agent/club-membership.ts`,
  `club-guests.ts`.

---

## 🌍 SUPER-FEATURE: a browser for every client, and the agent drives it

**Owner decision 2026-09-21.** Every person has **their own real browser** on
the server: their profile, their account sign-ins, their cookies. The person
watches it in the app (the "Browser" tab, globe icon) and can take the wheel at
any moment. The agent drives **the very same** browser -- not a copy, not a
headless twin.

**One browser, two pilots.** This is not a metaphor but the property security
rests on: every agent press is visible to the person, and the person can step in
mid-work. There is no invisible mode and there will not be one.

### The agent owns ALL browser tools

Eleven tools in the shared `TOOLS` registry -- the same registry exposed over
`/mcp`, so an agent connected yesterday sees them today:

```
browser_status  browser_open  browser_read  browser_screenshot
browser_click   browser_type  browser_evaluate  browser_close_tab
browser_ask_permission  browser_ask_input  browser_logins
```

`browser_logins` (#2962) -- which networks the person's browser is already
signed into: by the NAMES of sign-in cookies (`auth_token` for X, `li_at` for
LinkedIn…); values are dropped in the first step, only the network and state go
out. It does not open a page and does not touch the wheel. A network whose
sign-in cookie we do not know is `unknown`, not "not signed in". The only
browser tool missing from the compact set (`COMPACT_HIDDEN`): it is a question
for the owner connecting a clone, not for a DM conversation.

`browser_ask_input` -- the agent hit a password, code or email field: it puts
the cursor there and asks the person. The person gets an input panel with the
agent's words (and a button in Telegram); the person types it themselves through
their own door `/api/browser/type`; the agent learns only "N characters entered
into a field of such-and-such type" and continues in the same turn (waits up to
120 s).

**They are also in the compact set** (`COMPACT_TOOLS` in `src/agent/tools.ts`)
-- so even a model with a 16k window sees them. This cost raising the schema
budget from 6000 to 7000 tokens, and the price is stated plainly: in a 16k
window with a ~5k prompt about 4k is left for the conversation. An agent that
cannot open the browser cannot do the main thing all this exists for.

### Rules that must not be broken

1. **The person enters passwords THEMSELVES.** Two paths, both by their hands
   only: in the stream itself or through the "⌨ Enter text"
   field in the app (`POST /api/browser/type`,
   `render/src/browser/person-type.ts`, owner decision 2026-09-22: signing in
   through the video stream on a phone was nearly impossible). The second path
   is a door for the person ONLY (agent key -- 403), the text lives in one
   request: not in the journal, not in the log, not in an error; before sending,
   the app shows which field on which site it will go to. Never ask for a
   password in chat and never type it with `browser_type`.
2. **The guard is by PLACE, not by action.** On a bank, mail or payment page, a
   press, typing and code execution require permission granted by the person
   within the last 5 minutes (`src/browser/guard.ts`). A click is a point on the
   screen; from outside the page you cannot tell whether it says "Next" or
   "Send 120 000".
3. **An unreadable address counts as sensitive.** "We do not know where we are"
   must not be an answer that permits acting.
4. **One pod per person** -- `telegram_id` is the primary key in
   `browser_sessions`. The safety of releasing the profile lock rests on this.
5. **Do not publish CDP outside.** Whoever reaches CDP reads all cookies and
   acts as the person. Port 9222 listens only on loopback inside the pod.
6. **Close ≠ forget.** `DELETE /api/browser/session` shuts the pod down and
   KEEPS the sign-ins; `DELETE /api/browser/profile` wipes the profile. These
   two doors must not be merged. The profile lives on a Railway volume --
   without the volume every pod redeploy wiped all sign-ins.
7. **Bulk transfer of sign-ins -- two roads, and the difference between them is
   the point.** Passwords -- only through a password manager INSIDE the pod
   (Bitwarden), which the person unlocks themselves in the window: bypassing us.
   Cookies -- as an export file via `POST /api/browser/cookies`: only the person
   themselves (agent key -- refused), we store nothing and log nothing, the
   response has sites and counters, not values. The Chromium password store is
   off: without a keyring anyone driving the browser could read it. The agent
   does not open `chrome://`, `chrome-extension://`, `devtools://`
   (`agentMayOpen` in `guard.ts`).

### Where things live

```
apps/vibee-editor/render/src/browser/   broker, /live/ proxy, guard, window shell
apps/vibee-editor/player/src/pages/Browser.tsx   tab in the app
deployment/remote-browser/              pod image (neko + Chromium + CDP bridge)
docs/architecture/remote-browser-per-user.md   full analysis, 33 sections
.claude/skills/remote-browser/SKILL.md  recipe: bring up, check, repair
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

Multi-bot platform for generating AI content (video, images, music, LipSync):

- 43+ Telegram scenes (wizards)
- 10+ AI providers with failover
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

### 3. Deploy (Railway)

```bash
# Railway project: 999. Bot service: 999-multibots-telegraf.
# Deploy happens BY ITSELF on merge to main — nothing needs to be run by hand.

railway link                                  # once
railway service 999-multibots-telegraf        # bind the service

railway deployment list                       # state of the latest builds
railway logs                                  # service logs
railway variables --kv                        # variable names and values
railway variables --set KEY=VALUE             # set a variable
```

**About fly.io.** The section with `flyctl` commands and a token lived here out
of inertia. Checked 2026-08-23: `https://999-multibots-telegraf.fly.dev/health`
does not answer at all (code 000, the connection is not established), and the
working deploys go to Railway. The instructions led to a dead platform, so they
were removed.

**Tokens are no longer stored in this file.** It used to hold `FLY_API_TOKEN`,
`INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` in plain text. The file is tracked
by git and goes into the repository with the code -- a value in it is as good as
published. A secret is taken from Railway or Infisical:

```bash
railway variables --kv | grep '^NAME='        # value from the service environment
infisical secrets get NAME                    # value from Infisical
```

### 4. Secret Management (Infisical)

```bash
# RULE: Only 5 variables in .env (local)
# All other secrets MUST be in Infisical

# 🚨 RULE: key values are NOT stored in documentation and are not pasted
# into repository files. Read them from Railway (`railway variables --kv`)
# or Infisical (`infisical secrets get NAME`). A value that lands in a
# tracked file has to be REVOKED, not deleted.

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

> ⚠️ **WARNING (2026-08-29): the `deduct_balance` RPC DOES NOT EXIST.** The
> section below shows the target pattern, but in reality it is not there. A grep
> of `src/` for `rpc('...deduct...')` is empty; the only balance RPC is the
> read-only `get_user_balance`. The balance is the SUM of the `payments_v2`
> ledger, not a column, so all current debit paths (`updateUserBalance`,
> `directPayment`, `processBalanceOperation`) use exactly the "❌ WRONG"
> read-check-write and are exposed to double-spend on a double tap. Until the RPC
> is created (the migration is in an issue), do NOT rely on atomic debits: see
> **#999**.

```typescript
// ❌ WRONG (race condition) — THIS IS WHAT THE CODE DOES NOW
const balance = await getBalance(userId)
if (balance >= cost) {
  await deductBalance(userId, cost)
  await generateContent()
}

// ✅ CORRECT (atomic transaction) — THE GOAL, RPC NOT created yet (#999)
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

# Release readiness — ONE command instead of CI
bun run verify        # all 16 checks by EXIT CODES, ~100 s + ~2 min
                      # of phone shots (tri shot all: every stand in
                      # Chromium at 390 ru/en and 320 ru; "not measured" = FAIL)
                      # Needed while GitHub Actions does not run (billing):
                      # last successful run — 2026-06-02.
                      # Since 2026-10-09 Railway checks every PR: the
                      # ci-bridge service sends its code to check-runner and
                      # sets the railway/checks status (deployment/ci-bridge).
                      # GitHub workflows wait for the variable CI_ENABLED=true.

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

## 🎓 SKILLS MANAGEMENT - CRITICALLY IMPORTANT!

### ⚠️ MANDATORY RULE: Using Skills correctly

**PROBLEM**: Claude AI Agent DOES NOT UNDERSTAND the Skills structure without explicit rules!

**SOLUTION**: Follow these rules ALWAYS:

### 📁 Correct Skills structure

**✅ CORRECT: .claude/skills/**

Skills live ONLY in the `.claude/skills/` directory at the project root:

```
.claude/
└── skills/
    ├── restore-env-from-infisical/
    │   ├── SKILL.md              # Required: name IN CAPITAL LETTERS!
    │   ├── resources/            # Optional: supporting files
    │   └── scripts/              # Optional: helper scripts
    ├── telegram-scene-builder/
    │   └── SKILL.md
    └── ...
```

**❌ WRONG:**

- ~~`.claude-skills/`~~ - wrong directory
- ~~`.clinerules-global`~~ - this is NOT a place for skills, only for global rules
- ~~`CLAUDE.md`~~ - this is project documentation, not skills
- ~~`skill.md`~~ - lowercase, WRONG! Must be `SKILL.md`

### 📝 SKILL.md format

**Required components:**

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

### 🔧 When to create a new Skill

**Create a Skill when:**

1. Solving the problem takes 5+ steps
2. The problem recurs regularly
3. There are clear activation triggers
4. Specialised knowledge is required

**Do NOT create a Skill for:**

1. One-off tasks
2. Simple commands (1-2 steps)
3. General rules (use CLAUDE.md)

### 📚 Existing Skills

**Production Skills (in `.claude/skills/`):**

- `fix-empty-api-keys/` - Fixing empty API keys in the payload (ElevenLabs, HeyGen)
- `restore-env-from-infisical/` - Restoring .env from Infisical
- `t27-model-training/` - What can be trained for t27: why LoRA and not from scratch,
  why not on Railway (no GPU), and the builder of the IGLA CODER paired corpus
- `telegram-scene-builder/` - Creating Telegram wizards
- `deployment-automation/` - Production deployment
- `buttons-by-substance/` - Buttons BY THE SUBSTANCE of the answer, not under every message (owner decision 2026-09-24, by analogy with the browser guard); `act:*` handlers, the pay row
- `business-dm-buttons/` - Buttons in the business DM (on behalf of the owner), marker cleanup, chunking
- `owner-two-tap-onboarding/` - Connecting a new owner to the personal seller
- `client-first-tap/` - A new client reaches a result in one or two taps
- `two-tap-topup/` - Payment in two taps, two cash desks, honestly
- `remote-browser/` - A browser of their own for each client: pod, broker, `/live/` proxy, profile, shutdown, tab and notification in the bot
- `job-agent/` - The "Job" agent: a map of the whole job search (hunters, hh/LinkedIn/Upwork, groups) and the owner's Zoho mail (`mail_*`, the agent-mail-mcp port, a letter goes out only on a press)
- `fast-sign-in/` - The agent signs into the person's accounts: "Sign in with Google" by its label, all sign-in cases, checking through `tri a2a`
- `tri/` - `/tri` -- one brain: the general splits work into orders for bees (gHashTag/t27) and subagents, accepts results by running them, and the rainbow bridge checks features from both sides (human <-> human, agents between)
- `bee-delegation/` - Delegate work to the Queen's bees: only gHashTag/t27, four-section issues, reading skip reasons
- `vip-client-care/` - Keep a VIP client under control: one tracker, verified statuses, one yes/no list, nothing to prod without the client's yes
- `three-options-at-the-end/` - How to end a report: three options to continue with a recommendation, not the question "what next?"
- `lipsync-cost-per-second/` - Cost of a lipsync second for each model, our price in tokens, status as of the measurement date and the update procedure (owner's metric)
- `cloud-agent-does-the-work/` - Reels, lipsync, glamour, posts are made by the service's cloud agent with its own tools; not local scripts and not one-off Railway functions; whatever the agent cannot do -- give it a tool
- `kie-only/` - Kie is THE provider (owner, 2026-10-03): never suggest or probe Replicate, fal, MiniMax or ElevenLabs; exact Kie models; Kie has NO speech cloning; the owner's face is studio-lab, his reels speak his GENERATED voice
- `zai-free-flash/` - z.ai flash models are FREE (owner, 2026-10-04): every z.ai default is `glm-4.7-flash`, fallback `glm-4.5-flash`; paid glm-5.3 answers 1113 on our key; Railway `GLM_MODEL`/`AGENT_MODEL` override the code
- `owner-noir-reel/` - The owner's signature noir reel: starts from a photo with the real face, lipsync in the owner's voice, no captions, the ▽ mark apex down (brand canon); the agent makes it: `image_edit` → `lipsync_generate` with `model: kie/kling/ai-avatar-standard` (owner's choice, the whole voice up to 30 s in one pass); the StoryReel story reel -- a new set in every scene, the bot in speech is "Trinity"
- `story-reel-gift/` - Lead magnet No. 2 for every client: a story reel about their business from their data -- their photo, their words, THEIR voice from voice messages in the DM (`crm_voice_clone`, $3 = 1200 tokens once; **without a clone** -- their real voice messages cut at pauses, lipsync on Kie, ~218 tokens, spec v4), up to 15 s; the whole reel in ONE call to `story_reel` (a permanent template, a 3 s pause with a call to action at the end), delivered as a `tg_send_video gift` card; **a template in the CRM** for any client with a voice and an avatar, any topic: the "🎬 Story reel" panel in the card, `crm_story_reel`, the client on their own -- `t.me/<bot>?start=reel` or their own page "My reels" `?start=app_story` (~270 tokens per reel, cost ≈ $0.64); **plan card → reel in one tap** (spec `plan-reel.t27`: exactly this card, the first reel from the plan is a 1-scene trial, a t27 course into the plan -- `plan_course_add`, a lesson at the end of the reel, reel previews in the cabinet)
- `link-previews/` - t27.ai link previews broke again and again (2026-10-08): a `#/` address is the home page for a crawler, an image under the same address stays in the X/Telegram cache, two writers of one site (trinity and the apex `ghashtag.github.io`); which addresses to give (`t27.ai/learn/`, `learn/<lesson>/`, `blog/<slug>/`), who guards (`og-preview-contract`, `build-og.py` stamps `?v=<hash>`, `plan-reel` v2)
- `agent-hive/` - The agent hive: @t27ai_bot manages one bot per catalogue agent, a forum topic each; /agents, /hive, chain laws (person's name, depth 3, cooldown), owner steps the API cannot do, test recipe
- `t27-spec-first/` - .t27 specs are the default standard: spec first, a copy in the host with `t27c gen-ts`, numbers imported, a test runs the spec's vectors against the code; strict check `scripts/check-t27-specs.mjs` and a ratchet on unbound specs
- `links-open-in-telegram/` - Links to the app open INSIDE Telegram: `appLinkFor(bot, route)` → `t.me/<bot>?start=app_<route>` (or `?startapp=` with a Main Mini App), in a DM -- a `web_app` button; never send a person a bare `app.t27.ai`
- `phone-shot/` - The screen on a PHONE, not in jsdom: `tri shot <stand>` -- the real component in Chromium 390 px with a finger, answers from host functions, shots and measurement (the page's `--touch-target` goal, sideways shift, clipping, overlaps); how to add a stand; the trap: `fullPage` turns the finger off
- `crm-profit-loop/` - The "CRM → profit" loop: a map of the funnel's weak spots with statuses, the gap to competitors, the rule "who paid reads the live wallet `token_ledger`, not the `payments_v2` archive" (`tri paid-sources`), an unpaid invoice is a question, not a new invoice
- `voice-mode/` - Voice mode in the app chat (the `VoiceDock` strip INSIDE the chat, the conversation is visible, typed text is answered by voice; full screen -- optional): code map, how barge-in works (a pause → "uh-huh" / echo / noise continue, words -- a new question), cards are named at the end, the playback watchdog, measurements `tri голос` (ru is heard after 4.6 s -- the main wait), a table of weak spots with statuses, the order of handing over a loop `tri виток`, a fan is the room, not speech (`tri vad`; phone -- `tri vad --ios`, hands-free conversation by a long press), a long wait is spoken aloud ("Let me look.", `tri filler`), a phrase ending in "and…" is not cut off -- the words decide the end of a turn (`tri ход`)
- `owner-studio/` - The STUDIO step before a talking reel: one real photo -> a photorealistic frame in a ready studio (noir, lab, broadcast) on Kie gpt-image-2-5; prompts only in the spec `owner-studio.t27`; the frame becomes the face for lipsync
- `split-reel` (spec `render/src/spec/split-reel.t27`) - A split reel like someone else's example: full 60, then split 120 + full 45, yellow word-by-word captions; `reel_analyze` takes apart someone else's reel (ffmpeg, whisper, our own vision) and returns a SplitTalkingHead template by the spec
- `bot-chat-order/` - Order in the bot's DM: tabs are named after agents, ONE agent memory for the bot and the mini app (the "Agent" tab and any thread outside tabs is the shared conversation `self`, other tabs are `tab<kind>`), a pressed menu goes away instead of piling up (specs `bot-topic-tabs`, `bot-menu-press`, `bot-agent-memory`)
- ... (and others as they are created)

### 🚨 Check before commit

**ALWAYS check:**

```bash
# 1. Correct structure
ls -la .claude/skills/*/SKILL.md

# 2. YAML frontmatter present
head -5 .claude/skills/*/SKILL.md | grep "^name:"

# 3. Did not accidentally create the wrong directory
ls -d .claude-skills/ 2>/dev/null && echo "❌ WRONG!"
```

### 💡 How to use Skills at work

**Claude loads Skills automatically when it:**

1. Sees trigger phrases from `description`
2. The task context matches `When to Use This Skill`
3. The user explicitly mentions a problem described in the Skill

**Activation example:**

```
User: "I have empty API keys in the request"
→ Claude loads: restore-env-from-infisical
→ Runs: Quick Diagnosis
→ Applies: Solution Steps
```

### 📖 Documentation vs Skills

**CLAUDE.md (documentation):**

- Overall project structure
- Development rules
- Deployment processes
- Architecture decisions

**Skills (specialised instructions):**

- Concrete problems and solutions
- Step-by-step instructions
- Automatic activation by triggers
- Reusable recipes

### 🔄 Updating Skills

**When new patterns are found:**

1. Check whether a new Skill or an update of an existing one is needed
2. Update `SKILL.md` with new triggers/solutions
3. Add examples to `resources/` if needed
4. Update this section in `CLAUDE.md` with the list of Skills

### ⚠️ Common mistakes

**❌ DO NOT:**

```bash
# Wrong directory
mkdir .claude-skills/

# Lowercase name
touch SKILL.md → skill.md

# Skills in .clinerules-global
echo "## SKILL:" >> .clinerules-global
```

**✅ CORRECT:**

```bash
# Create a new Skill
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

### 🎯 Goal

**100% automation of recurring problems through Skills**

Every time you solve a problem a second time → create a Skill!

---

**Last Updated**: 2025-01-12
**Version**: 3.0 (esbuild + Unified Deployment)
**Status**: Production-ready ✅

## Own language first

When this project publishes something about itself, it publishes in **this
project's own language and format** -- not translated into somebody else's.

Owner's rule, 2026-09-20: stop writing in other people's languages, we have our
own.

This bites on any file whose only reason to exist is that an outside tool
expects that shape: `llms.txt`, `agents.json`, `ai.txt`, `.well-known/*.json`,
A2A agent cards, `ai-plugin` manifests, OpenAPI stubs, JSON-LD blocks, a README
that restates a spec. The reflex is to write four of them in four foreign
formats, and the reflex is wrong: a project whose claim is "here is a language
worth writing" and which then describes itself in three of other people's
formats has published three documents that are not true of it.

**The move:** find the address the outside world already fetches, then serve our
own language at it. `/llms.txt` at t27.ai **is** a t27 module -- `llms.txt`
requires nothing but text, and every prose line of a `.t27` file is a `;`
comment, so it stays readable to anything that cannot compile it.

**Three qualifications, so the rule stays honest:**

- A format a resolver genuinely parses -- a sitemap, `package.json`, a lockfile
  -- is machinery, not a description. **Generate** it from our own source; never
  hand-write it into a second home for the truth.
- Code against someone else's API uses their types. Prose for a human who has
  never heard of the project uses that human's language.
- If a format demands a claim we cannot back, **publish nothing**. An A2A card
  with no A2A server behind it is a false claim, and a missing file is more
  honest than a lying one.

The test: _is this file the project speaking about itself?_ If yes, it speaks
our language. If it is plumbing, it speaks the plumbing's.

**Worked example, compiler-checked rather than asserted:** in `gHashTag/trinity`,
`apps/website/public/t27/files/specs/catalog/onboarding.t27` generates
`/llms.txt` and `/agents.t27` byte-identically, gated in CI as
`check:onboarding`. The generator evaluates the spec's own `test` blocks --
`typecheck.ok` stays true for `assert 1 > 2`, so a compiler saying "this parses"
is not a compiler saying "this is true" -- and re-compiles the rendered document
before writing it.

**The full rule lives in exactly one place: the `own-language-first` skill**
(`~/.claude/skills/own-language-first/SKILL.md`). It carries the consent gate for
documents addressed to other people's agents, the six negative controls, and the
`;`-alone-on-a-line trap that silently discards a `module` declaration. This
section is a pointer, not a copy -- the recorded defect in this codebase family
is the hand-copied rule that only two of its three homes knew about.
