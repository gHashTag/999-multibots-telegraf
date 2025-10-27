# Примеры рефакторинга визардов с использованием wizardHelpers

Этот документ показывает конкретные примеры до/после рефакторинга визардов.

## Пример 1: Простой текстовый визард

### ❌ До рефакторинга

```typescript
import { Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'

const textWizard = new Scenes.WizardScene<MyContext>(
  'text_wizard',

  // Step 1
  async (ctx) => {
    // Дублирование #1: проверка языка
    const isRu = ctx.session?.language === 'ru' || ctx.from?.language_code === 'ru'

    // Дублирование #2: проверка пользователя
    if (!ctx.from?.id) {
      const message = isRu
        ? 'Произошла ошибка. Пожалуйста, попробуйте позже.'
        : 'An error occurred. Please try again later.'
      await ctx.reply(message)
      return ctx.scene.leave()
    }

    await ctx.reply(
      isRu ? 'Отправьте текст:' : 'Send your text:'
    )
    return ctx.wizard.next()
  },

  // Step 2
  async (ctx) => {
    // Дублирование #1: проверка языка
    const isRu = ctx.session?.language === 'ru' || ctx.from?.language_code === 'ru'

    // Дублирование #2: проверка пользователя
    if (!ctx.from?.id) {
      const message = isRu
        ? 'Произошла ошибка. Пожалуйста, попробуйте позже.'
        : 'An error occurred. Please try again later.'
      await ctx.reply(message)
      return ctx.scene.leave()
    }

    // Дублирование #3: проверка текста
    const message = ctx.message
    if (!message || !('text' in message)) {
      await ctx.reply(
        isRu
          ? 'Пожалуйста, отправьте текстовое сообщение'
          : 'Please send a text message'
      )
      return
    }

    const text = message.text

    try {
      // Логика обработки
      await ctx.reply(`Получено: ${text}`)
      return ctx.scene.leave()
    } catch (error) {
      // Дублирование #4: обработка ошибок
      console.error('Error in text wizard:', error)
      await ctx.reply(
        isRu
          ? 'Произошла ошибка при обработке'
          : 'An error occurred during processing'
      )
      return ctx.scene.leave()
    }
  }
)

export default textWizard
```

**Проблемы:**
- 67 строк кода
- 4 вида дублирования
- Проверка языка повторяется 2 раза
- Проверка пользователя повторяется 2 раза
- Ручная валидация текста
- Ручная обработка ошибок

### ✅ После рефакторинга

```typescript
import { Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import {
  isRussianFromState,
  validateUserAndText,
  getMessageText,
  handleWizardError,
  createWizardEnterHandler,
} from '@/middleware/wizardHelpers'

const textWizard = new Scenes.WizardScene<MyContext>(
  'text_wizard',

  // Step 1: используем фабрику для enter handler
  createWizardEnterHandler(
    'Отправьте текст:',
    'Send your text:'
  ),

  // Step 2
  async (ctx) => {
    await validateUserAndText(ctx, async () => {
      try {
        const isRu = isRussianFromState(ctx)
        const text = getMessageText(ctx)!

        // Логика обработки
        await ctx.reply(`${isRu ? 'Получено' : 'Received'}: ${text}`)
        return ctx.scene.leave()
      } catch (error) {
        await handleWizardError(ctx, error as Error, 'text_wizard')
      }
    })
  }
)

export default textWizard
```

**Улучшения:**
- 31 строка кода (вместо 67) - **сокращение на 54%**
- Нет дублирования
- Проверка языка - 1 раз
- Валидация через middleware
- Централизованная обработка ошибок
- Код читается намного легче

---

## Пример 2: Визард с фото

### ❌ До рефакторинга

```typescript
import { Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import { sendGenericErrorMessage } from '@/menu/sendGenericErrorMessage'

const photoWizard = new Scenes.WizardScene<MyContext>(
  'photo_wizard',

  async (ctx) => {
    const isRu = ctx.session?.language === 'ru' || ctx.from?.language_code === 'ru'

    if (!ctx.from?.id) {
      await sendGenericErrorMessage(ctx, isRu)
      return ctx.scene.leave()
    }

    await ctx.reply(
      isRu ? 'Отправьте фото:' : 'Send a photo:'
    )
    return ctx.wizard.next()
  },

  async (ctx) => {
    const isRu = ctx.session?.language === 'ru' || ctx.from?.language_code === 'ru'

    if (!ctx.from?.id) {
      await sendGenericErrorMessage(ctx, isRu)
      return ctx.scene.leave()
    }

    const message = ctx.message
    if (!message || !('photo' in message) || !message.photo) {
      await ctx.reply(
        isRu ? 'Пожалуйста, отправьте фото' : 'Please send a photo'
      )
      return
    }

    const photos = message.photo
    if (photos.length === 0) {
      await ctx.reply(
        isRu ? 'Фото не найдено' : 'Photo not found'
      )
      return
    }

    const largestPhoto = photos[photos.length - 1]
    const fileId = largestPhoto.file_id

    try {
      // Обработка фото
      await ctx.reply(`File ID: ${fileId}`)
      return ctx.scene.leave()
    } catch (error) {
      console.error('Error processing photo:', error)
      await sendGenericErrorMessage(
        ctx,
        isRu,
        error instanceof Error ? error : new Error('Unknown error')
      )
      return ctx.scene.leave()
    }
  }
)

export default photoWizard
```

### ✅ После рефакторинга

```typescript
import { Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import {
  isRussianFromState,
  validateUser,
  validatePhotoMessage,
  getLargestPhotoFileId,
  handleWizardError,
} from '@/middleware/wizardHelpers'

const photoWizard = new Scenes.WizardScene<MyContext>(
  'photo_wizard',

  async (ctx) => {
    await validateUser(ctx, async () => {
      const isRu = isRussianFromState(ctx)
      await ctx.reply(isRu ? 'Отправьте фото:' : 'Send a photo:')
      return ctx.wizard.next()
    })
  },

  async (ctx) => {
    await validatePhotoMessage(ctx, async () => {
      try {
        const isRu = isRussianFromState(ctx)
        const fileId = getLargestPhotoFileId(ctx)!

        // Обработка фото
        await ctx.reply(`File ID: ${fileId}`)
        return ctx.scene.leave()
      } catch (error) {
        await handleWizardError(ctx, error as Error, 'photo_wizard')
      }
    })
  }
)

export default photoWizard
```

**Улучшения:**
- Сокращение кода на ~40%
- Автоматическая валидация фото
- Безопасное получение file_id
- Централизованная обработка ошибок

---

## Пример 3: Визард с балансом и генерацией

### ❌ До рефакторинга

```typescript
import { Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import { processBalanceOperation } from '@/price/helpers/processBalanceOperation'
import { sendGenerationErrorMessage } from '@/menu/sendGenerationErrorMessage'

const generationWizard = new Scenes.WizardScene<MyContext>(
  'generation_wizard',

  async (ctx) => {
    const isRu = ctx.session?.language === 'ru' || ctx.from?.language_code === 'ru'

    if (!ctx.from?.id) {
      await ctx.reply(
        isRu
          ? 'Произошла ошибка. Пожалуйста, попробуйте позже.'
          : 'An error occurred. Please try again later.'
      )
      return ctx.scene.leave()
    }

    await ctx.reply(
      isRu ? 'Отправьте промпт для генерации:' : 'Send prompt for generation:'
    )
    return ctx.wizard.next()
  },

  async (ctx) => {
    const isRu = ctx.session?.language === 'ru' || ctx.from?.language_code === 'ru'

    if (!ctx.from?.id) {
      await ctx.reply(
        isRu
          ? 'Произошла ошибка. Пожалуйста, попробуйте позже.'
          : 'An error occurred. Please try again later.'
      )
      return ctx.scene.leave()
    }

    const message = ctx.message
    if (!message || !('text' in message)) {
      await ctx.reply(
        isRu
          ? 'Пожалуйста, отправьте текстовое сообщение'
          : 'Please send a text message'
      )
      return
    }

    const prompt = message.text
    const paymentAmount = 5

    try {
      // Проверка баланса
      const balanceResult = await processBalanceOperation({
        ctx,
        telegram_id: ctx.from.id,
        paymentAmount,
        is_ru: isRu,
        bot_name: ctx.botInfo?.username || 'bot',
      })

      if (!balanceResult.success) {
        await ctx.reply(
          balanceResult.error ||
            (isRu
              ? 'Недостаточно средств на балансе'
              : 'Insufficient funds')
        )
        return ctx.scene.leave()
      }

      // Генерация
      await ctx.reply(
        isRu ? 'Генерирую...' : 'Generating...'
      )

      // Логика генерации...

      await ctx.reply(
        isRu
          ? `Готово! Баланс: ${balanceResult.newBalance}`
          : `Done! Balance: ${balanceResult.newBalance}`
      )
      return ctx.scene.leave()
    } catch (error) {
      console.error('Generation error:', error)
      await sendGenerationErrorMessage(ctx, isRu)
      return ctx.scene.leave()
    }
  }
)

export default generationWizard
```

### ✅ После рефакторинга

```typescript
import { Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import {
  isRussianFromState,
  validateUserAndText,
  getMessageText,
  handleWizardError,
} from '@/middleware/wizardHelpers'
import { BalanceOperationProcessor } from '@/price/helpers/BalanceOperationProcessor'
import { ErrorMessageService, ErrorType } from '@/helpers/error/ErrorMessageService'

const generationWizard = new Scenes.WizardScene<MyContext>(
  'generation_wizard',

  async (ctx) => {
    await validateUser(ctx, async () => {
      const isRu = isRussianFromState(ctx)
      await ctx.reply(
        isRu ? 'Отправьте промпт для генерации:' : 'Send prompt for generation:'
      )
      return ctx.wizard.next()
    })
  },

  async (ctx) => {
    await validateUserAndText(ctx, async () => {
      try {
        const isRu = isRussianFromState(ctx)
        const prompt = getMessageText(ctx)!
        const paymentAmount = 5

        // Проверка баланса через новый процессор
        const balanceResult = await BalanceOperationProcessor.processOperation({
          telegram_id: ctx.from!.id,
          paymentAmount,
          is_ru: isRu,
          bot_name: ctx.botInfo?.username || 'bot',
          ctx,
          description: 'Image generation',
          service_type: 'image_generation',
        })

        if (!balanceResult.success) {
          // Используем типизированную ошибку
          await ErrorMessageService.send({
            ctx,
            isRu,
            errorType: ErrorType.INSUFFICIENT_FUNDS,
          })
          return ctx.scene.leave()
        }

        // Генерация
        await ctx.reply(isRu ? 'Генерирую...' : 'Generating...')

        // Логика генерации...

        await ctx.reply(
          isRu
            ? `Готово! Баланс: ${balanceResult.newBalance}`
            : `Done! Balance: ${balanceResult.newBalance}`
        )
        return ctx.scene.leave()
      } catch (error) {
        // Централизованная обработка с правильным типом ошибки
        await ErrorMessageService.send({
          ctx,
          isRu: isRussianFromState(ctx),
          errorType: ErrorType.GENERATION,
          error: error as Error,
        })
        return ctx.scene.leave()
      }
    })
  }
)

export default generationWizard
```

**Улучшения:**
- Использование `BalanceOperationProcessor` вместо старой функции
- Использование `ErrorMessageService` с типами ошибок
- Использование `wizardHelpers` для валидации
- Более читаемый и поддерживаемый код

---

## Сравнительная таблица

| Аспект | До рефакторинга | После рефакторинга |
|--------|-----------------|-------------------|
| Строк кода (среднее) | ~80 | ~40 |
| Дублирование | Высокое (4-5 видов) | Нет |
| Проверка языка | В каждом шаге | 1 раз через функцию |
| Валидация | Ручная, везде | Через middleware |
| Обработка ошибок | Разная в каждом файле | Централизованная |
| Типизация ошибок | Строки | Enum |
| Логирование | console.log | logger |
| Поддерживаемость | Низкая | Высокая |

---

## Чеклист рефакторинга визарда

### Шаг 1: Импорты
- [ ] Импортировать `isRussianFromState`
- [ ] Импортировать нужные `validate*` middleware
- [ ] Импортировать `get*` утилиты для данных
- [ ] Импортировать `handleWizardError`
- [ ] Импортировать новые процессоры (Balance, Error)

### Шаг 2: Рефакторинг
- [ ] Заменить проверку языка на `isRussianFromState(ctx)`
- [ ] Обернуть логику в `validate*` middleware
- [ ] Использовать `get*` утилиты вместо ручного извлечения
- [ ] Заменить try-catch на `handleWizardError`
- [ ] Использовать `createWizardEnterHandler` если применимо

### Шаг 3: Процессоры
- [ ] Заменить `processBalanceOperation` на `BalanceOperationProcessor`
- [ ] Заменить `sendGenericErrorMessage` на `ErrorMessageService`
- [ ] Заменить `console.log` на `logger`

### Шаг 4: Тестирование
- [ ] Проверить работу всех шагов визарда
- [ ] Проверить валидацию
- [ ] Проверить обработку ошибок
- [ ] Проверить оба языка (RU/EN)

---

## Дополнительные советы

### 1. Комбинация middleware

Можно комбинировать middleware для более сложных проверок:

```typescript
async (ctx) => {
  await validateUser(ctx, async () => {
    await validateTextMessage(ctx, async () => {
      // Здесь ctx.from?.id точно есть
      // И ctx.message.text точно есть
      const text = getMessageText(ctx)!
      // логика
    })
  })
}

// Или использовать комбинированный
await validateUserAndText(ctx, async () => {
  // то же самое
})
```

### 2. Создание кастомных middleware

```typescript
// Пример кастомного middleware для проверки подписки
async function validateSubscription(ctx: MyContext, next: () => Promise<void>) {
  const hasSubscription = await checkSubscription(ctx.from!.id)
  if (!hasSubscription) {
    const isRu = isRussianFromState(ctx)
    await ErrorMessageService.send({
      ctx,
      isRu,
      errorType: ErrorType.VALIDATION,
      customMessage: isRu
        ? 'Требуется подписка'
        : 'Subscription required',
    })
    return
  }
  await next()
}
```

### 3. Использование в существующих визардах

Рефакторинг можно делать постепенно:
1. Начать с замены `isRu`
2. Добавить `wizardHelpers` утилиты
3. Заменить процессоры баланса
4. Обновить обработку ошибок

Каждый шаг независимый и безопасный.
