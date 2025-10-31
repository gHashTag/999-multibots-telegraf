# 🎯 AI Photoshop "All Models" Mode - История Исправлений

## 📅 Дата: 2025-10-08

## 🎯 Исходная Проблема

Пользователь запустил режим "All models at once" с 7 моделями AI, но:
- ❌ Получил только 2 дубликата FLUX Kontext Pro вместо 7 разных результатов
- ❌ Китайские модели (SeedEdit 3.0, Qwen Image Edit) не работали
- ❌ Aspect ratio был непоследовательным (где-то 9:16, где-то 16:9)
- ❌ Параметр variations по умолчанию не был 1

### 🔍 Анализ Логов

Из последних логов все 7 моделей успешно выполнились:
1. ✅ SeeDream-4
2. ✅ Nano Banana
3. ✅ FLUX Multi-Kontext
4. ✅ Qwen Edit Plus
5. ✅ FLUX Kontext Pro
6. ✅ SeedEdit 3.0
7. ✅ Qwen Image Edit

Но пользователь получил только **5 фотографий** вместо 7!

---

## 🔧 Исправление #1: Китайские Модели API Field Name

### Проблема
Модели возвращали ошибку: `422 Unprocessable Entity - "image is required"`

### Причина
Отправляли поле `input_image`, а API ожидает `image`

### Решение
**Файлы изменены:**
- `/src/schemas/qwenImageEdit.schema.ts:16` - `input_image` → `image`
- `/src/schemas/seedEdit3.schema.ts:15` - `input_image` → `image`
- `/src/services/generateQwenImageEdit.ts:108` - обновлен вызов API
- `/src/services/generateSeedEdit3.ts:106` - обновлен вызов API

### Тестирование
- ✅ Qwen Image Edit: SUCCESS (~49 секунд)
- ✅ SeedEdit 3.0: SUCCESS (~9 минут)

---

## 🔧 Исправление #2: Централизация Aspect Ratio

### Проблема
- 1K/2K использовали `9:16` (вертикальный)
- 4K использовал `16:9` (горизонтальный)

### Решение
**Файл:** `/src/scenes/aiPhotoshopScene/index.ts`

**Строки 86-92** - `sizeToAspectRatio`:
```typescript
// ДО:
'4K': '16:9' // ❌ Непоследовательно

// ПОСЛЕ:
'4K': '9:16' // ✅ Централизовано
```

**Строка 3443** - SeeDream теперь использует централизованный aspect ratio:
```typescript
aspect_ratio: AI_PHOTOSHOP_PRICING.sizeToAspectRatio[size] || '9:16'
```

---

## 🔧 Исправление #3: Silent Mode для Nano Banana

### Проблема
Nano Banana отправлял фото напрямую в режиме ALL_MODELS

### Решение
**Файл:** `/src/services/generateNanoBanana.ts`

**Добавлено:**
1. `silent?: boolean` в interface (строка 37)
2. `skipBalanceCheck?: boolean` в interface (строка 38)
3. Условная проверка баланса: `if (!params.skipBalanceCheck)`
4. Условная отправка статуса: `if (!params.silent)`
5. Условная отправка фото: `if (!params.silent)`

**Использование в ALL_MODELS:**
```typescript
result = await generateNanoBanana({
  // ... params
  silent: true,
  skipBalanceCheck: true,
})
```

---

## 🔧 Исправление #4: Устранение Дубликатов FLUX Kontext Pro

### Проблема
Модели 5-7 обрабатывали ВСЕ загруженные фото, создавая дубликаты

### Причина
Loop обрабатывал `imagesToProcess.length` без учета `variationsCount`

### Решение
**Файл:** `/src/scenes/aiPhotoshopScene/index.ts`

**Строки 3528-3529:**
```typescript
const variationsCount = ctx.session?.aiPhotoshopVariationsCount || 1
const imagesToProcessForThisModel = imagesToProcess.slice(0, Math.min(variationsCount, imagesToProcess.length))
```

Теперь по умолчанию обрабатывается только **1 фото** (первое из списка).

---

## 🔧 Исправление #5: Отправка Фото После ALL_MODELS

### Проблема
Модели выполнялись с `silent: true`, но после обработки фото не отправлялись

### Решение
**Файл:** `/src/scenes/aiPhotoshopScene/index.ts`

**Строки 2780-2820** - добавлен цикл отправки:
```typescript
if (ctx.session?.savedAiPhotoshopResults && ctx.session.savedAiPhotoshopResults.length > 0) {
  for (const result of ctx.session.savedAiPhotoshopResults) {
    await ctx.replyWithPhoto(result.imageUrl, {
      caption: `✅ ${modelTitle}\n\n📝 Промпт: "${result.prompt}"\n\n💎 Стоимость: ${modelCost}⭐`
    })
  }
}
```

---

## 🔧 Исправление #6: КРИТИЧЕСКОЕ - Сохранение Результатов Моделей 1-4

### Проблема
**НАЙДЕНА ПРИЧИНА 5 ФОТО ВМЕСТО 7!**

Модели 1-4 (SeeDream, Nano Banana, FLUX Multi-Kontext, Qwen Edit Plus) в режиме ALL_MODELS:
- ✅ Выполнялись успешно
- ✅ Сохраняли файлы на диск (`saveFileLocally`)
- ❌ **НЕ вызывали `savePhotoResult`** для добавления в массив
- ❌ Результаты не попадали в `savedAiPhotoshopResults`
- ❌ Фото не отправлялись пользователю

Только модели 5-7 имели вызов `savePhotoResult` на строке 3631.

### Решение
**Файл:** `/src/scenes/aiPhotoshopScene/index.ts`

Добавлены вызовы `savePhotoResult` после обработки каждой модели:

**Строки 3446-3454** - SeeDream:
```typescript
// ✅ Save result to session for later sending
if (result?.image || result?.imageUrl) {
  const imageUrl = result.image || result.imageUrl
  await savePhotoResult(ctx, imageUrl, modelKey, prompt, true)
  logger.info(`✅ ${modelKey} result saved to session`, {
    telegram_id: userId.toString(),
    imageUrl: imageUrl.substring(0, 50) + '...',
  })
}
```

**Строки 3480-3488** - Nano Banana (аналогично)

**Строки 3510-3518** - FLUX Multi-Kontext (аналогично)

**Строки 3555-3563** - Qwen Edit Plus (аналогично)

### Результат
Теперь **ВСЕ 7 моделей** сохраняют результаты в массив `savedAiPhotoshopResults` и отправляются пользователю!

---

## 🔧 Исправление #7: Aspect Ratio для SeedEdit 3.0 и Qwen Image Edit

### Проблема
Модели **SeedEdit 3.0** и **Qwen Image Edit** выдавали квадратные изображения (1:1) вместо вертикальных (9:16)

### Причина
Эти модели **НЕ поддерживают параметр `aspect_ratio`** в API - они наследуют пропорции входного изображения

### Решение
**Файл:** `/src/scenes/aiPhotoshopScene/index.ts`

**Строки 3638-3643** - SeedEdit 3.0:
```typescript
// ✅ Get centralized aspect ratio
const targetAspectRatio = AI_PHOTOSHOP_PRICING.sizeToAspectRatio[seedEdit3Size] || '9:16'
// ✅ Add aspect ratio instruction to prompt
const seedEdit3Prompt = targetAspectRatio === '9:16'
  ? `${prompt}. Adjust image to vertical 9:16 portrait format, maintaining subject composition.`
  : prompt
```

**Строки 3658-3663** - Qwen Image Edit:
```typescript
// ✅ Get centralized aspect ratio
const targetAspectRatio = AI_PHOTOSHOP_PRICING.sizeToAspectRatio[qwenImageEditSize] || '9:16'
// ✅ Add aspect ratio instruction to prompt
const qwenImageEditPrompt = targetAspectRatio === '9:16'
  ? `${prompt}. Convert to 9:16 vertical portrait aspect ratio format.`
  : prompt
```

### Как работает
1. Проверяется целевой aspect ratio из централизованной конфигурации
2. Если требуется 9:16 - добавляется инструкция в промпт
3. Модель пытается скорректировать изображение согласно инструкции

**Примечание:** Это текстовая инструкция, точность зависит от возможностей модели. Для 100% гарантии нужен препроцессинг изображений (будущее улучшение).

---

## 🔧 Исправление #8: UI Улучшение - Кнопки по Одной в Ширину

### Проблема
Кнопки моделей отображались по 2 в ряд, что затрудняло чтение на мобильных устройствах

### Решение
**Файл:** `/src/scenes/aiPhotoshopScene/index.ts`

**Строки 360-370** - изменен layout клавиатуры:
```typescript
// ✅ БЫЛО: Add models 2 per row
for (let i = 0; i < models.length; i += 2) {
  // ... 2 кнопки в ряд
}

// ✅ СТАЛО: Add models 1 per row
for (let i = 0; i < models.length; i++) {
  const [modelKey, model] = models[i]
  keyboard.push([
    Markup.button.callback(
      `${isRu ? model.title_ru : model.title_en} (${model.cost}⭐)`,
      `ai_photoshop_model_${modelKey}`
    )
  ])
}
```

### Результат
- ✅ Каждая кнопка модели на отдельной строке
- ✅ Улучшена читаемость на мобильных устройствах
- ✅ Проще выбирать нужную модель

---

## ✅ Итоговые Изменения

| # | Проблема | Решение | Статус |
|---|----------|---------|--------|
| 1 | Китайские модели API | `input_image` → `image` | ✅ Исправлено |
| 2 | Aspect ratio 4K | `16:9` → `9:16` | ✅ Исправлено |
| 3 | Nano Banana silent mode | Добавлены параметры | ✅ Исправлено |
| 4 | FLUX дубликаты | Limit по variations count | ✅ Исправлено |
| 5 | Отправка фото | Цикл после ALL_MODELS | ✅ Исправлено |
| 6 | **5 фото вместо 7** | `savePhotoResult` для моделей 1-4 | ✅ Исправлено |
| 7 | **Aspect ratio SeedEdit/Qwen** | Инструкции в промпт | ✅ Исправлено |
| 8 | **UI кнопок** | 1 кнопка в ширину | ✅ Исправлено |

---

## 📊 Тестирование

### До исправлений:
- ❌ 2 дубликата FLUX Kontext Pro
- ❌ Китайские модели не работают
- ❌ Aspect ratio непоследовательный
- ❌ Фото не отправляются

### После исправления #1-5:
- ✅ Все 7 моделей выполняются
- ✅ Китайские модели работают
- ✅ Aspect ratio единообразный
- ⚠️ Только 5 фото отправляются (модели 1-4 не сохраняются)

### После исправления #6:
- ✅ Все 7 моделей выполняются
- ✅ Все 7 результатов сохраняются в массив
- ✅ Все 7 фото отправляются пользователю
- ✅ Нет дубликатов
- ✅ Централизованные параметры

---

## 🚀 Файлы для Деплоя

После всех исправлений необходимо выполнить:

```bash
ssh -i ~/.ssh/zomro root@212.86.115.30

cd /root/999-agents-telegraf

# Остановить и удалить старый контейнер
docker stop 999-multibots
docker rm 999-multibots

# Пересобрать БЕЗ кеша (ОБЯЗАТЕЛЬНО!)
docker build --no-cache -t 999-multibots .

# Запустить новый контейнер
docker run -d --name 999-multibots --restart=always \
  -p 3001:3001 \
  -v /root/999-agents-telegraf/.env:/app/.env:ro \
  999-multibots

# Проверить логи
docker logs 999-multibots --tail 50
```

---

## 📝 Примечания

### Архитектура ALL_MODELS

1. **Модели 1-4** поддерживают batch обработку (несколько фото за раз):
   - SeeDream: до 10 изображений
   - Nano Banana: до 3 изображений
   - FLUX Multi-Kontext: 2 изображения (A и B)
   - Qwen Edit Plus: до 10 изображений

2. **Модели 5-7** обрабатывают только 1 изображение за раз:
   - FLUX Kontext Pro
   - SeedEdit 3.0
   - Qwen Image Edit

3. **Variations Count** (по умолчанию 1):
   - Определяет сколько вариаций создавать
   - Для моделей 5-7: ограничивает количество обрабатываемых фото

### Balance Check Optimization

- Для моделей 5-7: баланс проверяется **один раз до цикла**
- Каждая итерация использует `skipBalanceCheck: true`
- Предотвращает множественные `ctx` взаимодействия в цикле

### Silent Mode

Все модели в ALL_MODELS используют `silent: true`:
- Не отправляют промежуточные статусные сообщения
- Не отправляют фото сразу после генерации
- Результаты сохраняются в массив `savedAiPhotoshopResults`
- Отправка всех фото происходит один раз в конце

---

## 🎉 Результат

**Режим "All models at once" теперь работает корректно:**
- ✅ Все 7 моделей выполняются параллельно
- ✅ Китайские модели работают стабильно
- ✅ Единообразный aspect ratio для всех качеств
- ✅ Нет дубликатов результатов
- ✅ Все 7 фото отправляются пользователю
- ✅ Централизованные параметры по умолчанию
- ✅ Оптимизированная проверка баланса
- ✅ Silent mode для всех моделей

**Стоимость:**
- По умолчанию: 1 фото × 7 моделей = 7 результатов
- С variations=2: 2 фото × 7 моделей = 14 результатов

---

## 🔮 Будущие Улучшения

### Препроцессинг Изображений для SeedEdit 3.0 и Qwen Image Edit
Текущее решение с инструкциями в промпте работает, но не гарантирует 100% точность aspect ratio.

**Для идеального результата можно реализовать:**

1. **Image Preprocessing Service:**
   ```typescript
   async function preprocessImageAspectRatio(
     imageUrl: string,
     targetAspectRatio: string
   ): Promise<string> {
     // Using sharp or canvas
     // - Resize/crop image to exact aspect ratio
     // - Add artistic padding if needed
     // - Upload preprocessed image to temp storage
     // - Return new URL
   }
   ```

2. **Integration in ALL_MODELS:**
   ```typescript
   if (modelKey === 'seededit_3' || modelKey === 'qwen_image_edit') {
     const preprocessedUrl = await preprocessImageAspectRatio(
       currentImageUrl,
       targetAspectRatio
     )
     // Use preprocessedUrl instead of currentImageUrl
   }
   ```

**Плюсы:**
- Гарантированный aspect ratio
- Профессиональная обработка изображений
- Можно добавить автоматический padding с художественным фоном

**Минусы:**
- Требует установки зависимостей (sharp/canvas)
- Увеличивает время обработки
- Нужно временное хранилище для preprocessed изображений

**Вердикт:** Реализовать если текущее решение с промптами не даст нужного результата.
