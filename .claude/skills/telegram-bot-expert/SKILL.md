---
name: telegram-bot-expert
description: Expert in Telegraf framework, Telegram bot architecture, scenes, wizards, and async patterns for this project
---

# Telegram Bot Expert Skill

This skill provides deep knowledge about the specific Telegram bot architecture used in this project.

## Project Architecture

### Technology Stack

- **Framework**: Telegraf 4.16.3
- **Language**: TypeScript
- **Runtime**: Bun
- **Database**: Supabase (PostgreSQL)
- **Secret Management**: Infisical

### Key Patterns

#### 1. Scene-Based Architecture

All user interactions are organized into scenes (`src/scenes/`):

- **BaseScene**: Simple scenes with direct handlers
- **WizardScene**: Multi-step wizards with state management
- **Scene Factory**: Centralized scene registration

Example scene structure:

```typescript
import { Scenes, Markup } from 'telegraf'
import { MyContext } from '../../interfaces'

export const myScene = new Scenes.BaseScene<MyContext>('scene-name')

myScene.enter(async ctx => {
  await ctx.reply(
    'Welcome!',
    Markup.inlineKeyboard([[Markup.button.callback('Option 1', 'action:opt1')]])
  )
})

myScene.action('action:opt1', async ctx => {
  await ctx.answerCbQuery()
  // Handle action
})
```

#### 2. Async/Await Requirements

**CRITICAL**: All Telegraf handlers MUST be async:

- ✅ `async (ctx) => { await ctx.reply(...) }`
- ❌ `(ctx) => { ctx.reply(...) }`

Common mistakes:

- Missing `async` keyword on handlers
- Missing `await` on `ctx.reply()`, `ctx.answerCbQuery()`, `ctx.scene.enter()`
- Scene transitions without await

#### 3. Context Type

Always use `MyContext` from `src/interfaces`:

```typescript
import { Context } from 'telegraf'
import { Update } from 'telegraf/types'

export interface MyContext extends Context {
  session?: {
    // Session data
  }
}
```

#### 4. Scene Registration

Scenes must be registered in:

- `src/scenes/sceneFactory/index.ts` - scene creation
- `src/bot.ts` - bot initialization

#### 5. Command Registration

Commands defined in `src/navigation/registerCommands.ts` and `src/setCommands.ts`

### Project-Specific Patterns

#### Infisical Integration

All secrets loaded via Infisical at startup (see `AI_AGENT_RULES.md`):

- ✅ Use `process.env.VAR_NAME` after infisical loads
- ❌ Never hardcode secrets in .env beyond Infisical config

#### Service Layer

Business logic in `src/services/`:

- AI integrations (OpenAI, Anthropic, Replicate, Fal)
- Media processing pipelines
- User management
- Payment processing

#### Pipeline Architecture

Media processing via pipelines in `src/core/pipeline/`:

- Video pipeline
- Audio pipeline
- Image pipeline
- Face swap pipeline

### Common Issues and Fixes

#### 1. Missing Async/Await

```typescript
// ❌ Wrong
bot.action('callback', ctx => {
  ctx.reply('Done')
})

// ✅ Correct
bot.action('callback', async ctx => {
  await ctx.reply('Done')
})
```

#### 2. Scene Transitions

```typescript
// ❌ Wrong
ctx.scene.enter('new-scene')

// ✅ Correct
await ctx.scene.enter('new-scene')
```

#### 3. Callback Query Handling

```typescript
// ✅ Always answer callback queries
myScene.action('callback', async ctx => {
  await ctx.answerCbQuery() // Important!
  await ctx.reply('Processing...')
})
```

#### 4. Error Handling

```typescript
myScene.on('text', async ctx => {
  try {
    await processUserInput(ctx.message.text)
    await ctx.reply('Success!')
  } catch (error) {
    console.error('Error:', error)
    await ctx.reply('An error occurred. Please try again.')
  }
})
```

### File Structure

```
src/
├── bot.ts                 # Bot initialization
├── index.ts              # Entry point
├── scenes/               # All bot scenes
│   ├── menuScene/
│   ├── lipSyncWizard/
│   └── ...
├── services/             # Business logic
├── core/                 # Core functionality
│   ├── pipeline/        # Media pipelines
│   └── lipsync/         # Lipsync providers
├── commands/            # Bot commands
├── handlers/            # Event handlers
├── interfaces/          # TypeScript types
└── utils/              # Utilities

scripts/
├── deploy.sh           # Production deployment
├── health-monitor.sh   # Health checks
└── logs-monitor.js     # Log monitoring
```

### Deployment

Production deployment to 188.137.250.69 (was 212.86.115.30):

```bash
npm run deploy
# or
./scripts/deploy.sh
```

Uses Docker with automatic rebuild and health monitoring.

### Testing

```bash
bun test              # Run all tests
bun run typecheck     # Type checking
bun run build         # Полная сборка (typecheck + tsc + alias)
```

## Usage Guidelines

When working with this codebase:

1. **Always use async/await** in Telegraf handlers
2. **Follow the scene pattern** for user interactions
3. **Use MyContext type** for proper typing
4. **Load secrets from Infisical**, not .env
5. **Test locally** before deploying to production
6. **Follow existing patterns** in similar scenes
7. **Add proper error handling** with try-catch blocks
8. **Document complex logic** with comments

## Integration Points

- **Supabase**: User data, subscriptions, analytics
- **Infisical**: Secret management
- **Replicate/Fal**: AI model inference
- **OpenAI**: GPT/DALL-E integrations
- **HeyGen**: Avatar generation
- **Inngest**: Background job processing
