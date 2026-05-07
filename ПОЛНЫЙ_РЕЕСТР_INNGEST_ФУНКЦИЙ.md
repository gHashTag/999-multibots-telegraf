# 📋 ПОЛНЫЙ РЕЕСТР INNGEST ФУНКЦИЙ

## 📊 ОБЩАЯ СТАТИСТИКА

**Всего функций:** 27
**Основные функции:** 24
**Тестовые функции:** 3
**Категорий:** 9

---

## 🗂️ КАТЕГОРИИ ФУНКЦИЙ

### 1️⃣ CONTENT (6 функций)
**Путь:** `/src/inngest_app/functions/content/`

| № | Функция | Описание | Статус |
|---|---------|----------|--------|
| 1 | `analyzeCompetitorReelsFunction` | Анализ конкурентных Reels | ✅ Перенесено |
| 2 | `extractTopContentFunction` | Извлечение топ контента | ✅ Перенесено |
| 3 | `findCompetitorsFunction` | Поиск конкурентов | ✅ Перенесено |
| 4 | `generateContentScriptsFunction` | Генерация скриптов контента | ✅ Перенесено |
| 5 | `generateDetailedScriptFunction` | Генерация детальных скриптов | ✅ Перенесено |
| 6 | `generateScenarioClipsFunction` | Генерация сценариев клипов | ✅ Перенесено |

### 2️⃣ RENDER (3 функции)
**Путь:** `/src/inngest_app/functions/render/`

| № | Функция | Описание | Статус |
|---|---------|----------|--------|
| 7 | `renderFunction` | Основной рендер видео | ✅ Перенесено |
| 8 | `renderAvatarVideoFunction` | Рендер аватар видео | ✅ Перенесено |
| 9 | `renderRiddleFunction` | Рендер загадок | ✅ Перенесено |

### 3️⃣ TRAINING (2 функции)
**Путь:** `/src/inngest_app/functions/training/`

| № | Функция | Описание | Статус |
|---|---------|----------|--------|
| 10 | `modelTrainingV2Function` | Тренировка моделей v2 | ✅ Перенесено |
| 11 | `morphImagesFunction` | Морфинг изображений | ✅ Перенесено |

### 4️⃣ INSTAGRAM (2 функции)
**Путь:** `/src/inngest_app/functions/instagram/`

| № | Функция | Описание | Статус |
|---|---------|----------|--------|
| 12 | `instagramScraperV2Function` | Скрапинг Instagram v2 | ✅ Перенесено |
| 13 | `instagramScraperV2SimpleFunction` | Упрощенный скрапинг | ✅ Перенесено |

### 5️⃣ MONITORING (4 функции)
**Путь:** `/src/inngest_app/functions/monitoring/`

| № | Функция | Описание | Статус |
|---|---------|----------|--------|
| 14 | `criticalErrorMonitorFunction` | Мониторинг критических ошибок | ✅ Перенесено |
| 15 | `healthCheckFunction` | Проверка здоровья системы | ✅ Перенесено |
| 16 | `logMonitorFunction` | Мониторинг логов | ✅ Перенесено |
| 17 | `triggerLogMonitorFunction` | Триггер мониторинга логов | ✅ Перенесено |

### 6️⃣ EXISTING (3 функции)
**Путь:** `/src/inngest_app/functions/existing/`

| № | Функция | Описание | Статус |
|---|---------|----------|--------|
| 18 | `generateAIReelsFunction` | Генерация AI Reels | ✅ Перенесено |
| 19 | `generateAdvancedLoopingVideoFunction` | Генерация зацикленных видео | ✅ Перенесено |
| 20 | `generateModelTrainingFunction` | Генерация тренировки моделей | ✅ Перенесено |

### 7️⃣ GENERATION (1 функция)
**Путь:** `/src/inngest_app/functions/generation/`

| № | Функция | Описание | Статус |
|---|---------|----------|--------|
| 21 | `neuroImageGenerationFunction` | Генерация нейроизображений | ✅ Перенесено |

### 8️⃣ PAYMENT (1 функция)
**Путь:** `/src/inngest_app/functions/payments/`

| № | Функция | Описание | Статус |
|---|---------|----------|--------|
| 22 | `paymentProcessingFunction` | Обработка платежей | ✅ Перенесено |

### 9️⃣ BROADCAST (1 функция)
**Путь:** `/src/inngest_app/functions/broadcast/`

| № | Функция | Описание | Статус |
|---|---------|----------|--------|
| 23 | `broadcastMessageFunction` | Рассылка сообщений | ✅ Перенесено |

### 🔟 CALLBACK (1 функция)
**Путь:** `/src/inngest_app/functions/`

| № | Функция | Описание | Статус |
|---|---------|----------|--------|
| 24 | `aiReelsCallbackFunction` | Обработка callback'а от Railway | ✅ Перенесено |

---

## 🧪 ТЕСТОВЫЕ ФУНКЦИИ (3)

| № | Функция | Описание | Назначение |
|---|---------|----------|-----------|
| 25 | `testSimpleFunction` | Простая тестовая функция | Разработка |
| 26 | `testAdvancedLoopFunction` | Продвинутая тестовая функция | Разработка |
| 27 | `testSimpleMessageFunction` | Тестовая функция сообщений | Разработка |

---

## 📁 ФАЙЛОВАЯ СТРУКТУРА

```
/src/inngest_app/functions/
├── ai-reels-callback.ts ✅
├── broadcast/
│   └── broadcastMessage.ts ✅
├── content/
│   ├── analyzeCompetitorReels.ts ✅
│   ├── extractTopContent.ts ✅
│   ├── findCompetitors.ts ✅
│   ├── generateContentScripts.ts ✅
│   ├── generateDetailedScript.ts ✅
│   └── generateScenarioClips.ts ✅
├── existing/
│   ├── generateAIReelsFunction.ts ✅
│   ├── generateAdvancedLoopingVideoFunction.ts ✅
│   └── generateModelTrainingFunction.ts ✅
├── generation/
│   └── neuroImageGeneration.ts ✅
├── instagram/
│   ├── instagramScraper-v2.ts ✅
│   └── instagramScraper-v2-simple.ts ✅
├── monitoring/
│   ├── criticalErrorMonitor.ts ✅
│   └── logMonitor.ts ✅
├── payments/
│   └── paymentProcessing.ts ✅
├── render/
│   ├── render.ts ✅
│   ├── renderAvatarVideo.ts ✅
│   └── renderRiddle.ts ✅
├── training/
│   ├── modelTrainingV2.ts ✅
│   └── morphImages.ts ✅
└── test/
    ├── testSimpleFunction.ts ✅
    ├── testAdvancedLoopFunction.ts ✅
    └── testSimpleMessageFunction.ts ✅
```

---

## 🔗 РЕГИСТРАЦИЯ ФУНКЦИЙ

### Основной файл регистрации
**Файл:** `/src/inngest_app/registerFunctions.ts`

```typescript
export const allInngestFunctions = [
  // Content (6)
  analyzeCompetitorReelsFunction,
  extractTopContentFunction,
  findCompetitorsFunction,
  generateContentScriptsFunction,
  generateDetailedScriptFunction,
  generateScenarioClipsFunction,

  // Instagram (2)
  instagramScraperV2Function,
  instagramScraperV2SimpleFunction,

  // Monitoring (4)
  criticalErrorMonitorFunction,
  logMonitorFunction,
  // ... и т.д.

  // Total: 24 основные + 3 тестовые = 27
]
```

### Master Index
**Файл:** `/src/inngest_app/functions/index.ts`

Экспортирует все функции для удобного импорта.

---

## 🌐 API ENDPOINTS

### Inngest Functions API
**Endpoint:** `https://three-head-dragon.shop/api/inngest`

**Методы:**
- `POST /api/inngest` - Отправка событий для обработки
- `GET /api/inngest` - Health check (может быть пустым ответом)

### Callback Endpoint
**Endpoint:** `https://three-head-dragon.shop/api/telegram/ai-reels-callback`

**Методы:**
- `GET /api/telegram/ai-reels-callback` - Health check
- `POST /api/telegram/ai-reels-callback` - Webhook от Railway

---

## 📝 ДОКУМЕНТАЦИЯ

### Подробная документация по каждой функции
Находится в шапке каждого `.ts` файла.

**Пример:**
```typescript
/**
 * [НАЗВАНИЕ ФУНКЦИИ]
 *
 * ВЫЗЫВАЕТСЯ ЧЕРЕЗ: [событие]
 * ИСТОЧНИК: [источник]
 * НАЗНАЧЕНИЕ: [назначение]
 *
 * Параметры события:
 * - [параметр 1]: [описание]
 * - [параметр 2]: [описание]
 */
```

---

## ✅ СТАТУС ПЕРЕНОСА

### ПОЛНОСТЬЮ ПЕРЕНЕСЕНО
- [x] Все 24 основные функции
- [x] Все 3 тестовые функции
- [x] Все импорты исправлены
- [x] Все функции зарегистрированы
- [x] API endpoints настроены
- [x] Health checks работают

### НЕ ПЕРЕНЕСЕНО
- [ ] Функции из других репозиториев (если есть)
- [ ] Старые функции ai-server (все уже перенесены)

---

## 🎯 ИСПОЛЬЗОВАНИЕ

### Отправка события
```javascript
const { inngest } = await import('@/inngest_app/client')

await inngest.send({
  name: 'функция-событие',
  data: {
    // параметры
  }
})
```

### Получение callback
```javascript
// POST на /api/telegram/ai-reels-callback
{
  "job_id": "telegram-123-456",
  "status": "completed",
  "download_url": "https://example.com/video.mp4",
  "metadata": {
    "telegram_id": "123456789"
  }
}
```

---

## 📊 ТЕСТИРОВАНИЕ

### Ручное тестирование
См. файл: `ПЛАН_РУЧНОГО_ТЕСТИРОВАНИЯ_INNGEST.md`

### Автоматическое тестирование
**НЕТ ТЕСТОВ** - все функции требуют ручного тестирования.

---

## 🔧 КОНФИГУРАЦИЯ

### Переменные окружения
```bash
# Для отправки событий
BOT_INNGEST_EVENT_KEY=...

# Для callback'ов
TELEGRAM_BOT_TOKEN_AI_STARS=...
TELEGRAM_BOT_TOKEN=...

# Для Supabase
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

---

## 📈 МОНИТОРИНГ

### Логи
```bash
docker logs 999-multibots --tail=100 | grep "[ФУНКЦИЯ]"
```

### Метрики
- Количество вызовов функций
- Время выполнения
- Ошибки выполнения

---

## 🚨 ИЗВЕСТНЫЕ ПРОБЛЕМЫ

1. **Нет автоматических тестов** - все требуют ручного тестирования
2. **Тестовые функции активны** - нужно их отключить в продакшене
3. **Мониторинг ограничен** - нет автоматических алертов

---

## 📞 ПОДДЕРЖКА

При проблемах:
1. Проверить логи: `docker logs 999-multibots`
2. Перезапустить: `docker restart 999-multibots`
3. Сверить коммит: `6a0799c4`
4. Проверить регистрацию: `/src/inngest_app/registerFunctions.ts`

---

**Дата создания:** 2025-11-04
**Версия:** 1.0
**Статус:** ✅ Активен
**Всего функций:** 27 (24 основные + 3 тестовые)
