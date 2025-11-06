# 📋 План Ручного Тестирования Inngest Функций

## Обзор
Данный план описывает, как вручную протестировать все **28 Inngest функций** для проверки их работоспособности.

## 🎯 Цель
Проверить что все функции:
- ✅ Правильно импортируются
- ✅ Обрабатывают входные данные
- ✅ Возвращают корректные результаты
- ✅ Логируют события
- ✅ Обрабатывают ошибки

## 📊 Список Функций для Тестирования

### 1. Callback (1 функция)
**Функция:** `ai-reels-callback`
- **Путь:** `functions/ai-reels-callback.ts`
- **Назначение:** Обработка callback после рендеринга видео
- **Тестовые данные:**
  ```json
  {
    "job_id": "test_job_123",
    "status": "completed",
    "metadata": {
      "telegram_id": "123456789"
    },
    "result_url": "https://example.com/video.mp4"
  }
  ```
- **Проверить:**
  - ✅ Функция импортируется
  - ✅ Обрабатывает completed status
  - ✅ Обрабатывает failed status
  - ✅ Обрабатывает processing status
  - ✅ Отправляет уведомления пользователю
  - ✅ Логирует события

### 2. Render (3 функции)
**Функция 1:** `render`
- **Тестовые данные:**
  ```json
  {
    "telegram_id": "123456789",
    "template_id": "test_template",
    "data": {
      "text": "Test Render",
      "color": "#FF0000"
    },
    "output_format": "mp4"
  }
  ```

**Функция 2:** `renderAvatarVideo`
- **Тестовые данные:**
  ```json
  {
    "telegram_id": "123456789",
    "avatar_id": "avatar_456",
    "script": "Добро пожаловать!",
    "voice_id": "voice_789"
  }
  ```

**Функция 3:** `renderRiddle`
- **Тестовые данные:**
  ```json
  {
    "telegram_id": "123456789",
    "riddle_text": "Что это?",
    "answer": "Это загадка!",
    "theme": "animals"
  }
  ```

**Проверить для всех render функций:**
- ✅ Функция импортируется
- ✅ Валидирует входные данные
- ✅ Запускает рендер
- ✅ Возвращает job_id
- ✅ Логирует прогресс

### 3. Training (2 функции)
**Функция 1:** `modelTrainingV2`
- **Тестовые данные:**
  ```json
  {
    "telegram_id": "123456789",
    "model_name": "test_model",
    "images": [
      "https://example.com/img1.jpg",
      "https://example.com/img2.jpg"
    ],
    "training_type": "face_model"
  }
  ```

**Функция 2:** `morphImages`
- **Тестовые данные:**
  ```json
  {
    "telegram_id": "123456789",
    "source_image": "https://example.com/source.jpg",
    "target_image": "https://example.com/target.jpg",
    "steps": 20
  }
  ```

### 4. Content (6 функций)
**Функция 1:** `analyzeCompetitorReels`
```json
{
  "telegram_id": "123456789",
  "competitor_url": "https://instagram.com/test_user",
  "analysis_depth": "basic"
}
```

**Функция 2:** `extractTopContent`
```json
{
  "telegram_id": "123456789",
  "hashtags": ["#travel", "#nature"],
  "limit": 20
}
```

**Функция 3:** `findCompetitors`
```json
{
  "telegram_id": "123456789",
  "niche": "fitness",
  "region": "ru"
}
```

**Функция 4:** `generateContentScripts`
```json
{
  "telegram_id": "123456789",
  "topic": "health",
  "script_count": 5,
  "duration": 30
}
```

**Функция 5:** `generateDetailedScript`
```json
{
  "telegram_id": "123456789",
  "brief": "Создать видео о здоровом питании",
  "duration": 60,
  "style": "informative"
}
```

**Функция 6:** `generateScenarioClips`
```json
{
  "telegram_id": "123456789",
  "scenario_id": "scenario_123",
  "clip_count": 5
}
```

### 5. Instagram (2 функции)
**Функция 1:** `instagramScraperV2`
```json
{
  "telegram_id": "123456789",
  "username": "test_user",
  "scrape_type": "profile",
  "limit": 50
}
```

**Функция 2:** `instagramScraperV2Simple`
```json
{
  "telegram_id": "123456789",
  "url": "https://instagram.com/test_user",
  "include_metrics": true
}
```

### 6. Existing (3 функции)
**Функция 1:** `generateAIReelsFunction`
```json
{
  "telegram_id": "123456789",
  "prompt": "Красивая природа",
  "style": "realistic"
}
```

**Функция 2:** `generateAdvancedLoopingVideoFunction`
```json
{
  "telegram_id": "123456789",
  "base_video_url": "https://example.com/video.mp4",
  "loop_duration": 10
}
```

**Функция 3:** `generateModelTrainingFunction`
```json
{
  "telegram_id": "123456789",
  "model_type": "style_transfer",
  "training_data_url": "https://example.com/dataset.zip"
}
```

### 7. Generation (1 функция)
**Функция:** `neuroImageGeneration`
```json
{
  "telegram_id": "123456789",
  "prompt": "Красивый закат над морем",
  "model": "dalle-3",
  "aspect_ratio": "16:9"
}
```

### 8. Payment (1 функция)
**Функция:** `paymentProcessing`
```json
{
  "telegram_id": "123456789",
  "payment_method": "stars",
  "amount": 100,
  "stars": 350,
  "service_type": "neurovideo"
}
```

### 9. Broadcast (1 функция)
**Функция:** `broadcastMessage`
```json
{
  "telegram_id": "123456789",
  "text_ru": "Привет! Новая функция доступна",
  "text_en": "Hello! New feature available",
  "content_type": "text"
}
```

### 10. Monitoring (2 функции)
**Функция 1:** `criticalErrorMonitor`
```json
{
  "telegram_id": "123456789",
  "check_type": "system_health",
  "alert_threshold": 5
}
```

**Функция 2:** `logMonitor`
```json
{
  "telegram_id": "123456789",
  "log_level": "error",
  "time_range": 3600
}
```

### 11. Test (3 функции)
**Функция 1:** `testSimpleFunction`
```json
{
  "telegram_id": "123456789",
  "message": "Test message",
  "test_mode": true
}
```

**Функция 2:** `testSimpleMessageFunction`
```json
{
  "telegram_id": "123456789",
  "text": "Test text",
  "chat_id": "123456789"
}
```

**Функция 3:** `testAdvancedLoopFunction`
```json
{
  "telegram_id": "123456789",
  "loop_count": 5,
  "delay": 100,
  "message": "Loop test"
}
```

### 12. Helpers (3 функции)
**Функция 1:** `videoUploadHelper`
```json
{
  "telegram_id": "123456789",
  "video_url": "https://example.com/video.mp4",
  "bucket": "videos"
}
```

**Функция 2:** `wan25Helpers`
```json
{
  "telegram_id": "123456789",
  "action": "process",
  "params": {
    "key": "value"
  }
}
```

**Функция 3:** `functionsIndex`
- Проверить экспорт:
  ```typescript
  import { getAllFunctions, getFunctionById, getFunctionStats } from './functions/index'

  // Проверить что все функции экспортируются
  const all = getAllFunctions()
  console.log('Total functions:', all.length) // Должно быть 28

  // Найти конкретную функцию
  const func = getFunctionById('ai-reels-callback')
  console.log('Found function:', func?.name)

  // Получить статистику
  const stats = getFunctionStats()
  console.log('Stats:', stats)
  ```

## 🔧 Как Запустить Тесты

### 1. Проверка Импортов
```bash
cd src/inngest_app

# Проверить что все функции импортируются
node -e "
const functions = require('./functions/index.js');
const all = functions.getAllFunctions();
console.log('Total functions:', all.length);
console.log('Function names:', all.map(f => f.name || f.id));
"
```

### 2. Запуск Unit Тестов
```bash
# Запустить все тесты
npm run test:inngest

# Запустить один тест
npx vitest run test/unit/callback.test.ts

# Запустить с coverage
npm run test:inngest:coverage
```

### 3. Ручная Проверка Функции
```bash
# Проверить конкретную функцию
node -e "
const { aiReelsCallbackFunction } = require('./functions/ai-reels-callback.js');
console.log('Function:', aiReelsCallbackFunction);
console.log('Handler:', typeof aiReelsCallbackFunction?.handler);
"
```

## 📝 Чек-лист Тестирования

Для каждой функции выполнить:

- [ ] **Импорт**
  - [ ] Функция импортируется без ошибок
  - [ ] Функция имеет handler
  - [ ] Функция имеет id

- [ ] **Валидация**
  - [ ] Функция валидирует входные данные
  - [ ] Функция отклоняет невалидные данные
  - [ ] Функция возвращает понятные ошибки

- [ ] **Выполнение**
  - [ ] Функция выполняется с валидными данными
  - [ ] Функция возвращает результат
  - [ ] Функция не падает с ошибками

- [ ] **Логирование**
  - [ ] Функция логирует начало выполнения
  - [ ] Функция логирует результат
  - [ ] Функция логирует ошибки

- [ ] **Интеграция**
  - [ ] Функция отправляет события
  - [ ] Функция использует step.run
  - [ ] Функция интегрируется с внешними сервисами

## 🚨 Критические Ошибки

Если встречаются ошибки:

1. **"Cannot read properties of undefined"**
   - Проверить импорты функций
   - Убедиться что функции экспортируются

2. **"handler is not a function"**
   - Проверить структуру функции Inngest
   - Убедиться что используется inngest.createFunction

3. **"Module not found"**
   - Проверить пути к модулям
   - Проверить alias в конфигурации

## ✅ Успешные Результаты

Тест считается успешным если:

1. Все 28 функций импортируются без ошибок
2. Все функции имеют handler
3. Unit тесты проходят
4. Integration тесты проходят
5. Coverage > 90%

## 📊 Ожидаемые Результаты

- **Всего функций:** 28
- **Покрытие тестами:** 100%
- **Unit тесты:** 24 файла
- **Integration тесты:** 1 файл
- **Fixtures:** 12 файлов

---

**Дата создания:** 2025-11-04
**Статус:** Готов к выполнению
