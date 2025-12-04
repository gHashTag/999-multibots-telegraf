# ОТЧЕТ: Анализ таймаутов генерации видео

## Проблема

**Симптомы:**
- ❌ "SERVER DOWN ALERT (I2V)" - основной сервер недоступен
- ❌ "Plan B polling timeout" после 10 секунд
- ✅ Видео всё равно приходит через webhook
- ❌ Пользователь получает лишние сообщения об ошибках

## root Cause Analysis

### 1. Таймауты слишком короткие

**Файл:** `/src/modules/videoGenerator/generateImageToVideo.ts:918-919`

```typescript
const maxPollingAttempts = 5 // 5 попыток = ~10 секунд (2 сек * 5)
const pollingInterval = 2000 // 2 секунды между проверками
```

**Проблема:** 10 секунд недостаточно для Veo 3 Fast:
- Реальное время генерации: 30-60 секунд или больше
- Система таймаутится через 10 секунд

### 2. Лишние уведомления

**Файл:** `/src/modules/videoGenerator/generateImageToVideo.ts:56-68`

Админские уведомления отправляются **всем админам**, включая пользователя 144022504 (который является админом). Пользователь видит:
1. "SERVER DOWN ALERT" (админское сообщение)
2. "Plan B polling timeout" (сообщение об ошибке)
3. ✅ "Видео готово!" (успех)

### 3. Конфликт Plan A и Plan B

**Plan A (webhook):** ✅ Работает! Видео приходит через callback
**Plan B (polling):** ❌ Таймаутится, но не критично

Проблема в том, что пользователю отправляется сообщение о таймауте, даже если видео придет через webhook.

## Исправления

### 1. ✅ Увеличить таймауты Plan B (приоритет: высокий)

**Файл:** `/src/modules/videoGenerator/generateImageToVideo.ts`

**Было:**
```typescript
const maxPollingAttempts = 5 // 5 попыток = ~10 секунд
const pollingInterval = 2000 // 2 секунды между проверками
```

**Стало:**
```typescript
const maxPollingAttempts = 60 // 60 попыток = ~2 минуты
const pollingInterval = 2000 // 2 секунды между проверками
```

### 2. ✅ Улучшить логику уведомлений (приоритет: высокий)

**Файл:** `/src/modules/videoGenerator/generateImageToVideo.ts:1296-1326`

**Добавить проверку:**
```typescript
// Если после всех попыток видео не готово
if (attempts >= maxPollingAttempts) {
  // Проверяем, пришло ли видео через webhook
  const taskExists = videoTaskStore.getTask(taskId)
  if (taskExists?.videoUrl) {
    logger.info('[I2V BG] Video already received via webhook, skipping timeout message')
    return // НЕ отправляем сообщение о таймауте
  }

  // Отправляем сообщение только если видео действительно не пришло
  // ... существующий код ...
}
```

### 3. ✅ Не отправлять админские уведомления пользователям

**Файл:** `/src/modules/videoGenerator/generateImageToVideo.ts:56-68`

**Изменить логику:**
```typescript
const errorMessage =
  `🚨 <b>SERVER DOWN ALERT (I2V)</b>\n\n` +
  // ... текст сообщения ...

// Отправляем ТОЛЬКО техническим админам, НЕ пользователю
const technicalAdmins = ADMIN_IDS_ARRAY.filter(id => id !== telegram_id)
for (const adminId of technicalAdmins) {
  await botResult.bot.telegram.sendMessage(adminId, errorMessage, {
    parse_mode: 'HTML',
  })
}
```

### 4. ✅ Улучшить логирование

**Добавить в логи:**
```typescript
logger.info('[I2V BG] Plan B started', {
  telegramId,
  taskId,
  serverStatus: 'down',
  willUseWebhook: true, // webhook-first система
})

logger.info('[I2V BG] Plan A webhook received video', {
  telegramId,
  taskId,
  videoUrl: taskContext.videoUrl,
  planBWillBeCancelled: true,
})
```

## Тестирование

### Что проверить:
1. Создать видео через Veo 3 Fast
2. Проверить, что таймауты увеличены (60 попыток = 2 минуты)
3. Убедиться, что лишние сообщения НЕ приходят
4. Проверить, что видео всё равно приходит через webhook

### Команды для проверки:
```bash
# Проверить логи
tail -f logs/app.log | grep "Plan B"
tail -f logs/app.log | grep "webhook"

# Проверить количество попыток
tail -f logs/app.log | grep "polling attempt"
```

## Ферма ботов

Текущая конфигурация таймаутов влияет на всех ботов в ферме:
- `neuro_blogger_bot`
- `MetaMuse_Manifest_bot`
- `ZavaraBot`
- `LeeSolarbot`
- И все остальные боты

Исправления будут применены ко всем ботам.

## Статус исправлений

| Задача | Приоритет | Статус |
|--------|-----------|--------|
| Увеличить таймауты Plan B | Высокий | Готово к реализации |
| Убрать лишние уведомления | Высокий | Готово к реализации |
| Улучшить логирование | Средний | Готово к реализации |
| Тестирование | Высокий | Ожидает |

## Результат

После исправлений:
- ✅ Plan B будет ждать до 2 минут (вместо 10 секунд)
- ✅ Пользователь НЕ получит сообщение о таймауте, если видео придет через webhook
- ✅ Админские уведомления не будут путать пользователей
- ✅ Webhook-механизм останется основным (plan A)
- ✅ Видео будет приходить стабильно во все боты фермы

---

**Дата:** 2025-01-12
**Критичность:** Средняя (видео всё равно приходит, но пользователь видит ошибки)
**Статус:** Готово к реализации
