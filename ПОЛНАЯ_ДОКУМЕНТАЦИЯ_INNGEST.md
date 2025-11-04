# 📚 ПОЛНАЯ ДОКУМЕНТАЦИЯ INNGEST ФУНКЦИЙ

## 🎯 ОБЗОР СИСТЕМЫ

**Дата создания:** 2025-11-04
**Статус:** ✅ Активна
**Версия:** 1.0
**Всего функций:** 27 (24 основные + 3 тестовые)

---

## 📋 СОДЕРЖАНИЕ

1. [Архитектура системы](#архитектура-системы)
2. [Каталог функций](#каталог-функций)
3. [Использование API](#использование-api)
4. [Конфигурация](#конфигурация)
5. [Мониторинг и логи](#мониторинг-и-логи)
6. [Тестирование](#тестирование)
7. [Troubleshooting](#troubleshooting)

---

## 🏗️ АРХИТЕКТУРА СИСТЕМЫ

### Основные компоненты

```
┌─────────────────────────────────────┐
│        Telegram Bot (Tegraf)        │
│   ┌─────────────────────────────┐   │
│   │      Inngest Functions      │   │
│   │   (27 функций в 9 категориях)│   │
│   └─────────────────────────────┘   │
└─────────────────┬───────────────────┘
                  │
┌─────────────────┴───────────────────┐
│        API Server                   │
│   ┌─────────────────────────────┐   │
│   │   /api/inngest              │   │
│   │   /api/telegram/ai-reels-   │   │
│   │          callback           │   │
│   └─────────────────────────────┘   │
└─────────────────┬───────────────────┘
                  │
┌─────────────────┴───────────────────┐
│        Nginx Proxy                  │
│   https://three-head-dragon.shop   │
└─────────────────────────────────────┘
```

### Структура файлов

```
/src/inngest_app/
├── functions/           # Все 27 функций
│   ├── ai-reels-callback.ts          ✅
│   ├── broadcast/
│   │   └── broadcastMessage.ts       ✅
│   ├── content/                      ✅ (6 функций)
│   ├── existing/                     ✅ (3 функции)
│   ├── generation/                   ✅ (1 функция)
│   ├── instagram/                    ✅ (2 функции)
│   ├── monitoring/                   ✅ (4 функции)
│   ├── payments/                     ✅ (1 функция)
│   ├── render/                       ✅ (3 функции)
│   ├── training/                     ✅ (2 функции)
│   └── test/                         ✅ (3 функции)
├── registerFunctions.ts              ✅ Регистрация всех функций
├── client.ts                         ✅ Inngest клиент
├── inngest-provider.ts               ✅ Провайдер
└── send-event.ts                     ✅ Отправка событий
```

---

## 📚 КАТАЛОГ ФУНКЦИЙ

### 🔴 КРИТИЧЕСКИЕ ФУНКЦИИ

#### 1. ai-reels-callback (Callback)
**Файл:** `ai-reels-callback.ts`
**Описание:** Обработка callback'а от Railway render-server
**Событие:** `ai-reels-callback`
**Статус:** ✅ Перенесено и работает

**Параметры:**
```typescript
{
  job_id: string              // ID задачи в формате telegram-{id}-{timestamp}
  status: 'completed'|'failed'|'processing'
  download_url?: string       // Ссылка на готовое видео
  metadata?: {
    telegram_id: string       // Telegram ID пользователя
    bot_name?: string         // Имя бота
  }
}
```

**Использование:**
```javascript
await inngest.send({
  name: 'ai-reels-callback',
  data: {
    job_id: 'telegram-123456789-1699123456',
    status: 'completed',
    download_url: 'https://example.com/video.mp4',
    metadata: { telegram_id: '123456789' }
  }
})
```

---

### 🎨 CONTENT ФУНКЦИИ (6)

#### 2. analyzeCompetitorReels
**Файл:** `content/analyzeCompetitorReels.ts`
**Описание:** Анализ конкурентных Reels
**Событие:** `analyze-competitor-reels`
**Статус:** ✅ Перенесено

#### 3. extractTopContent
**Файл:** `content/extractTopContent.ts`
**Описание:** Извлечение топ контента
**Событие:** `extract-top-content`
**Статус:** ✅ Перенесено

#### 4. findCompetitors
**Файл:** `content/findCompetitors.ts`
**Описание:** Поиск конкурентов
**Событие:** `find-competitors`
**Статус:** ✅ Перенесено

#### 5. generateContentScripts
**Файл:** `content/generateContentScripts.ts`
**Описание:** Генерация скриптов контента
**Событие:** `generate-content-scripts`
**Статус:** ✅ Перенесено

#### 6. generateDetailedScript
**Файл:** `content/generateDetailedScript.ts`
**Описание:** Генерация детальных скриптов
**Событие:** `generate-detailed-script`
**Статус:** ✅ Перенесено

#### 7. generateScenarioClips
**Файл:** `content/generateScenarioClips.ts`
**Описание:** Генерация сценариев клипов
**Событие:** `generate-scenario-clips`
**Статус:** ✅ Перенесено

---

### 🎬 RENDER ФУНКЦИИ (3)

#### 8. render
**Файл:** `render/render.ts`
**Описание:** Основной рендер видео через nexrender
**Событие:** `render`
**Статус:** ✅ Перенесено

**Параметры:**
```typescript
{
  job_id: string
  template_url: string
  job_json_url: string
  composition_name: string
  render_type: 'create'|'update'
  server_url: string
  server_port: number
  server_user: string
  callback_url?: string
}
```

#### 9. renderAvatarVideo
**Файл:** `render/renderAvatarVideo.ts`
**Описание:** Рендер аватар видео с HeyGen
**Событие:** `render-avatar-video`
**Статус:** ✅ Перенесено

#### 10. renderRiddle
**Файл:** `render/renderRiddle.ts`
**Описание:** Рендер загадок
**Событие:** `render-riddle`
**Статус:** ✅ Перенесено

---

### 🎓 TRAINING ФУНКЦИИ (2)

#### 11. modelTrainingV2
**Файл:** `training/modelTrainingV2.ts`
**Описание:** Тренировка моделей через Replicate
**Событие:** `model-training-v2`
**Статус:** ✅ Перенесено

#### 12. morphImages
**Файл:** `training/morphImages.ts`
**Описание:** Морфинг изображений
**Событие:** `morph-images`
**Статус:** ✅ Перенесено

---

### 📱 INSTAGRAM ФУНКЦИИ (2)

#### 13. instagramScraperV2
**Файл:** `instagram/instagramScraper-v2.ts`
**Описание:** Скрапинг Instagram постов
**События:**
- `instagram-scraper-v2` (основная функция)
- `create-instagram-user` (создание пользователя)
**Статус:** ✅ Перенесено

#### 14. instagramScraperV2Simple
**Файл:** `instagram/instagramScraper-v2-simple.ts`
**Описание:** Упрощенный скрапинг
**Событие:** `instagram-scraper-v2-simple`
**Статус:** ✅ Перенесено

---

### 📊 MONITORING ФУНКЦИИ (4)

#### 15. criticalErrorMonitor
**Файл:** `monitoring/criticalErrorMonitor.ts`
**Описание:** Мониторинг критических ошибок
**События:**
- `critical-error-monitor` (мониторинг)
- `health-check` (проверка здоровья)
**Статус:** ✅ Перенесено

#### 16. logMonitor
**Файл:** `monitoring/logMonitor.ts`
**Описание:** Мониторинг логов системы
**События:**
- `log-monitor` (мониторинг)
- `trigger-log-monitor` (триггер)
**Статус:** ✅ Перенесено

---

### ⚡ GENERATION ФУНКЦИИ (1)

#### 17. neuroImageGeneration
**Файл:** `generation/neuroImageGeneration.ts`
**Описание:** Генерация нейроизображений
**Событие:** `neuro-image-generation`
**Статус:** ✅ Перенесено

---

### 💰 PAYMENT ФУНКЦИИ (1)

#### 18. paymentProcessing
**Файл:** `payments/paymentProcessing.ts`
**Описание:** Обработка платежей
**Событие:** `payment-processing`
**Статус:** ✅ Перенесено

---

### 📢 BROADCAST ФУНКЦИИ (1)

#### 19. broadcastMessage
**Файл:** `broadcast/broadcastMessage.ts`
**Описание:** Рассылка сообщений
**Событие:** `broadcast-message`
**Статус:** ✅ Перенесено

---

### 🔄 EXISTING ФУНКЦИИ (3)

#### 20. generateAIReelsFunction
**Файл:** `existing/generateAIReelsFunction.ts`
**Описание:** Генерация AI Reels
**Событие:** `generate-ai-reels`
**Статус:** ✅ Перенесено

#### 21. generateAdvancedLoopingVideoFunction
**Файл:** `existing/generateAdvancedLoopingVideoFunction.ts`
**Описание:** Генерация зацикленных видео
**Событие:** `generate-advanced-looping-video`
**Статус:** ✅ Перенесено

#### 22. generateModelTrainingFunction
**Файл:** `existing/generateModelTrainingFunction.ts`
**Описание:** Генерация тренировки моделей
**Событие:** `generate-model-training`
**Статус:** ✅ Перенесено

---

### 🧪 ТЕСТОВЫЕ ФУНКЦИИ (3)

#### 23. testSimpleFunction
**Файл:** `testSimpleFunction.ts`
**Описание:** Простая тестовая функция
**Событие:** `test-simple`
**Статус:** ✅ Перенесено
**⚠️ ВНИМАНИЕ:** Используется для разработки

#### 24. testAdvancedLoopFunction
**Файл:** `testAdvancedLoopFunction.ts`
**Описание:** Продвинутая тестовая функция
**Событие:** `test-advanced-loop`
**Статус:** ✅ Перенесено
**⚠️ ВНИМАНИЕ:** Используется для разработки

#### 25. testSimpleMessageFunction
**Файл:** `testSimpleMessageFunction.ts`
**Описание:** Тестовая функция сообщений
**Событие:** `test-simple-message`
**Статус:** ✅ Перенесено
**⚠️ ВНИМАНИЕ:** Используется для разработки

---

## 🔗 ИСПОЛЬЗОВАНИЕ API

### Основные endpoints

#### 1. Inngest Functions API
**URL:** `https://three-head-dragon.shop/api/inngest`
**Методы:** GET, POST

**GET** - Health Check:
```bash
curl https://three-head-dragon.shop/api/inngest
```

**POST** - Отправка события:
```bash
curl -X POST https://three-head-dragon.shop/api/inngest \
  -H "Content-Type: application/json" \
  -d '{
    "name": "функция-событие",
    "data": {
      "параметр1": "значение1",
      "параметр2": "значение2"
    }
  }'
```

#### 2. AI Reels Callback
**URL:** `https://three-head-dragon.shop/api/telegram/ai-reels-callback`
**Методы:** GET, POST

**GET** - Health Check:
```bash
curl https://three-head-dragon.shop/api/telegram/ai-reels-callback
# Ответ: {"status": "ok", "service": "ai-reels-callback", "timestamp": "..."}
```

**POST** - Webhook от Railway:
```bash
curl -X POST https://three-head-dragon.shop/api/telegram/ai-reels-callback \
  -H "Content-Type: application/json" \
  -d '{
    "job_id": "telegram-123-456",
    "status": "completed",
    "download_url": "https://example.com/video.mp4",
    "metadata": {
      "telegram_id": "123456789"
    }
  }'
```

---

## ⚙️ КОНФИГУРАЦИЯ

### Переменные окружения

#### Обязательные
```bash
# Inngest
BOT_INNGEST_EVENT_KEY=your_event_key_here

# Telegram
TELEGRAM_BOT_TOKEN_AI_STARS=your_bot_token
TELEGRAM_BOT_TOKEN=your_bot_token

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

#### Дополнительные
```bash
# Render Server
RENDER_SERVER_URL=https://your-render-server.com
RENDER_SERVER_PORT=22
RENDER_SERVER_USER=your_user

# S3
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1
S3_BUCKET_NAME=your-bucket
```

### Настройка клиента

**Файл:** `src/inngest_app/client.ts`
```typescript
const config = {
  name: 'telegram-bot-client',
  id: 'telegram-bot-client',
  baseUrl: process.env.NODE_ENV === 'development'
    ? 'http://localhost:3000'
    : 'https://three-head-dragon.shop/api/inngest',
  isDev: process.env.NODE_ENV === 'development',
  eventKey: process.env.NODE_ENV === 'production'
    ? process.env.BOT_INNGEST_EVENT_KEY
    : undefined,
}
```

---

## 📊 МОНИТОРИНГ И ЛОГИ

### Просмотр логов

#### Docker контейнер
```bash
# Все логи
docker logs 999-multibots

# Последние 100 строк
docker logs 999-multibots --tail=100

# Логи конкретной функции
docker logs 999-multibots | grep "[ФУНКЦИЯ]"
```

#### Фильтрация по функции
```bash
# Логи AI Reels Callback
docker logs 999-multibots | grep "AI REELS CALLBACK"

# Логи Content функций
docker logs 999-multibots | grep "CONTENT"

# Логи ошибок
docker logs 999-multibots | grep -i "error\|Error\|ERROR"
```

### Мониторинг статуса

#### Health Checks
```bash
# Проверка Inngest API
curl -s https://three-head-dragon.shop/api/inngest

# Проверка Callback
curl -s https://three-head-dragon.shop/api/telegram/ai-reels-callback

# Проверка основного сервера
curl -s https://three-head-dragon.shop/health
```

#### Статистика функций
```javascript
// Получить статистику зарегистрированных функций
import { getFunctionStatus } from '@/inngest_app/registerFunctions'

const status = getFunctionStatus()
console.log(status)
// {
//   total: 27,
//   names: ['ai-reels-callback', ...],
//   categories: { content: 6, render: 3, ... }
// }
```

---

## 🧪 ТЕСТИРОВАНИЕ

### Ручное тестирование

#### Полный план тестирования
См. файл: `ПЛАН_РУЧНОГО_ТЕСТИРОВАНИЯ_INNGEST.md`

#### Быстрые тесты
```bash
# Тест 1: Health Check
curl https://three-head-dragon.shop/api/telegram/ai-reels-callback

# Тест 2: Отправка простого события
curl -X POST https://three-head-dragon.shop/api/inngest \
  -H "Content-Type: application/json" \
  -d '{"name": "test-simple", "data": {}}'

# Тест 3: Callback с тестовыми данными
curl -X POST https://three-head-dragon.shop/api/telegram/ai-reels-callback \
  -H "Content-Type: application/json" \
  -d '{"job_id": "test-123", "status": "completed", "download_url": "https://example.com/test.mp4"}'
```

#### Проверка регистрации функций
```javascript
import { allInngestFunctions } from '@/inngest_app/registerFunctions'

console.log(`Всего зарегистрировано: ${allInngestFunctions.length} функций`)
console.log('Функции:', allInngestFunctions.map(f => f.name))
```

### Автоматическое тестирование

**❌ НЕТ АВТОМАТИЧЕСКИХ ТЕСТОВ**

Все функции требуют ручного тестирования через:
- Postman/Insomnia
- curl команды
- Взаимодействие через Telegram бота

---

## 🔧 TROUBLESHOOTING

### Проблема: Функция не запускается

#### Диагностика
1. Проверить регистрацию:
```javascript
import { allInngestFunctions } from '@/inngest_app/registerFunctions'
console.log(allInngestFunctions.map(f => f.name))
```

2. Проверить логи:
```bash
docker logs 999-multibots | grep -i "error"
```

3. Проверить health check:
```bash
curl https://three-head-dragon.shop/api/inngest
```

#### Решение
1. Перезапустить контейнер:
```bash
docker restart 999-multibots
```

2. Проверить переменные окружения
3. Проверить импорты в файле функции

---

### Проблема: MODULE_NOT_FOUND

#### Диагностика
```bash
docker logs 999-multibots | grep "MODULE_NOT_FOUND"
```

#### Решение
1. Проверить импорт в файле:
```typescript
// НЕПРАВИЛЬНО:
import { inngest } from '@/core/inngest/clients'

// ПРАВИЛЬНО:
import { inngest } from '../../../inngest_app/client'
```

2. Исправить импорты (см. коммит `6a0799c4`)

---

### Проблема: Callback не работает

#### Диагностика
```bash
curl https://three-head-dragon.shop/api/telegram/ai-reels-callback
# Должен вернуть: {"status": "ok", ...}
```

#### Решение
1. Проверить регистрацию роута в `src/api_server/index.ts`
2. Проверить проксирование в nginx
3. Проверить логи:
```bash
docker logs 999-multibots | grep "AI REELS CALLBACK"
```

---

## 📈 МЕТРИКИ И АНАЛИТИКА

### Отслеживаемые метрики

#### Функции
- Количество вызовов каждой функции
- Время выполнения
- Количество ошибок
- Статус успешности

#### Система
- Загрузка CPU/Memory
- Использование диска
- Сетевые запросы
- Размер базы данных

#### Бизнес-метрики
- Количество обработанных callback'ов
- Количество отправленных видео
- Количество сгенерированного контента
- Количество платежей

### Инструменты мониторинга

#### Встроенные
- `criticalErrorMonitor` - мониторинг критических ошибок
- `logMonitor` - мониторинг логов
- `healthCheck` - проверка здоровья системы

#### Внешние
- Логи Docker
- Supabase Analytics
- Telegram Bot Logs

---

## 🔄 ЖИЗНЕННЫЙ ЦИКЛ ФУНКЦИИ

### 1. Создание функции
```typescript
// 1. Создать файл в /src/inngest_app/functions/категория/
// 2. Написать функцию:
export const myFunction = inngest.createFunction(
  {
    id: 'my-function',
    name: 'My Function',
    retries: 3,
  },
  { event: 'my-event' },
  async ({ event, step, logger }) => {
    // Логика функции
    return { success: true }
  }
)
```

### 2. Регистрация
```typescript
// Добавить в registerFunctions.ts
import { myFunction } from './functions/категория/файл'

export const allInngestFunctions = [
  // ... другие функции
  myFunction,
]
```

### 3. Экспорт
```typescript
// Добавить в index.ts
export { myFunction } from './functions/категория/файл'
```

### 4. Тестирование
- Ручное тестирование
- Проверка health check
- Проверка в логах

### 5. Деплой
```bash
git add .
git commit -m "feat: добавить новую функцию"
git push origin production
# Запустить deploy
```

---

## 🎯 ПРИМЕРЫ ИСПОЛЬЗОВАНИЯ

### Пример 1: Отправка callback'а

```javascript
import { inngest } from '@/inngest_app/client'

// Внутри Telegram бота
bot.on('video', async (ctx) => {
  // ... обработка видео

  // Отправить на рендер
  await inngest.send({
    name: 'ai-reels-generate',
    data: {
      telegram_id: ctx.from.id,
      video_url: ctx.message.video.file_id,
      // ... другие параметры
    }
  })
})
```

### Пример 2: Получение callback'а

```javascript
// Railway render-server отправляет webhook
POST https://three-head-dragon.shop/api/telegram/ai-reels-callback
{
  "job_id": "telegram-123456789-1699123456",
  "status": "completed",
  "download_url": "https://cdn.railway.app/jobs/123/video.mp4",
  "metadata": {
    "telegram_id": "123456789"
  }
}
```

### Пример 3: Рендер видео

```javascript
await inngest.send({
  name: 'render',
  data: {
    job_id: 'job-123',
    template_url: 'https://example.com/template.aep',
    job_json_url: 'https://example.com/job.json',
    composition_name: 'MainComposition',
    render_type: 'create',
    server_url: 'render-server.com',
    server_port: 22,
    server_user: 'ubuntu',
    callback_url: 'https://three-head-dragon.shop/api/telegram/ai-reels-callback'
  }
})
```

---

## 📞 ПОДДЕРЖКА И КОНТАКТЫ

### При возникновении проблем

1. **Проверить логи:**
```bash
docker logs 999-multibots --tail=200 | grep -i error
```

2. **Проверить статус сервиса:**
```bash
curl https://three-head-dragon.shop/api/telegram/ai-reels-callback
```

3. **Перезапустить контейнер:**
```bash
docker restart 999-multibots
```

4. **Проверить Git коммит:**
```bash
git log --oneline -1
# Должен быть: 6a0799c4
```

### Контактная информация

- **Разработчик:** Claude Code Agent
- **Дата создания:** 2025-11-04
- **Версия документации:** 1.0
- **Статус:** ✅ Активна

---

## 📚 СВЯЗАННЫЕ ДОКУМЕНТЫ

1. `ПОЛНЫЙ_РЕЕСТР_INNGEST_ФУНКЦИЙ.md` - Подробный реестр всех функций
2. `ПЛАН_РУЧНОГО_ТЕСТИРОВАНИЯ_INNGEST.md` - План тестирования
3. `ИТОГОВЫЙ_ОТЧЕТ_ВОССТАНОВЛЕНИЕ_CALLBACK.md` - Отчет о восстановлении
4. `src/inngest_app/registerFunctions.ts` - Регистрация функций
5. `src/api_server/index.ts` - Настройка API сервера

---

**✅ КОНЕЦ ДОКУМЕНТАЦИИ**

Этот документ содержит полную информацию о всех 27 Inngest функциях системы.
