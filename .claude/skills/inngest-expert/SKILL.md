---
name: inngest-expert
description: Inngest async workflow patterns, event-driven functions, background job processing, and webhook handling for this Telegram bot project
---

# Inngest Expert Skill

Specialized knowledge for Inngest event-driven background job processing in this project.

## What is Inngest?

**Inngest** is a durable execution engine for running background jobs, workflows, and event-driven functions.

**Key Features:**
- ⏱️ Long-running async operations (hours/days)
- 🔄 Automatic retries with exponential backoff
- 🎯 Event-driven architecture
- 📊 Built-in observability
- 🔀 Concurrency control
- ⚡ Step-based execution with checkpoints

## Project Integration

### Configuration Files
```
src/inngest_app/
├── client.ts                    # Inngest client setup
├── registerFunctions.ts         # Function registration
├── inngest-provider.ts          # Provider configuration
├── render-server-client.ts      # Render server integration
├── send-event.ts               # Event sending helper
└── functions/
    ├── existing/
    │   └── generateModelTrainingFunction.ts
    └── kieAiWebhookMonitor.ts
```

### Environment Variables (from Infisical)
```
INNGEST_EVENT_KEY           # Inngest cloud event key
INNGEST_SIGNING_KEY         # Webhook signature verification
RENDER_INNGEST_EVENT_KEY    # Render server specific
RENDER_INNGEST_SIGNING_KEY  # Render server specific
```

## Core Concepts

### 1. Inngest Client Setup

```typescript
// src/inngest_app/client.ts
import { Inngest } from 'inngest'

export const inngest = new Inngest({
  id: 'vibee-bot-farm',
  name: 'VIBEE Bot Farm',
  eventKey: process.env.INNGEST_EVENT_KEY,
})
```

### 2. Event-Driven Pattern

**Events trigger functions:**
```typescript
// Send event
await inngest.send({
  name: 'model/training.start',
  data: {
    telegram_id: '123456',
    modelName: 'my-model',
    filePath: '/path/to/training-data.zip'
  }
})

// Function listens
inngest.createFunction(
  { id: 'model-training' },
  { event: 'model/training.start' },
  async ({ event }) => {
    // Process training
  }
)
```

### 3. Step-Based Execution

**Steps create checkpoints:**
```typescript
inngest.createFunction(
  { id: 'long-process' },
  { event: 'process.start' },
  async ({ event, step }) => {

    // Step 1: Start training (checkpoint)
    const training = await step.run('start-training', async () => {
      return await startReplicate(event.data)
    })

    // Step 2: Wait for completion (checkpoint)
    const result = await step.run('wait-completion', async () => {
      return await pollReplicateStatus(training.id)
    })

    // Step 3: Notify user (checkpoint)
    await step.run('notify-user', async () => {
      await notifyTelegram(event.data.telegram_id, result)
    })
  }
)
```

**If function fails at Step 2:**
- Steps 1 is NOT re-executed (already checkpointed)
- Only Step 2 and beyond retry
- Saves API calls and time

## Mandatory Development Rules

### Rule 1: ALWAYS Find Similar Function First

**Before creating new function:**
```bash
# Find existing functions
grep -r "inngest.createFunction" ./src --include="*.ts"
grep -r "export.*Function" ./src/inngest_app/functions --include="*.ts"
```

**Copy structure from similar function!**

### Rule 2: Standard Function Structure

```typescript
/**
 * Inngest Function: [Name]
 *
 * [Description of what it does]
 *
 * Flow:
 * 1. Step description
 * 2. Step description
 * 3. Step description
 */

import { inngest } from '../client'
import { logger } from '@/utils/logger'

interface MyEvent {
  name: 'my/event.name'
  data: {
    telegram_id: string
    // other fields
  }
}

export function createMyFunction(inngestClient: any) {
  return inngestClient.createFunction(
    {
      id: 'my-function-id',
      name: 'My Function Name',
      concurrency: [
        {
          limit: 5, // Max concurrent executions
        },
      ],
      retries: 3, // Or 0 for no retries
    },
    { event: 'my/event.name' },
    async ({ event, step }) => {
      const eventData = event.data as MyEvent['data']
      const startTime = Date.now()

      try {
        logger.info('🚀 [MyFunction] Starting', {
          telegram_id: eventData.telegram_id
        })

        // Step 1
        const step1Result = await step.run('step-1-name', async () => {
          // Step logic
          return { success: true }
        })

        // Step 2
        const step2Result = await step.run('step-2-name', async () => {
          // Step logic
          return { success: true }
        })

        const duration = Date.now() - startTime
        logger.info('✅ [MyFunction] Completed', {
          duration,
          telegram_id: eventData.telegram_id
        })

        return {
          success: true,
          duration,
          result: step2Result
        }

      } catch (error) {
        logger.error('❌ [MyFunction] Error', {
          error: error instanceof Error ? error.message : String(error),
          telegram_id: eventData.telegram_id
        })
        throw error
      }
    }
  )
}
```

### Rule 3: Consistent Logging Pattern

```typescript
// ✅ Good: Emoji + [FunctionName] + Action
logger.info('🚀 [ModelTraining] Starting training', { telegram_id })
logger.info('⏳ [ModelTraining] Waiting for completion', { prediction_id })
logger.info('✅ [ModelTraining] Training completed', { model_url })
logger.error('❌ [ModelTraining] Training failed', { error })

// ❌ Bad: Inconsistent formatting
logger.info('Starting...', { data })
console.log('Done')
```

### Rule 4: Error Handling

```typescript
// ✅ Good: Structured error handling
try {
  const result = await step.run('operation', async () => {
    return await riskyOperation()
  })
} catch (error) {
  logger.error('❌ [Function] Operation failed', {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    context: eventData
  })
  throw error // Re-throw for Inngest retry logic
}

// ❌ Bad: Silent failures
try {
  await riskyOperation()
} catch (error) {
  return { success: false } // Looks successful to Inngest!
}
```

### Rule 5: Concurrency Limits

```typescript
// ✅ Good: Reasonable limits based on operation
inngestClient.createFunction(
  {
    concurrency: [
      {
        limit: 2, // Only 2 model trainings at once (expensive)
      },
    ],
  },
  // ...
)

// Training = 2 concurrent (expensive API calls)
// Webhook processing = 10 concurrent (cheap operations)
// Notifications = 20 concurrent (very cheap)
```

## Common Use Cases in This Project

### 1. Model Training (Long-Running)

**Event:** `model/training.start`
**Duration:** 1-2 hours
**Function:** `generateModelTrainingFunction.ts`

```typescript
// User triggers training
await inngest.send({
  name: 'model/training.start',
  data: {
    telegram_id,
    modelName: 'flux-lora-model',
    triggerWord: 'VIBEE_STYLE',
    filePath: '/tmp/training-images.zip',
    steps: 1000,
  }
})

// Inngest function handles:
// 1. Upload ZIP to Replicate
// 2. Start training (1-2 hours)
// 3. Poll for completion
// 4. Save model URL to database
// 5. Notify user in Telegram
```

### 2. Webhook Monitoring

**Event:** `webhook/monitor.start`
**Purpose:** Check webhook health
**Function:** `kieAiWebhookMonitor.ts`

```typescript
// Monitor webhook status
await inngest.send({
  name: 'webhook/monitor.check',
  data: {
    webhook_url: 'https://api.example.com/webhook',
    check_interval: 60000 // 1 minute
  }
})
```

### 3. Async Media Processing

**Pattern for long video generation:**

```typescript
// Step 1: User requests video
await inngest.send({
  name: 'video/generate.start',
  data: {
    telegram_id,
    prompt: 'Beautiful sunset',
    model: 'veo-31',
    duration: 10
  }
})

// Inngest function:
inngest.createFunction(
  { id: 'video-generation' },
  { event: 'video/generate.start' },
  async ({ event, step }) => {

    // Start generation
    const prediction = await step.run('start-generation', async () => {
      return await fal.queue.submit('fal-ai/veo-31', {
        prompt: event.data.prompt
      })
    })

    // Wait for result (5-10 minutes)
    const result = await step.run('wait-result', async () => {
      return await fal.queue.result('fal-ai/veo-31', {
        requestId: prediction.request_id
      })
    })

    // Save to database
    await step.run('save-result', async () => {
      await supabase.from('assets').insert({
        telegram_id: event.data.telegram_id,
        video_url: result.video.url,
        status: 'completed'
      })
    })

    // Notify user
    await step.run('notify-user', async () => {
      await bot.telegram.sendVideo(
        event.data.telegram_id,
        result.video.url,
        { caption: '✅ Your video is ready!' }
      )
    })
  }
)
```

## Function Registration

### Register in `registerFunctions.ts`

```typescript
import { createGenerateModelTrainingFunction } from './functions/existing/generateModelTrainingFunction'
import { createMyNewFunction } from './functions/myNewFunction'

export function registerInngestFunctions(inngestClient: any) {
  return [
    createGenerateModelTrainingFunction(inngestClient),
    createMyNewFunction(inngestClient), // Add new function
  ]
}
```

## Sending Events

### From Telegram Bot
```typescript
import { inngest } from '@/inngest_app/client'

// In scene handler
myScene.action('start-training', async (ctx) => {
  await ctx.reply('⏳ Starting training...')

  await inngest.send({
    name: 'model/training.start',
    data: {
      telegram_id: ctx.from.id.toString(),
      modelName: ctx.session.modelName,
      filePath: ctx.session.zipPath
    }
  })

  await ctx.reply('✅ Training started! You will be notified when complete.')
})
```

### From Webhook
```typescript
// Replicate webhook endpoint
app.post('/api/webhooks/replicate', async (req, res) => {
  const { status, output, id } = req.body

  if (status === 'succeeded') {
    await inngest.send({
      name: 'model/training.complete',
      data: {
        prediction_id: id,
        model_url: output.model,
        status: 'completed'
      }
    })
  }

  res.json({ success: true })
})
```

## Retry Configuration

### Automatic Retries
```typescript
inngest.createFunction(
  {
    retries: 3, // Retry 3 times
  },
  { event: 'my/event' },
  async ({ event }) => {
    // If this fails, Inngest retries automatically
    await unreliableApiCall()
  }
)
```

### Custom Retry Logic
```typescript
await step.run('operation-with-custom-retry', async () => {
  let attempts = 0
  const maxAttempts = 5

  while (attempts < maxAttempts) {
    try {
      return await apiCall()
    } catch (error) {
      attempts++
      if (attempts >= maxAttempts) throw error

      await sleep(1000 * attempts) // Exponential backoff
    }
  }
})
```

## Monitoring & Debugging

### Inngest Dashboard
- View function executions
- See step-by-step progress
- Debug failed runs
- Replay failed functions

### Local Development
```bash
# Run Inngest dev server
npx inngest-cli dev

# Server runs locally with UI at:
# http://localhost:8288
```

### Production Monitoring
```typescript
// Add context to all logs
logger.info('Step completed', {
  step: 'upload-files',
  telegram_id,
  file_count: files.length,
  duration: Date.now() - stepStart
})
```

## Best Practices

### 1. Idempotency
```typescript
// ✅ Check if already processed
const { data: existing } = await supabase
  .from('model_trainings')
  .select('*')
  .eq('training_id', event.data.training_id)
  .single()

if (existing?.status === 'completed') {
  logger.info('Training already completed, skipping')
  return existing
}
```

### 2. Timeouts
```typescript
// ✅ Set reasonable timeouts
const result = await step.run('api-call', async () => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)

  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
})
```

### 3. Progress Updates
```typescript
// ✅ Update user on progress
await step.run('notify-progress', async () => {
  await bot.telegram.sendMessage(
    telegram_id,
    '⏳ Training progress: 50% (500/1000 steps)'
  )
})
```

### 4. Resource Cleanup
```typescript
// ✅ Clean up temp files
await step.run('cleanup', async () => {
  await fs.unlink(event.data.filePath)
  logger.info('Temporary files cleaned up')
})
```

## Common Patterns

### Pattern 1: Poll for Completion
```typescript
const result = await step.run('poll-status', async () => {
  let attempts = 0
  const maxAttempts = 120 // 10 minutes with 5s intervals

  while (attempts < maxAttempts) {
    const status = await checkStatus(predictionId)

    if (status === 'completed') return status
    if (status === 'failed') throw new Error('Prediction failed')

    await step.sleep('5s')
    attempts++
  }

  throw new Error('Timeout waiting for completion')
})
```

### Pattern 2: Batch Processing
```typescript
const results = await step.run('process-batch', async () => {
  const items = event.data.items
  const batchSize = 10
  const results = []

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    const batchResults = await Promise.all(
      batch.map(item => processItem(item))
    )
    results.push(...batchResults)
  }

  return results
})
```

### Pattern 3: Fan-Out
```typescript
// Trigger multiple child functions
await step.run('fan-out', async () => {
  const tasks = event.data.items

  await Promise.all(
    tasks.map(task =>
      inngest.send({
        name: 'task/process',
        data: { task }
      })
    )
  )
})
```

## Critical Rules Summary

1. ✅ **ALWAYS** find similar function first
2. ✅ **ALWAYS** use step.run() for operations
3. ✅ **ALWAYS** log with emojis + [FunctionName]
4. ✅ **ALWAYS** handle errors and re-throw
5. ✅ **ALWAYS** set appropriate concurrency
6. ✅ **ALWAYS** check idempotency
7. ✅ **ALWAYS** register in registerFunctions.ts
8. ✅ **ALWAYS** notify user on completion
9. ✅ **ALWAYS** clean up resources
10. ✅ **NEVER** silent catch without logging

This is the foundation for reliable, maintainable async background processing in this project!
