# Render Server Integration - Диагностика и решение

## ✅ Текущий статус

### Что работает:
- ✅ Render-server доступен: `https://render-v3-production.up.railway.app`
- ✅ Inngest endpoint отвечает: `/api/inngest` → 200 OK
- ✅ 3 функции зарегистрированы: render, render-avatar-video, render-riddle
- ✅ Токены корректные:
  - `INNGEST_EVENT_KEY_RENDER`: kbuLz_G2JL28M5L3dRM5...
  - `INNGEST_SIGNING_KEY_RENDER`: signkey-prod-e2c2...
- ✅ Подпись принимается (нет 401 Unauthorized)

### Текущая проблема:
- ❌ 500 Internal Server Error при отправке события
- Причина: Render-server не может обработать payload

## 🔍 Диагностика

### 1. Проверить логи render-server на Railway

```bash
# Если есть Railway CLI:
railway logs --service render-v3-production

# Или через Railway Dashboard:
# 1. Открыть: https://railway.app
# 2. Найти проект: render-v3-production
# 3. Открыть вкладку: Deployments → Logs
```

**Что искать в логах:**
- `500 Internal Server Error`
- Python traceback
- Ошибки валидации payload
- Missing fields или type errors

### 2. Возможные причины 500 ошибки

#### A. Неправильный формат payload
```python
# Render-server может ожидать другую структуру:
{
  "event": {
    "name": "render/avatar-video",
    "data": { ...payload... }
  }
}
# Вместо:
{
  "name": "render/avatar-video",
  "data": { ...payload... }
}
```

#### B. Отсутствуют обязательные поля
```python
# Возможно требуются дополнительные поля:
{
  "id": "evt_...",
  "v": "1",
  "user": { ...},
  "name": "render/avatar-video",
  "data": { ... }
}
```

#### C. Проблемы с API ключами внутри payload
- Hedra API key неверный или истек
- ElevenLabs API key неверный
- Kie.ai API key неверный

### 3. Проверка через простой payload

Попробуйте отправить **минимальный** payload для тестирования:

```bash
npx tsx tests/test-render-simple-payload.ts
```

## 🛠️ Решения

### Решение 1: Проверить исходный код render-server

**Если есть доступ к коду render-server:**

1. Найти файл функции `render-avatar-video`
2. Проверить схему валидации payload:
   ```python
   # Пример в Python FastAPI:
   @inngest.create_function(
       fn_id="render-avatar-video",
       trigger=inngest.TriggerEvent(event="render/avatar-video")
   )
   async def render_avatar_video(event):
       # Проверить что здесь ожидается
       data = event.data  # или event['data']?
   ```

3. Проверить required fields

### Решение 2: Использовать Railway CLI для прямого доступа

```bash
# Установить Railway CLI
npm install -g @railway/cli

# Логин
railway login

# Подключиться к проекту
railway link

# Проверить переменные окружения
railway variables

# Проверить логи
railway logs
```

### Решение 3: Webhook для debugging

Создать временный webhook endpoint для перехвата запросов:

1. Использовать https://webhook.site
2. Отправить туда наш payload
3. Увидеть точный формат, который мы отправляем
4. Сравнить с ожидаемым форматом

### Решение 4: Спросить у владельца render-server

**Вопросы для владельца render-server:**

1. Какой точный формат payload ожидает функция `render/avatar-video`?
2. Есть ли документация API?
3. Какие обязательные поля в payload?
4. Можно ли получить example request?
5. Где посмотреть логи ошибок?

## 📝 Обновление inngestProvider

После выяснения правильного формата обновить:

```typescript
// src/inngest_app/inngest-provider.ts

async sendEvent(instance, eventName, data) {
  // Возможно нужно обернуть в дополнительную структуру
  const body = {
    name: eventName,
    data: data,
    // Может быть нужны дополнительные поля:
    id: `evt_${Date.now()}`,
    v: "1",
    ts: Date.now(),
    // ...
  }

  // Или использовать прямой POST на render-server:
  if (instance === 'RENDER') {
    return await this.sendDirectToRenderServer(eventName, data)
  }
}
```

## 🔄 Альтернативный подход: HTTP API

Если Inngest не работает, можно использовать прямой HTTP endpoint:

```typescript
// Создать прямой API endpoint на render-server
POST /api/render/avatar-video
Content-Type: application/json

{
  "job_id": "...",
  "eleven_labs_api_key": "...",
  // ... остальные поля
}
```

## 📊 Следующие шаги

1. ✅ **Токены проверены** - они корректные
2. ✅ **Подключение работает** - запросы достигают render-server
3. ⏳ **Нужно узнать**: точный формат payload для render/avatar-video
4. ⏳ **Проверить**: логи render-server на Railway
5. ⏳ **Получить**: документацию API или example request

## 🎯 Текущий результат

```
Тест с точными токенами:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Токены работают
✅ Render-server доступен
✅ Подпись принимается
❌ 500 Internal Server Error (проблема с payload)

Вывод: Интеграция почти готова!
       Нужен только правильный формат payload.
```

## 📞 Контакты

- Render Server: https://render-v3-production.up.railway.app
- Railway Dashboard: https://railway.app
- Inngest Dashboard: https://app.inngest.com
