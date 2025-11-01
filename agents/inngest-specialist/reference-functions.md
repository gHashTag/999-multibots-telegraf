# 📚 СПРАВОЧНИК: Примеры готовых функций

## 🎯 Обзор

Данный файл содержит примеры реальных Inngest функций из проекта, которые можно использовать как **шаблоны** при создании новых функций через Claude Code Inngest Specialist.

**⚠️ ВАЖНО:** Всегда используйте эти функции как основу для новых, НЕ создавайте с нуля!

---

## 📁 content/ - Функции для работы с контентом

### 1. generateContentScripts.ts

**Назначение:** Генерация скриптов для контента из Instagram Reels

**Событие:** `instagram/generate-scripts`

**Ключевые особенности:**
- ✅ Использует zod для валидации
- ✅ Взаимодействует с Supabase
- ✅ Интеграция с OpenAI (Whisper, GPT-4)
- ✅ Многошаговый процесс (5 шагов)
- ✅ Правильное логирование

**Шаги выполнения:**
1. `get-reel-data` - получение данных из БД
2. `extract-audio` - извлечение аудио
3. `transcribe-audio` - транскрибация через Whisper
4. `generate-scripts` - генерация скриптов через GPT-4
5. `save-scripts` - сохранение в БД

**Структура валидации:**
```typescript
const generateContentScriptsSchema = z.object({
  reel_id: z.string().min(1, 'Reel ID is required'),
  ig_reel_url: z.string().url('Valid URL is required').optional(),
  project_id: z.number().int().positive('Project ID must be positive'),
  openai_api_key: z.string().optional(),
})
```

**📍 Путь:** `/src/inngest_app/functions/content/generateContentScripts.ts`

---

### 2. analyzeCompetitorReels.ts

**Назначение:** Анализ Reels конкурентов

**Событие:** `instagram/analyze-competitor`

**Ключевые особенности:**
- ✅ Сложная логика анализа
- ✅ Работа с изображениями и видео
- ✅ Статистика и метрики
- ✅ Сохранение в БД

**📍 Путь:** `/src/inngest_app/functions/content/analyzeCompetitorReels.ts`

---

### 3. findCompetitors.ts

**Назначение:** Поиск конкурентов для анализа

**Событие:** `instagram/find-competitors`

**📍 Путь:** `/src/inngest_app/functions/content/findCompetitors.ts`

---

## 📁 existing/ - Шаблонные функции

### 1. generateAIReelsFunction.ts

**Назначение:** Генерация AI Reels с двумя видео

**Событие:** `ai-reels/generate`

**Ключевые особенности:**
- ✅ Factory pattern (createGenerateAIReelsFunction)
- ✅ Два этапа генерации видео
- ✅ Lip-sync (veed_fabric)
- ✅ WAN 2.5 (image-to-video)
- ✅ FFmpeg для склеивания
- ✅ Rate limiting (5 одновременных)
- ✅ Webhook уведомления

**Конфигурация:**
```typescript
{
  id: 'ai-reels-generation',
  name: 'AI Reels Generation',
  retries: 2,
  rateLimit: {
    limit: 5,
    period: '1m',
    key: 'event.data.telegramId',
  },
}
```

**Шаги выполнения:**
1. `generate-lipsync-video` - создание lip-sync видео
2. `generate-wan25-video` - создание WAN 2.5 видео
3. `merge-videos` - склеивание через FFmpeg

**📍 Путь:** `/src/inngest_app/functions/existing/generateAIReelsFunction.ts`

---

### 2. generateModelTrainingFunction.ts

**Назначение:** Генерация функции обучения модели

**Событие:** `model/training/generate`

**Ключевые особенности:**
- ✅ Обработка изображений
- ✅ Подготовка данных
- ✅ Настройка модели
- ✅ Обучение и сохранение

**📍 Путь:** `/src/inngest_app/functions/existing/generateModelTrainingFunction.ts`

---

### 3. generateAdvancedLoopingVideoFunction.ts

**Назначение:** Генерация зацикленного видео

**Событие:** `video/loop/generate`

**📍 Путь:** `/src/inngest_app/functions/existing/generateAdvancedLoopingVideoFunction.ts`

---

## 📁 render/ - Функции рендеринга

### 1. renderAvatarVideo.ts

**Назначение:** Рендеринг видео с аватаром

**Событие:** `render/avatar-video`

**Ключевые особенности:**
- ✅ Интеграция с HeyGen API
- ✅ Обработка аватаров
- ✅ Настройка сцен
- ✅ S3 интеграция
- ✅ SSH подключения

**📍 Путь:** `/src/inngest_app/functions/render/renderAvatarVideo.ts`

---

### 2. renderRiddle.ts

**Назначение:** Рендеринг загадок

**Событие:** `render/riddle`

**📍 Путь:** `/src/inngest_app/functions/render/renderRiddle.ts`

---

### 3. render.ts (index)

**Назначение:** Главный файл рендеринга

**📍 Путь:** `/src/inngest_app/functions/render/render.ts`

---

## 📁 monitoring/ - Функции мониторинга

### 1. criticalErrorMonitor.ts

**Назначение:** Мониторинг критических ошибок

**Событие:** `monitor/critical-error`

**Ключевые особенности:**
- ✅ Отслеживание ошибок
- ✅ Алерты и уведомления
- ✅ Статистика
- ✅ Репорты

**📍 Путь:** `/src/inngest_app/functions/monitoring/criticalErrorMonitor.ts`

---

### 2. logMonitor.ts

**Назначение:** Мониторинг логов

**Событие:** `monitor/logs`

**📍 Путь:** `/src/inngest_app/functions/monitoring/logMonitor.ts`

---

## 📁 training/ - Функции обучения

### 1. modelTrainingV2.ts

**Назначение:** Обучение модели (версия 2)

**Событие:** `training/model/v2`

**📍 Путь:** `/src/inngest_app/functions/training/modelTrainingV2.ts`

---

### 2. morphImages.ts

**Назначение:** Трансформация изображений

**Событие:** `training/morph-images`

**📍 Путь:** `/src/inngest_app/functions/training/morphImages.ts`

---

## 📁 instagram/ - Instagram функции

### 1. instagramScraper-v2.ts

**Назначение:** Скрейпинг Instagram (версия 2)

**Событие:** `instagram/scrape/v2`

**📍 Путь:** `/src/inngest_app/functions/instagram/instagramScraper-v2.ts`

---

### 2. instagramScraper-v2-simple.ts

**Назначение:** Упрощенный скрейпинг Instagram

**Событие:** `instagram/scrape/v2-simple`

**📍 Путь:** `/src/inngest_app/functions/instagram/instagramScraper-v2-simple.ts`

---

## 📁 generation/ - Генерация

### 1. neuroImageGeneration.ts

**Назначение:** Нейрогенерация изображений

**Событие:** `generation/neuro-image`

**📍 Путь:** `/src/inngest_app/functions/generation/neuroImageGeneration.ts`

---

## 📁 payment/ - Платежи

### 1. paymentProcessing.ts

**Назначение:** Обработка платежей

**Событие:** `payment/process`

**Ключевые особенности:**
- ✅ Валидация платежных данных
- ✅ Интеграция с платежными системами
- ✅ Безопасность и шифрование
- ✅ Логирование транзакций

**📍 Путь:** `/src/inngest_app/functions/payments/paymentProcessing.ts`

---

## 📁 broadcast/ - Рассылка

### 1. broadcastMessage.ts

**Назначение:** Рассылка сообщений

**Событие:** `broadcast/message`

**📍 Путь:** `/src/inngest_app/functions/broadcast/broadcastMessage.ts`

---

## 🎨 Общие паттерны

### 1. Структура логирования

**Всегда используйте:**
```typescript
const logger = new Logger('FunctionName')

logger.info('Сообщение', { context: 'value' })

logger.error('Ошибка', {
  error: error instanceof Error ? error.message : String(error),
  stack: error instanceof Error ? error.stack : undefined,
})
```

### 2. Конфигурация

**Стандартная конфигурация:**
```typescript
{
  id: 'function-name',
  name: 'Function Name',
  retries: {
    attempts: 3,
    delay: '1s',
  },
  concurrency: 10,
}
```

### 3. Валидация

**Использование zod:**
```typescript
const schema = z.object({
  field: z.string().min(1, 'Поле обязательно'),
})

const input = schema.parse(event.data)
```

### 4. Шаги

**Структура step.run():**
```typescript
const result = await step.run('step-name', async () => {
  logger.info('Выполнение шага')

  // Логика шага
  return await performOperation()
})
```

---

## 🔍 Как выбрать шаблон

### По категории:

| Новая функция | Используйте шаблон |
|---------------|-------------------|
| Генерация контента | `content/generateContentScripts.ts` |
| Анализ данных | `content/analyzeCompetitorReels.ts` |
| AI генерация | `existing/generateAIReelsFunction.ts` |
| Рендеринг видео | `render/renderAvatarVideo.ts` |
| Мониторинг | `monitoring/criticalErrorMonitor.ts` |
| Обучение моделей | `training/modelTrainingV2.ts` |
| Instagram интеграция | `instagram/instagramScraper-v2.ts` |
| Платежи | `payments/paymentProcessing.ts` |

### По функциональности:

**Нужна интеграция с OpenAI?**
→ `content/generateContentScripts.ts` (использует Whisper, GPT-4)

**Нужно обучение модели?**
→ `existing/generateModelTrainingFunction.ts`

**Нужно видео?**
→ `existing/generateAIReelsFunction.ts` (lip-sync + WAN 2.5)
→ `render/renderAvatarVideo.ts` (HeyGen)

**Нужна аналитика?**
→ `content/analyzeCompetitorReels.ts`

---

## ⚙️ Шаблоны конфигурации

### 1. Стандартная функция

```typescript
{
  id: 'function-name',
  name: 'Function Name',
  retries: {
    attempts: 3,
    delay: '1s',
  },
  concurrency: 10,
}
```

### 2. Функция с rate limiting

```typescript
{
  id: 'function-name',
  name: 'Function Name',
  retries: 2,
  rateLimit: {
    limit: 5,
    period: '1m',
    key: 'event.data.telegramId',
  },
}
```

### 3. Функция с высоким приоритетом

```typescript
{
  id: 'function-name',
  name: 'Function Name',
  retries: 5,
  concurrency: 5,
}
```

### 4. Batch обработка

```typescript
{
  id: 'function-name',
  name: 'Function Name',
  retries: 3,
  concurrency: 1, // Последовательная обработка
}
```

---

## 📝 Чеклист при выборе шаблона

- [ ] Определите категорию функции
- [ ] Найдите похожую по логике функцию
- [ ] Изучите структуру шаблона
- [ ] Проверьте используемые интеграции
- [ ] Скопируйте шаблон
- [ ] Адаптируйте под ваши нужды
- [ ] Обновите названия и описания
- [ ] Сохраните паттерны логирования

---

## 💡 Советы

### ✅ Рекомендуемые шаблоны:

**Для новичков:**
- `content/generateContentScripts.ts` - хорошо документирован
- `existing/generateAIReelsFunction.ts` - понятная структура

**Для сложных задач:**
- `render/renderAvatarVideo.ts` - много внешних интеграций
- `training/modelTrainingV2.ts` - сложная логика

**Для простых задач:**
- `monitoring/criticalErrorMonitor.ts` - минимум логики
- `broadcast/broadcastMessage.ts` - базовая структура

### ❌ Избегайте:

- Создания функций без шаблона
- Изменения паттернов логирования
- Игнорирования конфигурации retries
- Пропуска валидации входных данных

---

## 📚 Дополнительные ресурсы

- 📋 **[INNGEST_DEVELOPMENT_RULES.md](../../INNGEST_DEVELOPMENT_RULES.md)** - Правила разработки
- 📁 **[registerFunctions.ts](../../src/inngest_app/registerFunctions.ts)** - Регистрация функций
- 🔧 **Inngest Documentation** - https://www.inngest.com/docs

---

**🎯 Помните: Лучше скопировать существующее, чем создать новое!**
