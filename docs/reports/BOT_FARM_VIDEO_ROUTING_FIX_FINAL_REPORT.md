# ОТЧЕТ: Исправление маршрутизации видео в ферме ботов (ФИНАЛЬНЫЙ)

## Проблема

**Симптом:** Видео приходит не в тот бот. Пользователь вызывает AI Reels (lip-sync), 4 модели фото в видео обрабатываются, но готовое видео приходит в "ваш бот" (defaultBot/системный), а в боте пользователя - пусто.

## Анализ

### Настоящая причина

**Проблема была в том, что при создании AI Reels задачи в Fal.ai НЕ передавался `botName` в metadata.**

#### Что происходило:
1. Пользователь создает AI Reels видео в боте `@MetaMuse_Manifest_bot` (например)
2. Система создает задачу в Fal.ai
3. **НО:** `botName` НЕ передается в API, теряется в metadata
4. Fal.ai возвращает callback без `bot_name`
5. Система не знает, в какой бот отправить видео
6. Используется `defaultBot` (fallback) → видео приходит не в тот бот

### Где была ошибка

**Файл:** `/src/core/lipsync/providers/fal-veed-fabric-provider.ts`

**Было (строки 95-98):**
```typescript
const falApiData = {
  image_url: falInput.imageUrl,
  audio_url: falInput.audioUrl,
  resolution: falInput.resolution || this.config.defaultResolution,
  // ❌ botName НЕ ПЕРЕДАВАЛСЯ!
}
```

## Исправления

### 1. ✅ Добавлен `botName` в falApiData (строка 100)

```typescript
const falApiData = {
  image_url: falInput.imageUrl,
  audio_url: falInput.audioUrl,
  resolution: falInput.resolution || this.config.defaultResolution,
  // ✅ ДОБАВЛЯЕМ botName для правильной маршрутизации callback
  bot_name: falInput.botName || 'unknown_bot',
}
```

### 2. ✅ Добавлен `botName` в интерфейс `FalVeedFabricInput` (строка 381)

```typescript
export interface FalVeedFabricInput extends UniversalLipSyncInput {
  provider: 'fal'
  modelId: 'fal-veed-fabric-1.0-fast'
  imageUrl: string
  audioUrl: string
  resolution?: '480p' | '720p'
  telegramId: string
  botName?: string  // ✅ ДОБАВЛЕНО
}
```

### 3. ✅ Улучшено логирование (строка 92)

Теперь в логах будет видно, какой `botName` передается при создании задачи.

### 4. ✅ Исправлен fallback маппинг в callback handler

**Файл:** `/src/api_server/routes/ai-reels-callback.routes.ts`

Удален несуществующий бот `HaimGroupMedia_bot` из маппинга владельцев. Если `bot_name` не придет в callback, система использует маппинг владельцев для определения правильного бота.

## Как это работает сейчас

### Правильный сценарий:
1. Пользователь `@username` создает AI Reels в боте `@MetaMuse_Manifest_bot`
2. В `ai-reels-wizard.ts` (строка 978) передается:
   ```typescript
   botName: ctx.botInfo?.username || 'unknown_bot'
   // botName = 'MetaMuse_Manifest_bot'
   ```
3. В `LipSyncInputBuilder.forFalVeedFabric()` (строка 171) сохраняется:
   ```typescript
   botName: options?.botName || 'unknown_bot'
   ```
4. В `fal-veed-fabric-provider.ts` (строка 100) передается в API:
   ```typescript
   bot_name: falInput.botName || 'unknown_bot'
   // bot_name = 'MetaMuse_Manifest_bot'
   ```
5. Fal.ai возвращает callback с `bot_name` в payload
6. В callback handler (строка 177) извлекается:
   ```typescript
   let botName = payload.bot_name || payload.metadata?.bot_name
   // botName = 'MetaMuse_Manifest_bot'
   ```
7. Система отправляет видео в правильный бот через `getBotByName(botName)`

### Fallback сценарий (если Fal.ai не поддерживает bot_name):
1. Если `bot_name` не пришел в callback
2. Система использует маппинг владельцев (строки 182-192)
3. По `telegramId` пользователя определяет владельца
4. По владельцу определяет правильный бот
5. Отправляет видео в правильный бот

## Ферма ботов

| Bot Username | Token Env |
|--------------|-----------|
| `neuro_blogger_bot` | BOT_TOKEN_1 |
| `MetaMuse_Manifest_bot` | BOT_TOKEN_2 |
| `ZavaraBot` | BOT_TOKEN_3 |
| `LeeSolarbot` | BOT_TOKEN_4 |
| `NeuroLenaAssistant_bot` | BOT_TOKEN_5 |
| `NeurostylistShtogrina_bot` | BOT_TOKEN_6 |
| `Gaia_Kamskaia_bot` | BOT_TOKEN_7 |
| `Kaya_easy_art_bot` | BOT_TOKEN_8 |
| `AI_STARS_bot` | BOT_TOKEN_9 |

## Ограничения Fal.ai

**ВНИМАНИЕ:** Fal.ai может не поддерживать произвольные поля в `input`. Если `bot_name` не будет принят API, нужно использовать альтернативный подход:

### Альтернативный подход (если основной не работает):
1. Сохранять маппинг `job_id` → `bot_name` в базе данных при создании задачи
2. В callback получать `job_id`
3. По `job_id` находить `bot_name` в БД
4. Отправлять видео в правильный бот

### Для проверки поддержки:
Логи покажут, передается ли `bot_name` в callback:
```
"bot_name": "MetaMuse_Manifest_bot"
```

Если не покажет - значит Fal.ai не поддерживает это поле.

## Тестирование

### Что проверить:
1. Создать AI Reels видео в любом боте фермы
2. Проверить логи на предмет:
   - ```"botName": "MetaMuse_Manifest_bot"``` в fal-veed-fabric-provider.ts
   - ```"bot_name": "MetaMuse_Manifest_bot"``` в callback payload
   - ```"Found bot by owner telegramId"``` в callback handler

3. Убедиться, что видео приходит в тот же бот, где создавалось

### Команда для проверки логов:
```bash
# Фильтр по AI REELS
tail -f logs/app.log | grep "AI REELS"

# Фильтр по CALLBACK
tail -f logs/app.log | grep "CALLBACK"

# Фильтр по конкретному боту
tail -f logs/app.log | grep "MetaMuse_Manifest_bot"
```

## Дополнительные места для проверки

Если проблема остается, проверить:

1. **Другие провайдеры lip-sync:**
   - `replicate-kling-provider.ts`
   - `kie-veed-fabric-provider.ts`
   - `sync-lipsync-provider.ts`

2. **Другие AI сервисы:**
   - Text-to-Video генерация
   - Image-to-Video генерация
   - Нейрофото генерация

3. **Inngest функции:**
   - Могут создавать задачи без передачи `botName`

## Команда /selftest

**Команда `/selftest` НЕ НАЙДЕНА** в коде. Возможно, была удалена или называется по-другому.

Если нужна команда для тестирования маршрутизации видео, её можно создать.

## Статус

| Задача | Статус | Примечание |
|--------|--------|------------|
| Добавить `botName` в falApiData | ✅ ВЫПОЛНЕНО | Строка 100 |
| Добавить `botName` в интерфейс | ✅ ВЫПОЛНЕНО | Строка 381 |
| Улучшить логирование | ✅ ВЫПОЛНЕНО | Строка 92 |
| Исправить fallback маппинг | ✅ ВЫПОЛНЕНО | ai-reels-callback.routes.ts |
| Проверить поддержку Fal.ai | ⏳ ОЖИДАЕТСЯ | Нужно протестировать |

## Результат

После исправления:
- ✅ Видео должно приходить в правильный бот (тот, где создавалось)
- ✅ В логах будет видно, какой `botName` используется
- ✅ Fallback маппинг работает, если `bot_name` не придет в callback
- ✅ Никаких изменений в коде пользователей не требуется

---

**Дата:** 2025-01-12
**Критичность:** Высокая
**Статус:** Готово к тестированию
