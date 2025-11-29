# 🧪 Руководство по тестированию Webhook для Model Training

## ✅ Статус: Готово к тестированию

### 📋 Что работает:

1. **Webhook Endpoint**: `/api/webhooks/replicate`
   - ✅ HTTP: `http://188.137.250.69:3001/api/webhooks/replicate`
   - ✅ HTTPS: `https://three-head-dragon.shop/api/webhooks/replicate` (через nginx)

2. **Inngest Functions**:
   - ✅ `generateModelTrainingFunction` - создает тренировку на Replicate
   - ✅ `handleModelTrainingCompleted` - обрабатывает завершение тренировки

3. **Обработка ошибок**:
   - ✅ Тестовые webhook'и не вызывают ошибок (возвращают `skipped: true`)
   - ✅ Каждый шаг возвращает детальный результат

4. **Уведомления пользователю**:
   - ✅ При успешной тренировке отправляется сообщение с:
     - Названием модели
     - Trigger word (жирным)
     - Инструкцией по использованию
     - Примером промпта

---

## 🧪 Как протестировать:

### 1. Тест Webhook Endpoint (HTTP)

```bash
curl -X POST http://188.137.250.69:3001/api/webhooks/replicate \
  -H "Content-Type: application/json" \
  -d '{
    "id": "test-training-123",
    "status": "succeeded",
    "model": "ostris/flux-dev-lora-trainer",
    "version": "e440909d3512c31646ee2e0c7d6f6f4923224863a6a10c494606e79fb5844497",
    "input": {
      "trigger_word": "TEST_TRIGGER",
      "steps": 1000
    },
    "output": {
      "version": "abc123def456",
      "weights": "https://replicate.delivery/pbxt/test.safetensors"
    }
  }'
```

**Ожидаемый ответ:**
```json
{
  "success": true,
  "training_id": "test-training-123",
  "status": "succeeded",
  "elapsed_ms": 500,
  "message": "Webhook received and forwarded to Inngest"
}
```

### 2. Тест Webhook Endpoint (HTTPS)

```bash
curl -X POST https://three-head-dragon.shop/api/webhooks/replicate \
  -H "Content-Type: application/json" \
  -d '{
    "id": "test-training-456",
    "status": "succeeded",
    "model": "ostris/flux-dev-lora-trainer",
    "version": "v1",
    "input": {"trigger_word": "TEST", "steps": 1000},
    "output": {"version": "v1", "weights": "https://test.com/weights.safetensors"}
  }'
```

### 3. Тест полного цикла (с реальной тренировкой)

1. **Запустить тренировку модели** через Telegram бота:
   - Выбрать "Цифровой аватар"
   - Выбрать пол
   - Ввести название модели
   - Выбрать количество шагов
   - Загрузить изображения

2. **Проверить Inngest функцию** `model/training.start`:
   - Должна создать тренировку на Replicate
   - Должна сохранить запись в БД
   - Должна отправить уведомление пользователю

3. **Дождаться завершения тренировки** на Replicate (1-2 часа)

4. **Проверить webhook**:
   - Replicate отправит webhook на `https://three-head-dragon.shop/api/webhooks/replicate`
   - Webhook handler отправит событие `model/training.completed` в Inngest
   - Inngest функция обновит БД и отправит уведомление пользователю

---

## 🔍 Проверка логов:

### Webhook Handler:
```bash
# На сервере
docker logs 999-multibots --tail 100 | grep "REPLICATE WEBHOOK"
```

**Ожидаемые логи:**
```
[REPLICATE WEBHOOK] Received webhook
[REPLICATE WEBHOOK] ✅ Event sent to Inngest
[REPLICATE WEBHOOK] Webhook processed successfully
```

### Inngest Function:
```bash
# В Inngest Dashboard
# Проверить функцию "Model Training Completed Handler"
# Должны быть видны шаги:
# 1. find-training-record
# 2. update-training-status
# 3. send-telegram-notification
```

---

## ⚠️ Известные проблемы:

1. **HTTPS через nginx**: 
   - Если webhook возвращает 404 через HTTPS, проверить nginx конфигурацию
   - Убедиться, что `/api/webhooks` проксируется на порт 3000

2. **Тестовые webhook'и**:
   - Если `training_id` не найден в БД, функция вернет `skipped: true`
   - Это нормально для тестовых webhook'ов

---

## 📝 Структура данных:

### Replicate Webhook Payload:
```typescript
{
  id: string              // Replicate training ID
  status: 'succeeded' | 'failed' | 'canceled'
  model: string           // e.g., "ostris/flux-dev-lora-trainer"
  version: string         // Model version hash
  input: {
    trigger_word: string
    steps: number
  }
  output?: {
    version: string       // Trained model version
    weights: string       // URL to weights file
  }
  error?: string
}
```

### Inngest Event `model/training.completed`:
```typescript
{
  name: 'model/training.completed',
  data: {
    training_id: string
    status: 'succeeded' | 'failed' | 'canceled'
    model?: string
    version?: string
    output?: {
      version: string
      weights: string
    }
    error?: string
    telegram_id?: string  // Optional, from DB lookup
    bot_name?: string     // Optional, from DB lookup
  }
}
```

---

## ✅ Чек-лист перед production:

- [x] Webhook endpoint доступен через HTTP
- [x] Webhook endpoint доступен через HTTPS (через nginx)
- [x] Inngest функции зарегистрированы
- [x] Обработка ошибок реализована
- [x] Уведомления пользователю работают
- [x] Детальные результаты в каждом шаге
- [ ] Тест с реальной тренировкой (требуется запуск через бота)

---

**Последнее обновление:** 2025-11-28
**Статус:** ✅ Готово к тестированию

