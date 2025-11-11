---
name: telegram-scenes-master
description: Complete mastery of Telegraf Scenes and Wizards - all patterns, anti-patterns, session management, validation with Zod, and production-proven solutions from 50+ scenes
---

# Telegram Scenes Master Skill

Ultimate expertise in Telegraf Scene-based architecture with all production patterns from this project.

## Scene Architecture Overview

**This project has 50+ scenes!** Each follows specific patterns:
- BaseScene for simple flows
- WizardScene for multi-step processes
- Composer for modular reusable handlers
- Session state management
- Zod validation for inputs
- Centralized language handling

## Two Scene Types

### 1. BaseScene - Simple Interactions

**Use when**: Single-step or simple multi-action flows

```typescript
import { Scenes, Markup } from 'telegraf'
import { MyContext } from '@/interfaces'

export const myScene = new Scenes.BaseScene<MyContext>('scene-id')

// Enter handler - always first
myScene.enter(async (ctx) => {
  await ctx.reply('Welcome!',
    Markup.inlineKeyboard([
      [Markup.button.callback('Option 1', 'opt1')],
      [Markup.button.callback('Option 2', 'opt2')],
      [Markup.button.callback('🔙 Back', 'back')]
    ])
  )
})

// Action handlers
myScene.action('opt1', async (ctx) => {
  await ctx.answerCbQuery() // ALWAYS answer!
  await ctx.reply('You selected option 1')
  // Process...
})

myScene.action('back', async (ctx) => {
  await ctx.answerCbQuery()
  await ctx.scene.leave() // Exit scene
})

// Text handler
myScene.on('text', async (ctx) => {
  const userInput = ctx.message.text
  // Process input...
})

export default myScene
```

### 2. WizardScene - Multi-Step Flows

**Use when**: Sequential user input needed (forms, configurations)

```typescript
import { Scenes, Markup } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'

export const myWizard = new Scenes.WizardScene<MyContext>(
  'wizard-id',

  // STEP 1: Initial prompt
  async (ctx) => {
    const isRu = isRussianFromState(ctx)

    // Initialize session
    ctx.session.wizardData = {
      step: 1,
      startTime: Date.now()
    }

    await ctx.reply(
      isRu ? 'Шаг 1: Отправьте видео' : 'Step 1: Send a video',
      Markup.inlineKeyboard([
        [Markup.button.callback(isRu ? 'Отмена' : 'Cancel', 'cancel')]
      ])
    )

    return ctx.wizard.next() // Move to step 2
  },

  // STEP 2: Handle input from step 1
  async (ctx) => {
    const isRu = isRussianFromState(ctx)

    // Check for cancel
    if (ctx.callbackQuery?.data === 'cancel') {
      await ctx.answerCbQuery()
      await ctx.reply(isRu ? '❌ Отменено' : '❌ Cancelled')
      return ctx.scene.leave()
    }

    // Validate input
    if (!ctx.message || !('video' in ctx.message)) {
      await ctx.reply(
        isRu ? '❌ Отправьте видео' : '❌ Send a video'
      )
      return // Stay on same step
    }

    // Save to session
    ctx.session.wizardData.videoFileId = ctx.message.video.file_id

    await ctx.reply(
      isRu ? 'Шаг 2: Отправьте аудио' : 'Step 2: Send audio'
    )

    return ctx.wizard.next() // Move to step 3
  },

  // STEP 3: Handle input from step 2 and process
  async (ctx) => {
    const isRu = isRussianFromState(ctx)

    // Validate audio
    if (!ctx.message || !('audio' in ctx.message)) {
      await ctx.reply(
        isRu ? '❌ Отправьте аудио' : '❌ Send audio'
      )
      return
    }

    // Save audio
    ctx.session.wizardData.audioFileId = ctx.message.audio.file_id

    // Process with both video and audio from session
    await ctx.reply('⏳ Processing...')

    try {
      const result = await processLipSync({
        videoFileId: ctx.session.wizardData.videoFileId,
        audioFileId: ctx.session.wizardData.audioFileId
      })

      await ctx.reply('✅ Done!')
      await ctx.replyWithVideo(result.videoUrl)

    } catch (error) {
      console.error('Processing error:', error)
      await ctx.reply(
        isRu ? '❌ Ошибка обработки' : '❌ Processing error'
      )
    }

    return ctx.scene.leave() // Exit wizard
  }
)

export default myWizard
```

## Critical Patterns from Production

### Pattern 1: Always Answer Callback Queries

```typescript
// ✅ ALWAYS - первая строка в action handler
myScene.action('button', async (ctx) => {
  await ctx.answerCbQuery() // Убирает "loading" анимацию

  // Rest of logic...
})

// ❌ ЗАБЫЛИ - кнопка висит с loading анимацией
myScene.action('button', async (ctx) => {
  await ctx.reply('Processing...')
  // Telegram показывает "loading" бесконечно!
})
```

### Pattern 2: Centralized Language Detection

```typescript
import { isRussianFromState } from '@/helpers/centralizedLanguage'

myScene.enter(async (ctx) => {
  const isRu = isRussianFromState(ctx) // Всегда первая строка!

  await ctx.reply(
    isRu ? 'Привет! Выберите действие:' : 'Hello! Select action:',
    Markup.inlineKeyboard([
      [Markup.button.callback(isRu ? 'Вперёд' : 'Continue', 'continue')],
      [Markup.button.callback(isRu ? 'Отмена' : 'Cancel', 'cancel')]
    ])
  )
})

// ❌ НЕПРАВИЛЬНО - разные способы определения языка
myScene.enter(async (ctx) => {
  const lang = ctx.session.language // Inconsistent!
  const isRu = ctx.from?.language_code === 'ru' // Wrong source!
})
```

### Pattern 3: Session State Management

```typescript
// ✅ ПРАВИЛЬНО - инициализация session в step 1
myWizard = new Scenes.WizardScene<MyContext>(
  'my-wizard',
  async (ctx) => {
    // Initialize clean state
    ctx.session.wizardData = {
      step: 1,
      videoUrl: null,
      audioUrl: null,
      selectedModel: null,
      cost: 0,
      startTime: Date.now()
    }

    await ctx.reply('Step 1...')
    return ctx.wizard.next()
  },

  async (ctx) => {
    // Use session data
    ctx.session.wizardData.videoUrl = getVideoUrl(ctx)
    ctx.session.wizardData.step = 2

    return ctx.wizard.next()
  }
)

// ❌ НЕПРАВИЛЬНО - не инициализирован session
myWizard = new Scenes.WizardScene<MyContext>(
  'my-wizard',
  async (ctx) => {
    await ctx.reply('Step 1...')
    return ctx.wizard.next()
  },

  async (ctx) => {
    ctx.session.videoUrl = ... // TypeError: Cannot set property of undefined!
  }
)
```

### Pattern 4: Zod Validation (Modern Pattern)

```typescript
import { z } from 'zod'

// Define schema
const VideoInputSchema = z.object({
  fileId: z.string().min(1),
  fileSize: z.number().max(20_000_000), // 20MB
  duration: z.number().min(1).max(60) // 1-60 seconds
})

// Use in handler
myWizard = new Scenes.WizardScene<MyContext>(
  'video-wizard',
  async (ctx) => {
    await ctx.reply('Send video (max 20MB, 60 seconds)')
    return ctx.wizard.next()
  },

  async (ctx) => {
    const isRu = isRussianFromState(ctx)

    if (!ctx.message || !('video' in ctx.message)) {
      await ctx.reply(isRu ? '❌ Отправьте видео' : '❌ Send a video')
      return
    }

    const video = ctx.message.video

    // Validate with Zod
    const result = VideoInputSchema.safeParse({
      fileId: video.file_id,
      fileSize: video.file_size,
      duration: video.duration
    })

    if (!result.success) {
      const errors = result.error.errors.map(e => e.message).join('\n')
      await ctx.reply(
        isRu
          ? `❌ Ошибка валидации:\n${errors}`
          : `❌ Validation error:\n${errors}`
      )
      return // Stay on step, wait for correct input
    }

    // Validated data
    ctx.session.videoData = result.data
    await ctx.reply('✅ Video validated!')

    return ctx.wizard.next()
  }
)
```

### Pattern 5: Admin-Only Scenes

```typescript
import { isValidAdmin } from '@/interfaces/zod/lipsync.zod'

const adminIds = process.env.ADMIN_IDS?.split(',') || []

function isUserAdmin(telegramId: string): boolean {
  return isValidAdmin(telegramId, adminIds)
}

myScene.enter(async (ctx) => {
  const isRu = isRussianFromState(ctx)
  const telegramId = ctx.from?.id?.toString()

  // Check admin rights
  if (!telegramId || !isUserAdmin(telegramId)) {
    await ctx.reply(
      isRu
        ? '🔒 Функция доступна только администраторам'
        : '🔒 Feature is admin-only'
    )
    return ctx.scene.leave()
  }

  // Continue for admins...
  await ctx.reply('🔓 Admin access granted')
})
```

### Pattern 6: Balance Checking

```typescript
import { getUserBalance } from '@/core/supabase/getUserBalance'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { BASE_COSTS } from '@/scenes/checkBalanceScene'
import { ModeEnum } from '@/interfaces/modes'

const OPERATION_COST = BASE_COSTS[ModeEnum.TextToVideo] || 50

myScene.action('process', async (ctx) => {
  await ctx.answerCbQuery()
  const isRu = isRussianFromState(ctx)
  const telegramId = ctx.from!.id.toString()

  // Check balance
  const balance = await getUserBalance(telegramId)

  if (balance < OPERATION_COST) {
    await ctx.reply(
      isRu
        ? `❌ Недостаточно звёзд. Нужно: ${OPERATION_COST}⭐, у вас: ${balance}⭐`
        : `❌ Insufficient stars. Need: ${OPERATION_COST}⭐, you have: ${balance}⭐`
    )
    return
  }

  // Deduct balance
  await updateUserBalance(telegramId, -OPERATION_COST)

  await ctx.reply('⏳ Processing...')

  // Process operation...
  const result = await generateVideo(ctx.session.prompt)

  await ctx.replyWithVideo(result.videoUrl, {
    caption: `✅ Done! Cost: ${OPERATION_COST}⭐`
  })
})
```

### Pattern 7: Error Handling in Scenes

```typescript
myWizard = new Scenes.WizardScene<MyContext>(
  'error-safe-wizard',

  async (ctx) => {
    try {
      // Step 1 logic
      await ctx.reply('Step 1')
      return ctx.wizard.next()

    } catch (error) {
      console.error('❌ Step 1 error:', error)
      const isRu = isRussianFromState(ctx)
      await ctx.reply(
        isRu
          ? '❌ Ошибка инициализации. Попробуйте /start'
          : '❌ Init error. Try /start'
      )
      return ctx.scene.leave()
    }
  },

  async (ctx) => {
    const isRu = isRussianFromState(ctx)

    try {
      // Step 2 logic with external API
      const result = await unstableApiCall(ctx.session.data)

      await ctx.reply('✅ Success!')
      return ctx.scene.leave()

    } catch (error) {
      console.error('❌ Step 2 error:', error)
      await ctx.reply(
        isRu
          ? '❌ Ошибка обработки. Попробуйте снова или /cancel'
          : '❌ Processing error. Try again or /cancel'
      )
      // Stay on step for retry
      return
    }
  }
)
```

### Pattern 8: Cancel Button in Every Step

```typescript
// ✅ ПРАВИЛЬНО - Cancel button везде + обработка в каждом step
myWizard = new Scenes.WizardScene<MyContext>(
  'cancelable-wizard',

  // Step 1
  async (ctx) => {
    const isRu = isRussianFromState(ctx)
    await ctx.reply(
      'Step 1',
      Markup.inlineKeyboard([
        [Markup.button.callback(isRu ? 'Отмена' : 'Cancel', 'cancel')]
      ])
    )
    return ctx.wizard.next()
  },

  // Step 2
  async (ctx) => {
    const isRu = isRussianFromState(ctx)

    // Check cancel FIRST in every step
    if (ctx.callbackQuery?.data === 'cancel') {
      await ctx.answerCbQuery()
      await ctx.reply(isRu ? '❌ Отменено' : '❌ Cancelled')
      return ctx.scene.leave()
    }

    // Process input...

    await ctx.reply(
      'Step 2',
      Markup.inlineKeyboard([
        [Markup.button.callback(isRu ? 'Отмена' : 'Cancel', 'cancel')]
      ])
    )
    return ctx.wizard.next()
  },

  // Step 3
  async (ctx) => {
    const isRu = isRussianFromState(ctx)

    // Check cancel again
    if (ctx.callbackQuery?.data === 'cancel') {
      await ctx.answerCbQuery()
      await ctx.reply(isRu ? '❌ Отменено' : '❌ Cancelled')
      return ctx.scene.leave()
    }

    // Final processing...
    return ctx.scene.leave()
  }
)
```

### Pattern 9: Keyboard Buttons vs Inline Buttons

```typescript
// Reply Keyboard - for main choices, stays visible
const replyKeyboard = Markup.keyboard([
  ['📱 Vertical (9:16)', '🖥️ Horizontal (16:9)'],
  ['⬅️ Back to menu']
]).resize() // .resize() makes it compact

await ctx.reply('Choose aspect ratio:', replyKeyboard)

// Inline Keyboard - for actions, disappears after click
const inlineKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('✅ Confirm', 'confirm')],
  [Markup.button.callback('❌ Cancel', 'cancel')]
])

await ctx.reply('Confirm action?', inlineKeyboard)

// ✅ Good pattern: Reply for navigation, Inline for actions
myWizard = new Scenes.WizardScene<MyContext>(
  'keyboard-wizard',

  // Step 1: Choose model (Reply keyboard)
  async (ctx) => {
    const keyboard = Markup.keyboard([
      ['Model A', 'Model B'],
      ['⬅️ Back']
    ]).resize()

    await ctx.reply('Choose model:', keyboard)
    return ctx.wizard.next()
  },

  // Step 2: Confirm choice (Inline keyboard)
  async (ctx) => {
    const isRu = isRussianFromState(ctx)

    if (!ctx.message || !('text' in ctx.message)) return

    const model = ctx.message.text
    ctx.session.selectedModel = model

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('✅ Confirm', 'confirm')],
      [Markup.button.callback('🔄 Change', 'change')]
    ])

    await ctx.reply(
      `Selected: ${model}. Confirm?`,
      keyboard
    )
    return ctx.wizard.next()
  }
)
```

### Pattern 10: File Handling

```typescript
import { validateTelegramFile } from '@/interfaces/zod/lipsync.zod'

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB

myWizard = new Scenes.WizardScene<MyContext>(
  'file-wizard',

  async (ctx) => {
    await ctx.reply('Send a video (max 20MB)')
    return ctx.wizard.next()
  },

  async (ctx) => {
    const isRu = isRussianFromState(ctx)

    // Check if video
    if (!ctx.message || !('video' in ctx.message)) {
      await ctx.reply(
        isRu ? '❌ Отправьте видео' : '❌ Send a video'
      )
      return
    }

    const video = ctx.message.video

    // Validate file size
    if (video.file_size && video.file_size > MAX_FILE_SIZE) {
      await ctx.reply(
        isRu
          ? `❌ Файл слишком большой. Максимум: 20MB`
          : `❌ File too large. Max: 20MB`
      )
      return
    }

    // Get file from Telegram
    const file = await ctx.telegram.getFile(video.file_id)
    const fileUrl = `https://api.telegram.org/file/bot${ctx.botInfo.token}/${file.file_path}`

    ctx.session.videoUrl = fileUrl
    ctx.session.videoFileId = video.file_id

    await ctx.reply('✅ Video received!')
    return ctx.wizard.next()
  }
)
```

## Scene Registration

### In `src/scenes/index.ts`
```typescript
import { lipSyncWizard } from './lipSyncWizard'
import { textToVideoWizard } from './textToVideoWizard'
import { myNewScene } from './myNewScene'

export const scenes = [
  lipSyncWizard,
  textToVideoWizard,
  myNewScene, // Add new scene
]
```

### In `src/bot.ts`
```typescript
import { Scenes } from 'telegraf'
import { scenes } from './scenes'

const stage = new Scenes.Stage<MyContext>(scenes)
bot.use(stage.middleware())

// Enter scene from command
bot.command('lipsync', (ctx) => ctx.scene.enter('lip_sync'))
```

## Common Scene Actions

### Navigate Between Scenes
```typescript
// Enter specific scene
await ctx.scene.enter('lip_sync')

// Leave current scene (return to bot root)
await ctx.scene.leave()

// Re-enter same scene (restart)
await ctx.scene.reenter()
```

### Wizard Navigation
```typescript
// Move to next step
return ctx.wizard.next()

// Go back one step
return ctx.wizard.back()

// Jump to specific step (0-indexed)
return ctx.wizard.selectStep(2)

// Leave wizard
return ctx.scene.leave()
```

## Anti-Patterns to Avoid

### ❌ Anti-Pattern 1: Forgetting answerCbQuery
```typescript
// ❌ BAD
myScene.action('button', async (ctx) => {
  await ctx.reply('Processing...')
  // Button stuck with loading animation!
})

// ✅ GOOD
myScene.action('button', async (ctx) => {
  await ctx.answerCbQuery()
  await ctx.reply('Processing...')
})
```

### ❌ Anti-Pattern 2: Not Initializing Session
```typescript
// ❌ BAD - session not initialized
myWizard = new Scenes.WizardScene<MyContext>(
  'bad-wizard',
  async (ctx) => {
    await ctx.reply('Step 1')
    return ctx.wizard.next()
  },
  async (ctx) => {
    ctx.session.data = 'value' // TypeError!
  }
)

// ✅ GOOD
myWizard = new Scenes.WizardScene<MyContext>(
  'good-wizard',
  async (ctx) => {
    ctx.session = { ...ctx.session, data: null }
    await ctx.reply('Step 1')
    return ctx.wizard.next()
  },
  async (ctx) => {
    ctx.session.data = 'value' // Works!
  }
)
```

### ❌ Anti-Pattern 3: Not Handling Cancel
```typescript
// ❌ BAD - no way to exit
myWizard = new Scenes.WizardScene<MyContext>(
  'trap-wizard',
  async (ctx) => {
    await ctx.reply('Step 1 - no escape!')
    return ctx.wizard.next()
  }
  // User stuck!
)

// ✅ GOOD
myWizard = new Scenes.WizardScene<MyContext>(
  'escape-wizard',
  async (ctx) => {
    await ctx.reply(
      'Step 1',
      Markup.inlineKeyboard([
        [Markup.button.callback('Cancel', 'cancel')]
      ])
    )
    return ctx.wizard.next()
  },
  async (ctx) => {
    if (ctx.callbackQuery?.data === 'cancel') {
      await ctx.answerCbQuery()
      return ctx.scene.leave()
    }
    // ...
  }
)
```

### ❌ Anti-Pattern 4: Mixed Language Logic
```typescript
// ❌ BAD - inconsistent language detection
myScene.enter(async (ctx) => {
  const lang = ctx.from?.language_code // ❌
  const isRu = lang === 'ru' || lang === 'ru-RU' // ❌
  // Different logic everywhere!
})

// ✅ GOOD - centralized
myScene.enter(async (ctx) => {
  const isRu = isRussianFromState(ctx) // ✅ Always use this!
})
```

### ❌ Anti-Pattern 5: No Validation
```typescript
// ❌ BAD - no validation, crashes easily
myWizard = new Scenes.WizardScene<MyContext>(
  'unsafe-wizard',
  async (ctx) => {
    return ctx.wizard.next()
  },
  async (ctx) => {
    const video = ctx.message.video // TypeError if not video!
    // ...
  }
)

// ✅ GOOD - validated
myWizard = new Scenes.WizardScene<MyContext>(
  'safe-wizard',
  async (ctx) => {
    return ctx.wizard.next()
  },
  async (ctx) => {
    if (!ctx.message || !('video' in ctx.message)) {
      await ctx.reply('Please send a video')
      return
    }
    const video = ctx.message.video
    // ...
  }
)
```

## Real Examples from Project

### Example 1: LipSync Wizard (Complex)
Location: `src/scenes/lipSyncWizard/index.ts`
- 3 steps: video → audio → process
- Zod validation
- Admin-only access
- Balance checking
- Session management
- Cancel handling

### Example 2: Text-to-Video Simple (Simplified)
Location: `src/scenes/textToVideoWizard/simple.ts`
- Reply keyboards for model selection
- Aspect ratio selection
- Cost calculation
- Prompt input
- Processing with Inngest

### Example 3: Payment Scene (BaseScene)
Location: `src/scenes/paymentScene/index.ts`
- Simple action handlers
- Payment processing
- Balance updates

## Scene Best Practices

1. ✅ **ALWAYS** answer callback queries first
2. ✅ **ALWAYS** use `isRussianFromState()` for language
3. ✅ **ALWAYS** initialize session in step 1
4. ✅ **ALWAYS** provide cancel button
5. ✅ **ALWAYS** validate inputs with Zod
6. ✅ **ALWAYS** check balance before operations
7. ✅ **ALWAYS** handle errors gracefully
8. ✅ **ALWAYS** log with emojis for clarity
9. ✅ **ALWAYS** stay on step if validation fails
10. ✅ **NEVER** silent catch without user notification

## Quick Scene Template

```typescript
import { Scenes, Markup } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'

export const myScene = new Scenes.WizardScene<MyContext>(
  'my-scene-id',

  // STEP 1: Initialize
  async (ctx) => {
    const isRu = isRussianFromState(ctx)
    ctx.session.sceneData = { step: 1 }

    await ctx.reply(
      isRu ? 'Шаг 1: ...' : 'Step 1: ...',
      Markup.inlineKeyboard([
        [Markup.button.callback(isRu ? 'Отмена' : 'Cancel', 'cancel')]
      ])
    )
    return ctx.wizard.next()
  },

  // STEP 2: Process
  async (ctx) => {
    const isRu = isRussianFromState(ctx)

    if (ctx.callbackQuery?.data === 'cancel') {
      await ctx.answerCbQuery()
      await ctx.reply(isRu ? '❌ Отменено' : '❌ Cancelled')
      return ctx.scene.leave()
    }

    // Validate input
    if (!ctx.message) {
      await ctx.reply(isRu ? '❌ Ошибка' : '❌ Error')
      return
    }

    // Process & leave
    await ctx.reply('✅ Done!')
    return ctx.scene.leave()
  }
)

export default myScene
```

This is the **complete Telegram Scenes expertise** distilled from 50+ production scenes!
