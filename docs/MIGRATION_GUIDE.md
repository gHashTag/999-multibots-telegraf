# Руководство по миграции на новые классы-процессоры

Это руководство поможет перейти на новые унифицированные классы после рефакторинга дублирования кода.

## 📚 Оглавление

1. [PaymentProcessor - обработка платежей](#paymentprocessor)
2. [BalanceOperationProcessor - операции с балансом](#balanceoperationprocessor)
3. [ErrorMessageService - обработка ошибок](#errormessageservice)
4. [Wizard Helpers - middleware для визардов](#wizard-helpers)
5. [Логирование](#logging)
6. [Скачивание файлов](#file-download)

---

## PaymentProcessor

### ❌ Старый подход (deprecated)

```typescript
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { createSuccessfulPayment } from '@/core/supabase/createSuccessfulPayment'
import { directPaymentProcessor } from '@/core/supabase/directPayment'

// Вариант 1: updateUserBalance
await updateUserBalance(
  telegram_id,
  amount,
  PaymentType.MONEY_OUTCOME,
  'Payment for service',
  { bot_name: 'my_bot', service_type: 'neuro_photo' }
)

// Вариант 2: createSuccessfulPayment
await createSuccessfulPayment({
  telegram_id,
  amount,
  type: 'money_income',
  description: 'Payment received',
  bot_name: 'my_bot',
  inv_id: 'invoice_123',
})

// Вариант 3: directPaymentProcessor
await directPaymentProcessor({
  telegram_id,
  amount,
  type: PaymentType.MONEY_OUTCOME,
  description: 'Service payment',
  bot_name: 'my_bot',
  service_type: 'neuro_photo',
})
```

### ✅ Новый подход (рекомендуется)

```typescript
import { PaymentProcessor } from '@/core/supabase/PaymentProcessor'
import { PaymentType } from '@/interfaces/payments.interface'

// Единый метод для всех типов платежей
const result = await PaymentProcessor.createPaymentRecord({
  telegram_id: '123456',
  amount: 100,
  type: PaymentType.MONEY_OUTCOME,
  description: 'Payment for service',
  bot_name: 'my_bot',
  service_type: 'neuro_photo',
  model_name: 'flux_pro',
  metadata: {
    // дополнительные данные
  },
})

if (result.success) {
  console.log('Платеж создан:', result.payment_id)
  console.log('Изменение баланса:', result.balanceChange)
} else {
  console.error('Ошибка:', result.error)
}
```

### Преимущества
- ✅ Единый интерфейс для всех типов платежей
- ✅ Автоматическая валидация через Zod
- ✅ Защита от дубликатов (по inv_id)
- ✅ Проверка баланса перед списанием
- ✅ Детальное логирование
- ✅ Возврат полной информации об операции

---

## BalanceOperationProcessor

### ❌ Старый подход (deprecated)

```typescript
import { processBalanceOperation } from '@/price/helpers/processBalanceOperation'
import { processBalanceVideoOperation } from '@/price/helpers/processBalanceVideoOperation'
import { processServiceBalanceOperation } from '@/price/helpers/processServiceBalanceOperation'

// Вариант 1: общая операция
const result1 = await processBalanceOperation({
  ctx,
  telegram_id: 123456,
  paymentAmount: 10,
  is_ru: true,
  bot_name: 'my_bot',
})

// Вариант 2: видео операция
const result2 = await processBalanceVideoOperation(ctx, 'kling_video', true)

// Вариант 3: сервисная операция
const result3 = await processServiceBalanceOperation({
  telegram_id: '123456',
  paymentAmount: 5,
  is_ru: true,
  bot,
  bot_name: 'my_bot',
  description: 'Service payment',
  service_type: ModeEnum.NEURO_PHOTO,
})
```

### ✅ Новый подход (рекомендуется)

```typescript
import { BalanceOperationProcessor } from '@/price/helpers/BalanceOperationProcessor'

// Универсальный метод для всех типов
const result = await BalanceOperationProcessor.processOperation({
  telegram_id: ctx.from!.id,
  paymentAmount: 10,
  is_ru: true,
  bot_name: ctx.botInfo?.username || 'my_bot',
  ctx, // опционально
  description: 'Payment for service',
  service_type: 'neuro_photo',
  model_name: 'flux_pro',
  metadata: {
    // дополнительные данные
  },
})

if (result.success) {
  console.log('Новый баланс:', result.newBalance)
} else {
  console.error('Ошибка:', result.error)
}

// Специализированный метод для видео (с автоматическим расчетом цены)
const videoResult = await BalanceOperationProcessor.processVideoOperation(
  ctx,
  'kling_video',
  true,
  calculateFinalPrice,
  selectedModelConfig
)
```

### Особенности
- ✅ Поддержка bypass_payment_check (для лидмагнетов)
- ✅ Автоматическая проверка баланса
- ✅ Отправка сообщений пользователю при ошибках
- ✅ Централизованное логирование

---

## ErrorMessageService

### ❌ Старый подход (deprecated)

```typescript
import { sendGenericErrorMessage } from '@/menu/sendGenericErrorMessage'
import { sendGenerationErrorMessage } from '@/menu/sendGenerationErrorMessage'
import { sendServiceErrorToUser } from '@/helpers/error/sendServiceErrorToUser'

// Три разные функции с похожей логикой
await sendGenericErrorMessage(ctx, isRu, error)
await sendGenerationErrorMessage(ctx, isRu)
await sendServiceErrorToUser(ctx, telegram_id, error, isRu)
```

### ✅ Новый подход (рекомендуется)

```typescript
import {
  ErrorMessageService,
  ErrorType
} from '@/helpers/error/ErrorMessageService'

// Быстрые методы
await ErrorMessageService.sendGenericError(ctx, isRu, error)
await ErrorMessageService.sendGenerationError(ctx, isRu)
await ErrorMessageService.sendServiceError(ctx, telegram_id, error, isRu)
await ErrorMessageService.sendInsufficientFundsError(ctx, isRu)
await ErrorMessageService.sendNetworkError(ctx, isRu)
await ErrorMessageService.sendValidationError(ctx, isRu, 'Custom message')

// Универсальный метод с полным контролем
await ErrorMessageService.send({
  ctx,
  isRu: true,
  errorType: ErrorType.GENERATION,
  error: new Error('Generation failed'),
  customMessage: 'Кастомное сообщение',
  showDetails: true, // показать детали ошибки
})
```

### Типы ошибок (ErrorType)
```typescript
enum ErrorType {
  GENERIC = 'generic',              // Общая ошибка
  GENERATION = 'generation',        // Ошибка генерации
  INSUFFICIENT_FUNDS = 'insufficient_funds', // Недостаточно средств
  NETWORK = 'network',              // Сетевая ошибка
  VALIDATION = 'validation',        // Ошибка валидации
  SERVICE = 'service',              // Ошибка сервиса
}
```

### Преимущества
- ✅ Типизированные ошибки через enum
- ✅ Шаблоны сообщений на RU/EN с emoji
- ✅ Централизованное логирование
- ✅ Гибкость через custom сообщения

---

## Wizard Helpers

### ❌ Старый подход (дублирование в каждом визарде)

```typescript
// В КАЖДОМ визарде повторялось:

// 1. Проверка языка (217 раз!)
const isRu = ctx.session?.language === 'ru' || ctx.from?.language_code === 'ru'

// 2. Проверка пользователя (20+ раз)
if (!ctx.from?.id) {
  await ctx.reply(
    isRu
      ? 'Произошла ошибка. Пожалуйста, попробуйте позже.'
      : 'An error occurred. Please try again later.'
  )
  return ctx.scene.leave()
}

// 3. Проверка текста (4+ раза)
const message = ctx.message
if (!message || !('text' in message)) {
  await ctx.reply(
    isRu
      ? 'Пожалуйста, отправьте текстовое сообщение'
      : 'Please send a text message'
  )
  return
}

// 4. Получение текста
const text = message.text
```

### ✅ Новый подход (рекомендуется)

```typescript
import {
  isRussianFromState,
  validateUser,
  validateTextMessage,
  validateUserAndText,
  getMessageText,
  getLargestPhotoFileId,
  handleWizardError,
  createWizardEnterHandler,
} from '@/middleware/wizardHelpers'

// 1. Проверка языка - одна строка
const isRu = isRussianFromState(ctx)

// 2. Middleware для валидации
wizard.use(validateUser) // автоматически проверяет ctx.from?.id
wizard.use(validateTextMessage) // автоматически проверяет текст
// или комбинированный
wizard.use(validateUserAndText)

// 3. Безопасное получение данных
const text = getMessageText(ctx) // возвращает string | null
const photoId = getLargestPhotoFileId(ctx) // возвращает file_id | null

// 4. Централизованная обработка ошибок
try {
  // логика визарда
} catch (error) {
  await handleWizardError(ctx, error, 'myWizardName')
}

// 5. Создание enter handler
wizard.enter(
  createWizardEnterHandler(
    'Добро пожаловать! Отправьте текст.',
    'Welcome! Send your text.'
  )
)
```

### Пример полного визарда

```typescript
import { Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import {
  isRussianFromState,
  validateUserAndText,
  getMessageText,
  handleWizardError,
} from '@/middleware/wizardHelpers'

const wizard = new Scenes.WizardScene<MyContext>(
  'my_wizard',

  // Step 1: Enter
  async (ctx) => {
    const isRu = isRussianFromState(ctx)
    await ctx.reply(
      isRu ? 'Отправьте ваш текст:' : 'Send your text:'
    )
    return ctx.wizard.next()
  },

  // Step 2: Process text
  async (ctx) => {
    // Валидация через middleware
    await validateUserAndText(ctx, async () => {
      try {
        const isRu = isRussianFromState(ctx)
        const text = getMessageText(ctx)!

        // Ваша логика
        await ctx.reply(`Получено: ${text}`)

        return ctx.scene.leave()
      } catch (error) {
        await handleWizardError(ctx, error as Error, 'my_wizard')
      }
    })
  }
)

export default wizard
```

---

## Логирование

### ❌ Старый подход

```typescript
console.log('User action:', userId)
console.error('Error occurred:', error)
console.warn('Warning:', message)
```

### ✅ Новый подход

```typescript
import { logger } from '@/utils/enhancedLogger'

logger.info('User action:', { userId, action: 'generate' })
logger.error('Error occurred:', {
  error: error.message,
  stack: error.stack,
  userId,
})
logger.warn('Warning:', { message, context })
logger.debug('Debug info:', { data })
```

### Преимущества
- ✅ Структурированное логирование (JSON)
- ✅ Ротация логов
- ✅ Разные уровни (info, warn, error, debug)
- ✅ Безопасное логирование (sanitizeForLogging)
- ✅ Correlation ID для трассировки

---

## File Download

### ❌ Старый подход

```typescript
import { downloadFileHelper } from '@/modules/videoGenerator/helpers/downloadFileHelper'

const buffer = await downloadFileHelper(url)
```

### ✅ Новый подход

```typescript
import { downloadFile } from '@/helpers/downloadFile'

// Базовое использование
const buffer = await downloadFile(url)

// С опциями
const buffer = await downloadFile(url, {
  maxFileSize: 100 * 1024 * 1024, // 100MB
  timeout: 120000, // 2 минуты
  maxRedirects: 10,
})
```

### Преимущества
- ✅ Гибкие опции
- ✅ Детальное логирование
- ✅ Валидация URL и размера файла

---

## Чеклист миграции

### Для новых функций
- [ ] Использовать `PaymentProcessor` вместо старых функций платежей
- [ ] Использовать `BalanceOperationProcessor` для операций с балансом
- [ ] Использовать `ErrorMessageService` для отправки ошибок
- [ ] Использовать `wizardHelpers` в новых визардах
- [ ] Использовать `logger` вместо `console.log`

### Для существующего кода (постепенно)
- [ ] Заменить вызовы `updateUserBalance` на `PaymentProcessor.createPaymentRecord`
- [ ] Заменить `processBalanceOperation` на `BalanceOperationProcessor.processOperation`
- [ ] Заменить `sendGenericErrorMessage` на `ErrorMessageService.sendGenericError`
- [ ] Добавить `wizardHelpers` в существующие визарды
- [ ] Заменить `console.log` на `logger` в критичных модулях

---

## Поддержка

Все старые функции помечены `@deprecated` и содержат инструкции по миграции.
Старые функции продолжают работать как обертки над новыми классами.

Обратная совместимость сохранена на 100%.
