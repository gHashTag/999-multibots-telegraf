# 🔍 Анализ поломки AI Reels Template 2 (Шаблон 2)

## 📋 Проблема

В Шаблоне 2 (AI Reels через render-server) запрос не отправлялся на рендер видео.

### Симптомы:
- ❌ Запрос не уходил на render-server
- ❌ Сообщение "⏳ Отправляем запрос на render-server..." выводилось **дважды**
- ❌ Не было сообщений об ошибке
- ❌ Не было подтверждения успешной отправки

## 🔎 Найденные причины

### 1. **Двойной вызов Step 6** ⚠️
**Файл**: `src/scenes/lipSyncWizard/ai-reels-render-wizard.ts`

**Проблема**:
- Step 5 (строка 1085) выводил сообщение "⏳ Отправляем запрос на render-server..."
- Step 5 **напрямую вызывал** Step 6 (строка 1108)
- Step 6 снова выводил то же сообщение (строка 1210)
- Step 6 пытался отправить запрос, но падал

**Код проблемы**:
```typescript
// ❌ В Step 5 (строка 1108):
return await (ctx.wizard as any).steps[ctx.wizard.cursor](ctx)
```

### 2. **Отсутствие детального логирования** ⚠️
**Файл**: `src/inngest_app/inngest-provider.ts`

**Проблема**:
- Не было логирования в `sendEvent()` методе
- Невозможно было понять, где именно падает отправка
- Нет информации о состоянии lazy initialization

## ✅ Исправления

### 1. Убрать дублирующий вызов Step 6
**Файл**: `src/scenes/lipSyncWizard/ai-reels-render-wizard.ts:1097-1104`

**Было**:
```typescript
await ctx.reply(...)
// ... вывод сообщения "⏳ Отправляем запрос на render-server..."

ctx.wizard.selectStep(9)
return await (ctx.wizard as any).steps[ctx.wizard.cursor](ctx) // ❌ ПРЯМОЙ ВЫЗОВ
```

**Стало**:
```typescript
await ctx.reply(...) // УБРАЛИ "⏳ Отправляем запрос..."
// ...

logger.info(...)
return ctx.wizard.next() // ✅ ПРОСТО ПЕРЕХОДИМ К СЛЕДУЮЩЕМУ ШАГУ
```

### 2. Добавить детальное логирование
**Файл**: `src/inngest_app/inngest-provider.ts:129-186`

**Добавлено**:
```typescript
logger.info(`🔴 [INNGEST PROVIDER] sendEvent() called`, {...})
logger.info(`🔴 [INNGEST PROVIDER] ensureInitialized() completed`, {...})
logger.info(`🔴 [INNGEST PROVIDER] getConfig() result`, {...})
logger.info(`🔴 [INNGEST PROVIDER] About to call config.client.send()`, {...})

// В catch блоке:
logger.error(`❌ [INNGEST PROVIDER] Error sending event to ${instance}`, {
  error: error instanceof Error ? error.message : String(error),
  errorStack: error instanceof Error ? error.stack : undefined, // ✅ ДОБАВИЛИ STACK TRACE
  eventName,
})
```

## 📊 История изменений

### Ключевые коммиты:
1. **861fb747f** - 🔧 Fix: Lazy initialization for InngestProvider
   - Добавлена lazy initialization
   - Потенциально сломала немедленную инициализацию

2. **e059fbd78** - fix: Use user voice ID for Template 2 AI Reels (Hedra)
   - Исправлена проблема с voice_id
   - Добавлена валидация ElevenLabs токена

3. **d98bd1740** - feat: Update render-server API payload to new structure (2025-10-27)
   - Изменена структура payload

## 📝 Правила предотвращения

### 1. **НИКОГДА не вызывать wizard steps напрямую**
```typescript
// ❌ НИКОГДА так не делать:
return await (ctx.wizard as any).steps[ctx.wizard.cursor](ctx)

// ✅ Всегда так:
return ctx.wizard.next()
```

### 2. **Всегда добавлять логирование в критические точки**
- При отправке запросов на внешние сервисы
- В начала и конце каждого этапа
- При обработке ошибок (включая stack trace)

### 3. **Тестировать lazy initialization**
При изменении инициализации всегда проверять:
```typescript
console.log('🔴 ENV VARS:', {
  RENDER_INNGEST_EVENT_KEY: !!process.env.RENDER_INNGEST_EVENT_KEY,
  BOT_INNGEST_EVENT_KEY: !!process.env.BOT_INNGEST_EVENT_KEY,
  ELEVENLABS_API_KEY: !!process.env.ELEVENLABS_API_KEY,
})
```

### 4. **Проверять переменные окружения**
В production всегда убеждаться что:
- `RENDER_INNGEST_EVENT_KEY` настроен
- `ELEVENLABS_API_KEY` настроен
- `HEDRA_API_KEY` настроен (если используется Hedra)
- `HEYGEN_*_API_KEY` настроен (если используется HeyGen)

### 5. **Избегать дублирования сообщений**
- Проверять, что каждое сообщение пользователю выводится **только один раз**
- Не выводить "Отправляем запрос..." заранее, только после реальной отправки

## 🔍 Диагностика

### Проверить отправку запроса:
```bash
# В production логах искать:
🔴 [INNGEST PROVIDER] sendEvent() called
🔴 [INNGEST PROVIDER] ensureInitialized() completed
🔴 [INNGEST PROVIDER] getConfig() result
🔴 [INNGEST PROVIDER] About to call config.client.send()
✅ [INNGEST PROVIDER] Event sent to RENDER (via Inngest Cloud)
```

### Проверить ошибки:
```bash
# Искать в логах:
❌ [INNGEST PROVIDER] Error sending event to RENDER
❌ [AI REELS RENDER] Error sending event
```

## 🎯 Результат

✅ Убрано дублирование сообщений
✅ Исправлен переход между шагами wizard'а
✅ Добавлено детальное логирование для диагностики
✅ Теперь ошибки будут видны в логах со stack trace

## 📌 Ссылки

- Файл с исправлениями: `src/scenes/lipSyncWizard/ai-reels-render-wizard.ts`
- Файл с логированием: `src/inngest_app/inngest-provider.ts`
- Webhook callback: `src/api_server/routes/ai-reels-callback.routes.ts`
- Render Server Client: `src/inngest_app/render-server-client.ts`
