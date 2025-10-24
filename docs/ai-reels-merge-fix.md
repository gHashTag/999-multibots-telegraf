# AI Reels Template 1 - Исправление проблемы со склейкой видео

## 🔍 Диагностика проблемы

### Что было обнаружено:
1. ✅ Функция `combineVideos` **РАБОТАЕТ ОТЛИЧНО** (test-video-merge.ts passed в 185ms)
2. ⚠️ Step 4 (склеивание) не выполняется после Step 3 (WAN 2.5)
3. ❓ Неизвестно: вызывается ли Step 4 вообще или падает с ошибкой

### Возможные причины:
- Step 4 не находится в `wizard.steps`
- Контекст теряет сессию между Step 3 и Step 4
- Ошибка при ручном вызове `nextStep(ctx)`
- Валидация в Step 4 не проходит (отсутствуют URL)

## ✅ Исправления

### 1. Тестовый режим для WAN 2.5
**Файл**: `src/scenes/lipSyncWizard/ai-reels-wizard.ts` (строки 1196-1225)

Теперь `USE_TEST_LIPSYNC=true` пропускает генерацию **ОБОИХ** видео:
- Lip-sync: `https://v3b.fal.media/files/b/tiger/mak7VQyKPCP3HJeazjbl__tmp0r5i6khu.mp4`
- WAN 2.5: `https://v3b.fal.media/files/b/penguin/Jns1yqrvrnqff91m_C-R2_p9xGAM9j.mp4`

**Экономия**: ~187⭐ на каждый тест

### 2. Детальное логирование Step 3→Step 4
**Файл**: `src/scenes/lipSyncWizard/ai-reels-wizard.ts` (строки 1276-1319)

Логи покажут:
```
🔄 Before ctx.wizard.next(): currentCursor, totalSteps
🔄 After ctx.wizard.next(): newCursor, totalSteps
🔍 Next step info: hasNextStep, isFunction, nextStepType, cursor
✅ Manually executing Step 4 (если найден)
❌ Step 4 not found (если НЕ найден) + список всех steps
```

### 3. Детальное логирование Step 4 Entry
**Файл**: `src/scenes/lipSyncWizard/ai-reels-wizard.ts` (строки 1356-1388)

Логи покажут:
```
🚀🚀🚀 STEP 4 ENTRY POINT:
  - telegramId
  - hasSession, hasAiReels
  - firstVideoUrl (первые 100 символов)
  - secondVideoUrl (первые 100 символов)
  - step (текущий статус)

❌❌❌ Step 4 VALIDATION FAILED (если валидация провалилась):
  - hasTelegramId, hasFirstVideoUrl, hasSecondVideoUrl
  - sessionData (полный JSON сессии)
```

## 🧪 Инструкции для тестирования

### Шаг 1: Проверка тестовой склейки (уже сделано)
```bash
bun test-video-merge.ts
# ✅ Результат: склейка работает за 185ms
```

### Шаг 2: Полный тест workflow в тестовом режиме

1. **Убедитесь что `.env` содержит**:
```bash
NODE_ENV=development
USE_TEST_LIPSYNC=true
```

2. **Пересоберите проект**:
```bash
npm run build
```

3. **Запустите бота локально**:
```bash
npm run dev
```

4. **В Telegram**:
   - Отправьте команду `/start`
   - Выберите "AI Reels Template 1"
   - Загрузите любое изображение
   - Введите любой текст (голос не нужен)
   - Дождитесь завершения

5. **Анализируйте логи**:

**Если Step 4 НЕ вызывается, вы увидите**:
```
✅ [AI REELS FAL WAN 2.5] Generation completed
🔄 Before ctx.wizard.next(): currentCursor: 3, totalSteps: 5
🔄 After ctx.wizard.next(): newCursor: 4, totalSteps: 5
❌ [AI REELS] Step 4 not found!
   cursor: 4, totalSteps: 5, allSteps: [...]
```

**Если Step 4 вызывается но валидация fails**:
```
🚀🚀🚀 [AI REELS] STEP 4 ENTRY POINT
❌❌❌ [AI REELS] Step 4 VALIDATION FAILED:
   hasTelegramId: true
   hasFirstVideoUrl: false  ← ПРОБЛЕМА ТУТ
   hasSecondVideoUrl: true
   sessionData: {...}
```

**Если склейка работает**:
```
🚀🚀🚀 [AI REELS] STEP 4 ENTRY POINT
🔗 [AI REELS] Начинаем склеивание видео
📥 [AI REELS] Скачиваем видео
✅ [AI REELS] Видео скачаны, начинаем склеивание
🎬 [AI REELS] Видео склеено, отправляем файл напрямую
📤 [AI REELS] Отправляем финальное видео напрямую
✅ [AI REELS] Финальное видео отправлено
```

## 🔧 Возможные решения

### Если Step 4 не находится:
**Проблема**: `(ctx.wizard as any).steps[ctx.wizard.cursor]` возвращает undefined

**Решение**: Проверить что в WizardScene определено ровно 5 steps (0-4)

### Если валидация fails (нет URL):
**Проблема**: Сессия теряет данные между Step 3 и Step 4

**Решение**:
1. Не делать множественные `ctx.reply` между сохранением и вызовом
2. Использовать Inngest для долгих операций
3. Сохранять в базу вместо сессии

### Если склейка не работает внутри бота:
**Проблема**: FFmpeg или permissions

**Решение**: Проверить что FFmpeg установлен и доступен в production

## 📊 Ожидаемый результат

С тестовым режимом (`USE_TEST_LIPSYNC=true`):
1. Step 2: использует хардкорнутый lip-sync URL (0⭐)
2. Step 3: использует хардкорнутый WAN 2.5 URL (0⭐)
3. Step 4: скачивает оба видео, склеивает, отправляет пользователю
4. **Время выполнения**: ~5-10 секунд (без генерации)
5. **Результат**: финальное видео ~4.5MB, 2 видео склеены

## 🚨 Следующие шаги

1. **Запустите тест** с USE_TEST_LIPSYNC=true
2. **Скопируйте все логи** начиная с "Step 3 STARTED" до конца
3. **Найдите ключевые маркеры**:
   - `🔄 Before/After ctx.wizard.next()`
   - `🚀🚀🚀 STEP 4 ENTRY POINT`
   - `❌❌❌ Step 4 VALIDATION FAILED` (если есть)
   - `🔗 Начинаем склеивание` (если есть)

4. **На основе логов** определим точную причину проблемы

## 📁 Измененные файлы

- `src/scenes/lipSyncWizard/ai-reels-wizard.ts` - тестовый режим + логирование
- `test-video-merge.ts` - тестовый скрипт для склейки (✅ passed)
- `.env` - USE_TEST_LIPSYNC=true (строка 194)

## 💡 Улучшения промптов WAN 2.5

**ПОСЛЕ** исправления склейки нужно:
1. Создать промпты которые "распаковывают идею" из текста
2. Генерировать визуал который объясняет что было сказано
3. Сделать WAN 2.5 видео контекстно релевантным lip-sync

**Примеры промптов**:
- Если говорится о путешествии → визуал с дорогой, картой
- Если о технологиях → визуал с гаджетами, кодом
- Если о природе → визуал с пейзажами, животными

Но это только после того как склейка заработает!
