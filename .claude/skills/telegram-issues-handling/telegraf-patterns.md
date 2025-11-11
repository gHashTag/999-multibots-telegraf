# Telegraf Common Patterns & Solutions

Документация для telegram-scene-builder агента.

## 1. Telegraf WizardScene Lifecycle

### Правильная структура wizard:

```typescript
export const myWizard = new Scenes.WizardScene<MyContext>(
  'wizard_id',

  // Step 0: Первый шаг (НЕ .enter() handler!)
  async (ctx) => {
    // Показываем сообщение/клавиатуру
    await ctx.reply('Message', keyboard)

    // ОБЯЗАТЕЛЬНО: Переходим на следующий шаг
    ctx.wizard.next()
    return
  },

  // Step 1: Обработка ответа пользователя
  async (ctx) => {
    const input = ctx.message?.text

    // Обработка...

    // Переход на следующий шаг ИЛИ выход
    ctx.wizard.next()  // или ctx.scene.leave()
    return
  }
)

// ❌ НЕ ИСПОЛЬЗУЙ .enter() handler!
// Он выполняется ДО инициализации wizard context
```

### Критические правила:

1. **НЕ используй `.enter()` handler** - он выполняется до инициализации `ctx.wizard`
2. **Первый шаг wizard = Step 0** (index 0, не 1!)
3. **ВСЕГДА вызывай `ctx.wizard.next()`** после отправки сообщения
4. **Первый шаг выполняется на СЛЕДУЮЩЕМ update** после `ctx.scene.enter()`

## 2. Scene Transitions

### Правильный переход в wizard:

```typescript
// ✅ ПРАВИЛЬНО: Выход перед входом
await ctx.scene.leave()
await ctx.scene.enter('wizard_id')
```

### Неправильный переход:

```typescript
// ❌ НЕПРАВИЛЬНО: Без выхода
await ctx.scene.enter('wizard_id')
// Update будет "употреблен" current scene!
```

### Почему нужен `ctx.scene.leave()`:

Без `leave()` update (нажатие кнопки) "потребляется" текущей сценой ДО того, как wizard успевает его обработать. Это приводит к:
- Wizard входит, но Step 0 получает "мертвый" update
- Требуется второе нажатие для нормальной работы
- Race condition между scene transition и update processing

## 3. Keyboard Management

### Reply Keyboard (постоянная клавиатура):

```typescript
import { Markup } from 'telegraf'

await ctx.reply(
  'Choose option:',
  Markup.keyboard([
    ['Button 1', 'Button 2'],
    ['Button 3']
  ]).resize()  // ✅ .resize() для адаптации размера
)
```

### Inline Keyboard (кнопки под сообщением):

```typescript
await ctx.reply(
  'Choose action:',
  Markup.inlineKeyboard([
    [Markup.button.callback('Option 1', 'callback_1')],
    [Markup.button.callback('Option 2', 'callback_2')]
  ])
)
```

### Удаление клавиатуры:

```typescript
await ctx.reply(
  'Keyboard removed',
  Markup.removeKeyboard()
)
```

### Обработка reply keyboard buttons:

```typescript
// Кнопки reply keyboard приходят как обычные текстовые сообщения
bot.hears('Button 1', async (ctx) => {
  await ctx.reply('You clicked Button 1')
})

// В wizard:
async (ctx) => {
  const text = ctx.message?.text
  if (text === 'Button 1') {
    // Handle...
  }
}
```

### Обработка inline keyboard callbacks:

```typescript
bot.action('callback_1', async (ctx) => {
  await ctx.answerCbQuery('Processing...')
  await ctx.editMessageText('Option 1 selected')
})
```

## 4. Common Issues & Solutions

### Issue 1: "Keyboard не показывается"

**Причины:**
1. Reply не отправляется (ранний return)
2. Keyboard создается неправильно
3. Reply отправляется, но wizard сразу переходит на следующий шаг

**Решение:**
```typescript
// ✅ Правильно:
await ctx.reply('Message', keyboard)  // Дождаться отправки
ctx.wizard.next()  // Потом перейти
return

// ❌ Неправильно:
ctx.reply('Message', keyboard)  // Без await
return ctx.wizard.next()  // Сразу переход
```

### Issue 2: "Wizard требует два нажатия"

**Причина:** Нет `ctx.scene.leave()` перед `ctx.scene.enter()`

**Решение:**
```typescript
// CheckBalanceScene или другая точка входа:
await ctx.scene.leave()  // ✅ Обязательно!
await ctx.scene.enter('wizard_id')
```

### Issue 3: "Wizard зависает на первом шаге"

**Причины:**
1. Забыли `ctx.wizard.next()` в первом шаге
2. Ранний return до `ctx.wizard.next()`
3. Error в первом шаге

**Решение:**
```typescript
async (ctx) => {
  try {
    await ctx.reply('Step 1')
    ctx.wizard.next()  // ✅ ОБЯЗАТЕЛЬНО
    return
  } catch (error) {
    console.error('Step 1 error:', error)
    return ctx.scene.leave()
  }
}
```

### Issue 4: "ctx.wizard is undefined"

**Причина:** Попытка использовать `ctx.wizard` в `.enter()` handler

**Решение:**
```typescript
// ❌ НЕПРАВИЛЬНО: .enter() handler
myWizard.enter(async (ctx) => {
  await ctx.reply('Entered')
  ctx.wizard.next()  // ❌ ctx.wizard не существует здесь!
})

// ✅ ПРАВИЛЬНО: Первый шаг wizard
export const myWizard = new Scenes.WizardScene(
  'my_wizard',
  async (ctx) => {
    await ctx.reply('Entered')
    ctx.wizard.next()  // ✅ ctx.wizard существует здесь!
    return
  }
)
```

### Issue 5: "Update consumption race condition"

**Симптомы:**
- Кнопка нажата, но wizard не реагирует
- Требуется второе нажатие
- Logs показывают wizard entered, но step 0 не выполняется

**Причина:** Update "употребляется" между scene transition

**Решение:**
```typescript
// В точке входа (CheckBalanceScene):
await ctx.scene.leave()  // ✅ Выходим ИЗ текущей сцены
await ctx.scene.enter('wizard')  // ✅ Входим В wizard

// БЕЗ scene.leave():
// 1. User нажимает кнопку -> Update A
// 2. CheckBalanceScene получает Update A
// 3. Вызывает ctx.scene.enter('wizard')
// 4. Wizard входит, но Update A уже "употреблен"
// 5. Step 0 выполняется с "мертвым" update
// 6. Wizard ждет НОВОГО update (второе нажатие)
```

## 5. Best Practices

### 1. Всегда используй `async/await`

```typescript
// ✅ ПРАВИЛЬНО
await ctx.reply('Message')
await ctx.scene.enter('wizard')

// ❌ НЕПРАВИЛЬНО
ctx.reply('Message')  // Без await
ctx.scene.enter('wizard')  // Без await
```

### 2. Обрабатывай ошибки в каждом шаге

```typescript
async (ctx) => {
  try {
    // Step logic...
    ctx.wizard.next()
    return
  } catch (error) {
    console.error('Step error:', error)
    await ctx.reply('❌ Error occurred')
    return ctx.scene.leave()
  }
}
```

### 3. Валидируй input ПЕРЕД обработкой

```typescript
async (ctx) => {
  const message = ctx.message

  // ✅ Валидация сначала
  if (!message || !('text' in message)) {
    await ctx.reply('Please send text')
    return  // Остаёмся на том же шаге
  }

  const text = message.text
  // Обработка...
}
```

### 4. Используй `return` после асинхронных операций

```typescript
// ✅ ПРАВИЛЬНО
await ctx.reply('Message')
ctx.wizard.next()
return  // Предотвращает дальнейшее выполнение

// ❌ НЕПРАВИЛЬНО (может привести к двойной отправке)
await ctx.reply('Message')
ctx.wizard.next()
// Код продолжает выполняться!
```

### 5. Логируй критические моменты

```typescript
async (ctx) => {
  console.log('[WIZARD] Step 1 started, user:', ctx.from?.id)
  console.log('[WIZARD] Current cursor:', ctx.wizard?.cursor)

  try {
    await ctx.reply('Step 1')
    console.log('[WIZARD] ✅ Reply sent')

    ctx.wizard.next()
    console.log('[WIZARD] ✅ Advanced to next step')
    return
  } catch (error) {
    console.error('[WIZARD] ❌ Step 1 error:', error)
    return ctx.scene.leave()
  }
}
```

## 6. Debugging Checklist

Когда wizard не работает, проверь:

1. ✅ **Есть ли `ctx.wizard.next()`** в каждом шаге?
2. ✅ **Используется ли `await`** перед `ctx.reply()`?
3. ✅ **Вызывается ли `ctx.scene.leave()`** перед входом?
4. ✅ **НЕ используется ли `.enter()` handler**?
5. ✅ **Есть ли `return`** после асинхронных операций?
6. ✅ **Обрабатываются ли ошибки** в каждом шаге?
7. ✅ **Валидируется ли input** перед обработкой?
8. ✅ **Логируются ли** критические моменты?

## 7. Telegram-specific Rules

### Update Types

```typescript
// Text message
ctx.message?.text

// Photo
ctx.message?.photo

// Document
ctx.message?.document

// Callback query (inline keyboard)
ctx.callbackQuery?.data
```

### Session Management

```typescript
// Сохранение в session
ctx.session.imageUrl = 'https://...'
ctx.session.selectedModel = 'model_id'

// Чтение из session
const imageUrl = ctx.session.imageUrl
```

### Context Properties

```typescript
ctx.from?.id  // User Telegram ID
ctx.chat?.id  // Chat ID
ctx.message  // Current message
ctx.scene  // Scene manager
ctx.wizard  // Wizard manager (только в WizardScene)
ctx.session  // Session data
```

## 8. Unified Config Integration

При использовании unified-video-models.config.ts:

```typescript
import { generateModelKeyboard, parseModelButton } from '@/config/unified-video-models.config'

// Создание клавиатуры
const keyboardRows = generateModelKeyboard('image', isRu)
await ctx.reply('Select model:', Markup.keyboard(keyboardRows).resize())

// Парсинг выбора
const parsed = parseModelButton(ctx.message.text)
// parsed всегда валидный (fallback к veo3_fast)
```

## 9. Common Error Messages & Fixes

### "Cannot read property 'next' of undefined"
**Причина:** `ctx.wizard` не существует (не в wizard или в .enter())
**Решение:** Используй первый шаг wizard, не .enter() handler

### "Update was already acknowledged"
**Причина:** Двойной answerCbQuery на inline keyboard
**Решение:** Вызывай answerCbQuery только один раз

### "Message can't be edited"
**Причина:** Попытка редактировать старое сообщение
**Решение:** Отправь новое сообщение вместо editMessageText

### "Bot was blocked by the user"
**Причина:** Пользователь заблокировал бота
**Решение:** Обработай ошибку gracefully, не крашь процесс

---

**Created:** 2025-11-12
**Purpose:** Reference for telegram-scene-builder agent
**Status:** ✅ Active documentation
