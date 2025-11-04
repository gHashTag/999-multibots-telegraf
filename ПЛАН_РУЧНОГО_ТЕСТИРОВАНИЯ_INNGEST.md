# План Ручного Тестирования Inngest Функций

## 🎯 ЦЕЛЬ
Проверить работоспособность всех исправленных Inngest функций на продакшне после деплоя.

## 📊 СТАТИСТИКА ФУНКЦИЙ
**Всего функций:** 18 исправленных
**Категории:**
- ✅ Callback (1): ai-reels-callback
- ✅ Broadcast (1): broadcastMessage
- ✅ Content (5): analyzeCompetitorReels, extractTopContent, findCompetitors, generateContentScripts, generateDetailedScript, generateScenarioClips
- ✅ Generation (1): neuroImageGeneration
- ✅ Instagram (1): instagramScraper-v2
- ✅ Monitoring (2): criticalErrorMonitor, logMonitor
- ✅ Payments (1): paymentProcessing
- ✅ Render (4): render, renderAvatarVideo, renderRiddle, steps
- ✅ Training (2): morphImages, modelTrainingV2

---

## 🔥 ПРИОРИТЕТНЫЕ ТЕСТЫ

### 1️⃣ AI REELS CALLBACK (КРИТИЧЕСКИЙ)
**Endpoint:** `https://three-head-dragon.shop/api/telegram/ai-reels-callback`

#### Тест 1.1 - Health Check
```bash
curl -X GET https://three-head-dragon.shop/api/telegram/ai-reels-callback
```
**Ожидаемый результат:**
```json
{
  "status": "ok",
  "service": "ai-reels-callback",
  "timestamp": "..."
}
```

#### Тест 1.2 - POST Webhook (Railway format)
```bash
curl -X POST https://three-head-dragon.shop/api/telegram/ai-reels-callback \
  -H "Content-Type: application/json" \
  -d '{
    "job_id": "telegram-123456789-1699123456",
    "status": "completed",
    "download_url": "https://example.com/test-video.mp4",
    "metadata": {
      "telegram_id": "123456789"
    }
  }'
```
**Ожидаемый результат:**
- HTTP 202 Accepted
- Логи показывают обработку callback'а

#### Тест 1.3 - Проверка логов
```bash
# Подключиться к серверу и проверить логи
docker logs 999-multibots --tail=100 | grep "AI REELS CALLBACK"
```
**Искать в логах:**
- ✅ `🔔 [AI REELS CALLBACK] Webhook received`
- ✅ `🎬 [AI REELS CALLBACK] Received callback from Railway`

---

### 2️⃣ INNGEST API ENDPOINT
**Endpoint:** `https://three-head-dragon.shop/api/inngest`

#### Тест 2.1 - Проверка доступности
```bash
curl -X GET https://three-head-dragon.shop/api/inngest
```
**Ожидаемый результат:** Inngest отвечает (может быть пустой ответ)

#### Тест 2.2 - Отправка тестового события
```bash
curl -X POST https://three-head-dragon.shop/api/inngest \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ai-reels-callback",
    "data": {
      "job_id": "test-job-123",
      "status": "completed",
      "download_url": "https://example.com/test.mp4"
    }
  }'
```

---

## 📋 ПОЛНЫЙ СПИСОК ФУНКЦИЙ ДЛЯ ПРОВЕРКИ

### ✅ CONTENT (6 функций)
1. **analyzeCompetitorReels** - Анализ конкурентных Reels
2. **extractTopContent** - Извлечение топ контента
3. **findCompetitors** - Поиск конкурентов
4. **generateContentScripts** - Генерация скриптов контента
5. **generateDetailedScript** - Генерация детальных скриптов
6. **generateScenarioClips** - Генерация сценариев клипов

**Тест вызова:**
```bash
curl -X POST https://three-head-dragon.shop/api/inngest \
  -H "Content-Type: application/json" \
  -d '{"name": "generateContentScripts", "data": {"prompt": "test"}}'
```

### ✅ GENERATION (1 функция)
7. **neuroImageGeneration** - Генерация нейроизображений

### ✅ RENDER (4 функции)
8. **render** - Базовый рендер
9. **renderAvatarVideo** - Рендер аватар видео
10. **renderRiddle** - Рендер загадок
11. **render.steps** - Шаги рендера

### ✅ TRAINING (2 функции)
12. **morphImages** - Морфинг изображений
13. **modelTrainingV2** - Тренировка моделей v2

### ✅ INSTAGRAM (1 функция)
14. **instagramScraper-v2** - Скрапинг Instagram v2

### ✅ MONITORING (2 функции)
15. **criticalErrorMonitor** - Мониторинг критических ошибок
16. **logMonitor** - Мониторинг логов

### ✅ PAYMENTS (1 функция)
17. **paymentProcessing** - Обработка платежей

### ✅ BROADCAST (1 функция)
18. **broadcastMessage** - Рассылка сообщений

---

## 🧪 АВТОМАТИЧЕСКИЕ ПРОВЕРКИ

### Через Docker логи
```bash
# Проверить запуск без ошибок импорта
docker logs 999-multibots 2>&1 | grep -E "(error|Error|ERROR|Cannot find module)"

# Ожидаемый результат: НЕТ ошибок MODULE_NOT_FOUND
```

### Через API Health Check
```bash
# Проверить все ключевые endpoints
curl -s https://three-head-dragon.shop/health
curl -s https://three-head-dragon.shop/api/telegram/ai-reels-callback
curl -s https://three-head-dragon.shop/api/inngest
```

---

## 📝 ЧЕКЛИСТ ТЕСТИРОВАНИЯ

- [ ] **1. AI Reels Callback**
  - [ ] GET endpoint отвечает 200 OK
  - [ ] POST endpoint принимает payload
  - [ ] Логи показывают обработку
  - [ ] Нет ошибок импорта

- [ ] **2. Inngest Functions**
  - [ ] Все 18 функций импортируются без ошибок
  - [ ] Сервер запускается без MODULE_NOT_FOUND
  - [ ] API endpoint /api/inngest доступен

- [ ] **3. Docker Build**
  - [ ] Билд проходит без ошибок
  - [ ] Контейнер запускается
  - [ ] Логи чистые от ошибок импорта

- [ ] **4. Nginx Proxy**
  - [ ] /api/telegram/ai-reels-callback проксируется
  - [ ] /api/inngest проксируется
  - [ ] HTTPS работает

---

## 🚨 КРИТЕРИИ УСПЕХА

✅ **УСПЕХ:**
- Сервер запускается без ошибок
- Нет MODULE_NOT_FOUND в логах
- AI Reels Callback endpoint отвечает
- Inngest API доступен
- Все импорты исправлены

❌ **ПРОБЛЕМА:**
- Ошибки MODULE_NOT_FOUND в логах
- Callback endpoint недоступен
- Сервер не запускается
- Docker билд падает

---

## 📞 ЭКСТРЕННЫЕ КОНТАКТЫ

При обнаружении проблем:
1. Проверить логи: `docker logs 999-multibots --tail=200`
2. Перезапустить: `docker restart 999-multibots`
3. Проверить Git коммит: `e3be2333` 🔥
4. Связаться с командой разработки

---

**Дата создания:** 2025-11-04
**Статус:** Активен
**Версия исправлений:** e3be2333
