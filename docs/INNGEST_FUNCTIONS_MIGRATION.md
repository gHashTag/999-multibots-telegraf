# 📋 INNGEST FUNCTIONS MIGRATION PLAN
## Перенос всех Inngest функций из ai-server в telegraf

> **Цель**: Изолировать всё на bot-farm, убрать зависимость от ai-server
> **Дата**: 2025-10-30
> **Статус**: 🔴 TODO

---

## 📊 АНАЛИЗ INNGEST ФУНКЦИЙ

### В ai-server (18 функций + render модуль):

#### Core Functions (18):
1. ✅ analyzeCompetitorReels.ts - Анализ конкурентов
2. ✅ broadcastMessage.ts - Рассылка сообщений
3. ✅ criticalErrorMonitor.ts - Мониторинг ошибок
4. ✅ extractTopContent.ts - Извлечение контента
5. ✅ findCompetitors.ts - Поиск конкурентов
6. ✅ generateContentScripts.ts - Генерация скриптов
7. ✅ generateDetailedScript.ts - Детальные скрипты
8. ⚠️ generateModelTraining.ts - Обучение моделей (возможно дубль)
9. ✅ generateScenarioClips.ts - Генерация клипов
10. ✅ helloworld.ts - Тестовая функция
11. ✅ instagramScraper-v2.ts - Instagram парсинг (полная версия)
12. ✅ instagramScraper-v2-simple.ts - Instagram парсинг (упрощенная)
13. ✅ logMonitor.ts - Мониторинг логов
14. ✅ modelTrainingV2.ts - Обучение моделей v2
15. ✅ morphImages.ts - Морфинг изображений
16. ✅ neuroImageGeneration.ts - Генерация нейро-изображений
17. ✅ paymentProcessing.ts - Обработка платежей
18. ✅ index.ts - Экспорт всех функций

#### Render Module (7 файлов + helpers):
```
render/
├── render.ts - Основная функция рендера
├── renderRiddle.ts - Riddle workflow
├── renderAvatarVideo.ts - Avatar video generation
├── steps.ts - Шаги рендеринга
├── schemas.ts - Схемы валидации
├── types.ts - TypeScript типы
├── index.ts - Экспорт
└── helpers/
    ├── config.ts
    ├── faceDetection.ts
    ├── heygenAvatarDetails.ts
    ├── renderSteps.ts
    ├── s3.service.ts
    ├── ssh.service.ts
    └── templateProcessor.ts
```

### В telegraf (8 функций):
1. ✅ generateAIReelsFunction.ts
2. ✅ generateAdvancedLoopingVideoFunction.ts
3. ⚠️ generateModelTrainingFunction.ts (проверить версию)
4. ✅ testAdvancedLoopFunction.ts
5. ✅ testSimpleFunction.ts
6. ✅ testSimpleMessageFunction.ts
7. ✅ video-upload-helper.ts
8. ✅ wan25-helpers.ts

---

## 🎯 ЧТО НУЖНО МИГРИРОВАТЬ

### Новые функции для telegraf (15 + render модуль):
1. analyzeCompetitorReels - Анализ конкурентов
2. broadcastMessage - Рассылки
3. criticalErrorMonitor - Мониторинг
4. extractTopContent - Контент
5. findCompetitors - Конкуренты
6. generateContentScripts - Скрипты
7. generateDetailedScript - Детальные скрипты
8. generateScenarioClips - Клипы
9. instagramScraper-v2 - Instagram
10. logMonitor - Логи
11. modelTrainingV2 - ML v2
12. morphImages - Морфинг
13. neuroImageGeneration - Нейро-изображения
14. paymentProcessing - Платежи
15. Весь render модуль (7 файлов)

### Проверить/обновить:
- generateModelTraining - сравнить версии в ai-server и telegraf

---

## 🔄 ЗАМЕНА ВНЕШНИХ ВЫЗОВОВ

### Что нужно изменить:

1. **API вызовы на ai-server (999-agents.site)**:
   ```typescript
   // Было:
   const response = await axios.post('https://999-agents.site/api/...')

   // Стало:
   const response = await localHandler(...)
   ```

2. **Webhook URLs**:
   ```typescript
   // Было:
   webhookUrl: 'https://999-agents.site/webhooks/replicate'

   // Стало:
   webhookUrl: 'http://localhost:3000/webhooks/replicate'
   // Или обрабатывать локально без webhook
   ```

3. **ElevenLabs через ai-server**:
   ```typescript
   // Было:
   await axios.post(`${AI_SERVER_URL}/api/elevenlabs/...`)

   // Стало:
   import { createVoiceElevenLabs } from '@/core/elevenlabs'
   await createVoiceElevenLabs(...) // Прямой вызов
   ```

---

## 📁 СТРУКТУРА ПОСЛЕ МИГРАЦИИ

```
/Users/playra/999-agents-telegraf/src/inngest_app/functions/
├── existing/                    # Существующие функции
│   ├── generateAIReelsFunction.ts
│   ├── generateAdvancedLoopingVideoFunction.ts
│   └── generateModelTrainingFunction.ts
│
├── content/                     # Контент и скрипты
│   ├── analyzeCompetitorReels.ts
│   ├── extractTopContent.ts
│   ├── findCompetitors.ts
│   ├── generateContentScripts.ts
│   ├── generateDetailedScript.ts
│   └── generateScenarioClips.ts
│
├── instagram/                   # Instagram функции
│   ├── instagramScraper-v2.ts
│   └── instagramScraper-v2-simple.ts
│
├── monitoring/                  # Мониторинг
│   ├── criticalErrorMonitor.ts
│   └── logMonitor.ts
│
├── training/                    # ML и обучение
│   ├── modelTrainingV2.ts
│   └── morphImages.ts
│
├── generation/                  # Генерация
│   └── neuroImageGeneration.ts
│
├── payments/                    # Платежи
│   └── paymentProcessing.ts
│
├── broadcast/                   # Рассылки
│   └── broadcastMessage.ts
│
├── render/                      # Рендеринг (полный модуль)
│   ├── render.ts
│   ├── renderRiddle.ts
│   ├── renderAvatarVideo.ts
│   ├── steps.ts
│   ├── schemas.ts
│   ├── types.ts
│   └── helpers/
│       ├── config.ts
│       ├── faceDetection.ts
│       ├── heygenAvatarDetails.ts
│       ├── renderSteps.ts
│       ├── s3.service.ts
│       ├── ssh.service.ts
│       └── templateProcessor.ts
│
└── index.ts                     # Экспорт всех функций
```

---

## 🚀 ПЛАН МИГРАЦИИ

### Phase 1: Подготовка (30 минут)
```bash
# Создать структуру директорий
cd /Users/playra/999-agents-telegraf
mkdir -p src/inngest_app/functions/{content,instagram,monitoring,training,generation,payments,broadcast,render/helpers}

# Создать feature branch
git checkout -b feat/inngest-functions-migration
```

### Phase 2: Копирование функций (1 час)
```bash
# Копировать все функции
# См. скрипт migrate-inngest-functions-full.sh
```

### Phase 3: Обновление импортов (2 часа)
- Заменить все импорты из ai-server на локальные
- Обновить пути к core модулям
- Убрать внешние API вызовы

### Phase 4: Тестирование (2 часа)
- Протестировать каждую функцию
- Проверить что нет вызовов на 999-agents.site
- Убедиться что всё работает локально

### Phase 5: Cleanup (30 минут)
- Удалить неиспользуемые зависимости
- Обновить документацию
- Commit и push

---

## ✅ CHECKLIST

### Pre-Migration:
- [ ] Backup существующих функций
- [ ] Создать feature branch
- [ ] Установить необходимые зависимости

### Migration:
- [ ] Скопировать все 18 функций
- [ ] Скопировать render модуль полностью
- [ ] Обновить все импорты
- [ ] Заменить внешние API вызовы на локальные
- [ ] Создать index.ts с экспортами

### Post-Migration:
- [ ] npm run build - проверить компиляцию
- [ ] npm run test - запустить тесты
- [ ] Протестировать в bot scenes
- [ ] Убедиться что нет вызовов на ai-server
- [ ] Обновить документацию

### Verification:
- [ ] Нет зависимости от https://999-agents.site
- [ ] Все функции работают локально
- [ ] Bot-farm полностью изолирован
- [ ] Можно отключить ai-server

---

## 🎯 РЕЗУЛЬТАТ

После миграции:
- ✅ Все Inngest функции работают локально в bot-farm
- ✅ Нет зависимости от ai-server
- ✅ Всё изолировано на одном сервере
- ✅ Упрощенная архитектура
- ✅ Быстрее работа (нет сетевых вызовов)

---

**Timeline**: ~6 часов
**Priority**: HIGH
**Risk**: LOW (только копирование и адаптация)