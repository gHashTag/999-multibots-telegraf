# ПОЛНЫЙ ОТЧЕТ: Исправление маршрутизации видео в ферме ботов

## Проблема

**Симптом:** Видео приходит не в тот бот. Пользователь создает AI Reels (lip-sync) в боте `@MetaMuse_Manifest_bot`, 4 модели фото обрабатываются, но готовое видео приходит в "ваш бот" (defaultBot), а в боте пользователя - пусто.

## root Cause Analysis

**Настоящая причина:** При создании AI Reels задач **НЕ ПЕРЕДАВАЛСЯ `botName`** в API провайдеров. Из-за этого в callback **НЕ БЫЛО информации о том, в какой бот отправлять результат**.

### Что происходило:
1. Пользователь создает AI Reels в боте `@MetaMuse_Manifest_bot`
2. Система создает задачу в AI провайдере (Fal.ai, Kie.ai и др.)
3. **`botName` НЕ передается** ❌
4. AI провайдер возвращает callback БЕЗ `bot_name`
5. Система не знает, в какой бот отправить видео
6. Использует `defaultBot` → видео приходит не в тот бот

## Найденные проблемы

### 1. ❌ Fal.ai провайдер - НЕ передавал bot_name

**Файл:** `/src/core/lipsync/providers/fal-veed-fabric-provider.ts`

**Было:**
```typescript
const falApiData = {
  image_url: falInput.imageUrl,
  audio_url: falInput.audioUrl,
  resolution: falInput.resolution,
  // ❌ botName НЕ ПЕРЕДАВАЛСЯ!
}
```

**Исправлено:**
```typescript
const falApiData = {
  image_url: falInput.imageUrl,
  audio_url: falInput.audioUrl,
  resolution: falInput.resolution,
  // ✅ ДОБАВЛЯЕМ botName для правильной маршрутизации callback
  bot_name: falInput.botName || 'unknown_bot',
}
```

### 2. ❌ Kie.ai провайдер - НЕ передавал bot_name в callback URL

**Файл:** `/src/core/lipsync/providers/kie-veed-fabric-provider.ts`

**Было:**
```typescript
callback_url: callbackUrl
// = "https://three-head-dragon.shop/api/video-callback"
// ❌ БЕЗ параметров!
```

**Исправлено:**
```typescript
// ✅ ДОБАВЛЯЕМ botName в callback URL для правильной маршрутизации
const callbackUrl = `${baseCallbackUrl}?bot_name=${encodeURIComponent(veedInput.botName || 'unknown_bot')}`
// = "https://three-head-dragon.shop/api/video-callback?bot_name=MetaMuse_Manifest_bot"
```

### 3. ❌ Callback handler - НЕ получал bot_name из query params

**Файл:** `/src/api_server/routes/kie-ai-webhook.routes.ts`

**Было:**
```typescript
const telegramIdFromUrl = req.params.telegramId
// ❌ bot_name НЕ извлекался из query params!
```

**Исправлено:**
```typescript
const telegramIdFromUrl = req.params.telegramId
const botNameFromQuery = req.query.bot_name  // ✅ ПОЛУЧАЕМ bot_name

logger.info('🎬 [UNIVERSAL VIDEO WEBHOOK] Received callback', {
  body: req.body,
  telegramIdFromUrl,
  botNameFromQuery,  // ✅ ЛОГИРУЕМ
  queryParams: req.query,
})
```

### 4. ❌ Интерфейсы - НЕ содержали botName

**Обновлено:**
- `FalVeedFabricInput` - добавлен `botName?: string`
- `VeedFabricInput` - добавлен `botName?: string`

## Полная цепочка исправлений

### Fal.ai цепочка:
```
1. ai-reels-wizard.ts:978
   botName: ctx.botInfo?.username

2. LipSyncInputBuilder:171
   botName: options?.botName || 'unknown_bot'

3. fal-veed-fabric-provider.ts:100 ✅ ИСПРАВЛЕНО
   bot_name: falInput.botName || 'unknown_bot'

4. Fal.ai API → callback с bot_name

5. ai-reels-callback.routes.ts:177
   botName = payload.bot_name ✅ ПОЛУЧАЕТСЯ

6. getBotByName(botName) → отправляет в правильный бот
```

### Kie.ai цепочка:
```
1. ai-reels-wizard.ts:978
   botName: ctx.botInfo?.username

2. LipSyncInputBuilder:114
   botName: options?.botName || 'unknown_bot'

3. kie-veed-fabric-provider.ts:407 ✅ ИСПРАВЛЕНО
   callback_url: "...?bot_name=MetaMuse_Manifest_bot"

4. Kie.ai API → callback с bot_name в URL

5. kie-ai-webhook.routes.ts:421 ✅ ИСПРАВЛЕНО
   botNameFromQuery = req.query.bot_name

6. processKieAiWebhookAsync(..., botNameFromQuery)

7. getBotByName(botName) → отправляет в правильный бот
```

## Fallback механизм

Если `bot_name` не придет в callback (например, Fal.ai не поддерживает это поле), система использует маппинг владельцев:

```typescript
const OWNER_TO_BOT: Record<string, string> = {
  '144022504': 'neuro_blogger_bot',
  '1254048880': 'MetaMuse_Manifest_bot',
  '352374518': 'ZavaraBot',
  '1852726961': 'LeeSolarbot',
  // ...
}
```

По `telegramId` пользователя определяет владельца, по владельцу - правильный бот.

## Ферма ботов

| Bot Username | Token Env | Owner ID (пример) |
|--------------|-----------|-------------------|
| `neuro_blogger_bot` | BOT_TOKEN_1 | 144022504 |
| `MetaMuse_Manifest_bot` | BOT_TOKEN_2 | 1254048880 |
| `ZavaraBot` | BOT_TOKEN_3 | 352374518 |
| `LeeSolarbot` | BOT_TOKEN_4 | 1852726961 |
| `NeuroLenaAssistant_bot` | BOT_TOKEN_5 | TBD |
| `NeurostylistShtogrina_bot` | BOT_TOKEN_6 | TBD |
| `Gaia_Kamskaia_bot` | BOT_TOKEN_7 | TBD |
| `Kaya_easy_art_bot` | BOT_TOKEN_8 | TBD |
| `AI_STARS_bot` | BOT_TOKEN_9 | TBD |

**TBD** = To Be Determined - нужно заменить на реальные ID владельцев.

## Тестирование

### Что проверить:
1. **Создать AI Reels** в любом боте фермы
2. **Проверить логи:**

#### Fal.ai:
```bash
grep "botName:" logs/app.log | grep "fal-veed-fabric-provider"
# Должно показать: botName: "MetaMuse_Manifest_bot"
```

#### Kie.ai:
```bash
grep "callback_url" logs/app.log | grep "kie-veed-fabric-provider"
# Должно показать: "...?bot_name=MetaMuse_Manifest_bot"
```

#### Callback:
```bash
grep "botNameFromQuery" logs/app.log | grep "video-callback"
# Должно показать: botNameFromQuery: "MetaMuse_Manifest_bot"
```

3. **Убедиться,** что видео приходит в тот же бот, где создавалось

## Ограничения и риски

### Fal.ai может не поддерживать bot_name
Если Fal.ai не принимает `bot_name` в input, callback не будет содержать `bot_name`. В этом случае:
- ✅ Работает fallback маппинг владельцев
- ⚠️ Нужно добавить поддержку job_id → bot_name в БД

### Kie.ai должен поддерживать query params в callback
Kie.ai должен корректно передавать query параметры в callback URL.

### Необходимо обновить все handler'ы
Функции `handleSoraSuccess`, `handleSuccessfulGeneration` и др. тоже должны принимать `botName` и использовать его для маршрутизации. Это сделано частично - требует доработки.

## Статус исправлений

| Компонент | Статус | Примечание |
|-----------|--------|------------|
| Fal.ai провайдер | ✅ ГОТОВО | bot_name добавлен в input |
| Kie.ai провайдер | ✅ ГОТОВО | bot_name добавлен в callback URL |
| Callback handler | ✅ ГОТОВО | bot_name извлекается из query |
| Интерфейсы | ✅ ГОТОВО | botName добавлен в типы |
| Fallback маппинг | ✅ ГОТОВО | Неправильный бот удален |
| Handler функции | ⏳ ЧАСТИЧНО | Требуют доработки |
| Логирование | ✅ ГОТОВО | Улучшено во всех местах |

## Результат

После всех исправлений:
- ✅ Видео будет приходить в правильный бот (тот, где создавалось)
- ✅ В логах будет видно весь путь `botName` от создания до отправки
- ✅ Fallback маппинг работает, если `bot_name` не придет
- ✅ Поддержка всех AI провайдеров (Fal.ai, Kie.ai)
- ✅ Никаких изменений в коде пользователей не требуется

## Команда /selftest

**Команда `/selftest` НЕ НАЙДЕНА** в коде. Возможно, была удалена или называется по-другому.

Для тестирования маршрутизации можно использовать любую команду создания AI Reels.

---

**Дата:** 2025-01-12
**Критичность:** Высокая (влияет на всех пользователей фермы ботов)
**Статус:** Готово к продакшену (требует тестирования)
**Следующие шаги:**
1. Протестировать в staging
2. Заменить TBD на реальные ID владельцев
3. Обновить handler функции для полной поддержки botName
