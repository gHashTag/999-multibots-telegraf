# 🔍 Диагностика Webhook для Model Training

## 📊 Найденные проблемы

### 1️⃣ **PUBLIC_URL не установлен в контейнере**
- **Симптом**: `PUBLIC_URL: NOT SET`, `BASE_WEBHOOK_URL: NOT SET`
- **Причина**: Переменные окружения не загружаются из Infisical в Inngest функции
- **Последствие**: Webhook URL был `undefined/api/webhooks/replicate`, Replicate не смог отправить webhook

### 2️⃣ **Webhook endpoint возвращает 404**
- **Симптом**: `curl https://three-head-dragon.shop/api/webhooks/replicate` → 404
- **Причина**: Nginx не проксирует запрос или маршрут не зарегистрирован
- **Проверка**: Маршрут зарегистрирован в `src/api_server/index.ts:89`

### 3️⃣ **Запись в БД не сохранилась**
- **Симптом**: `Training record not found` в логах
- **Причина**: Ошибка с колонкой `is_ru` при сохранении
- **Последствие**: Webhook не может найти запись для обновления

## ✅ Исправления

### Исправление 1: Fallback для webhook URL
```typescript
// src/inngest_app/functions/existing/generateModelTrainingFunction.ts
const publicUrl =
  PUBLIC_URL ||
  process.env.BASE_WEBHOOK_URL ||
  (process.env.NODE_ENV === 'production'
    ? 'https://three-head-dragon.shop'
    : 'http://localhost:3000')
const webhookUrl = `${publicUrl}/api/webhooks/replicate`
```

### Исправление 2: Проверка доступности endpoint
- Нужно проверить nginx конфигурацию
- Убедиться, что `/api/webhooks/*` проксируется на порт 3000

### Исправление 3: Улучшенная обработка ошибок БД
- Уже исправлено: `is_ru` добавляется только если определено
- Нужно проверить, почему запись не сохранилась для `bwx6erm255rm80ctsf39cxzgec`

## 🔧 Следующие шаги

1. ✅ Исправить fallback для webhook URL (сделано)
2. ⏳ Проверить nginx конфигурацию
3. ⏳ Проверить, почему запись не сохранилась в БД
4. ⏳ Протестировать webhook после исправлений

