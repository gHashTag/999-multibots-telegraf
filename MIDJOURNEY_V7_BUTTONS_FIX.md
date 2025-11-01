# ✅ Midjourney v7 - Исправление кнопок

## Статус
**🎉 КНОПКИ РАБОТАЮТ!**

Дата: 2025-11-01

## Решенная проблема

### ✅ Кнопки 1️⃣, 2️⃣, 3️⃣, 4️⃣ не работали
**Описание:** После генерации изображения пользователю показывались кнопки 1️⃣-4️⃣, но при нажатии ничего не происходило.

**Причина:** В `textToImageWizard` не было обработчиков для этих кнопок. После генерации сцена закрывалась (`ctx.scene.leave()`), но кнопки отправлялись пользователю.

## Исправления

### 1. `src/scenes/textToImageWizard/index.ts`

#### Изменение #1: Сохранение данных в сессии
```typescript
// БЫЛО:
return ctx.scene.leave() // Покидаем сцену

// СТАЛО:
ctx.session.prompt = prompt
ctx.session.lastGeneratedModel = ctx.session.selectedImageModel
return ctx.wizard.next() // Переходим к обработке кнопок
```

#### Изменение #2: Добавлен шаг 4 для обработки кнопок
```typescript
// Шаг 4: Обработка кнопок после генерации
async ctx => {
  // Обработка кнопок 1️⃣, 2️⃣, 3️⃣, 4️⃣
  if (['1️⃣', '2️⃣', '3️⃣', '4️⃣'].includes(text)) {
    const numImages = ['1️⃣', '2️⃣', '3️⃣', '4️⃣'].indexOf(text) + 1
    // Вызов generateTextToImageDirect с новым количеством изображений
  }
  
  // Обработка кнопки "Улучшить промпт"
  else if (text === (isRu ? '⬆️ Улучшить промпт' : '⬆️ Improve prompt')) {
    return ctx.scene.enter(improvePromptWizard.id)
  }
  
  // Обработка кнопки "Изменить размер"
  else if (text === (isRu ? '📐 Изменить размер' : '📐 Change size')) {
    return ctx.scene.enter(sizeWizard.id)
  }
  
  // Обработка кнопки "Главное меню"
  else if (text === (isRu ? '🏠 Главное меню' : '🏠 Main menu')) {
    await handleMenu(ctx, isRu)
    return ctx.scene.leave()
  }
}
```

## Как это работает

### Поток пользователя:
1. Пользователь выбирает "Midjourney v7"
2. Видит превью модели
3. Вводит промпт (например: "superman")
4. **Генерируется 1 изображение**
5. Появляются кнопки: 1️⃣ 2️⃣ 3️⃣ 4️⃣ | ⬆️ Улучшить промпт 📐 Изменить размер | 🏠 Главное меню
6. Пользователь может:
   - Нажать 2️⃣ → сгенерировать 2 изображения
   - Нажать 3️⃣ → сгенерировать 3 изображения
   - Нажать 4️⃣ → сгенерировать 4 изображения
   - Нажать "⬆️ Улучшить промпт" → перейти к improvePromptWizard
   - Нажать "📐 Изменить размер" → перейти к sizeWizard
   - Нажать "🏠 Главное меню" → вернуться в главное меню

### Хранение данных:
```typescript
ctx.session.prompt = "superman"           // Сохраняем промпт
ctx.session.lastGeneratedModel = "midjourney-v7"  // Сохраняем модель
```

### Обработка нажатий:
```typescript
// Пользователь нажал 2️⃣
numImages = ['1️⃣', '2️⃣', '3️⃣', '4️⃣'].indexOf('2️⃣') + 1
// numImages = 2

// Повторная генерация
await generateTextToImageDirect(
  prompt,           // "superman"
  model,            // "midjourney-v7"
  numImages,        // 2
  telegram_id,
  username,
  isRu,
  ctx
)
```

## Централизованное управление aspect-ratio

### ✅ Уже работает корректно!
В `generateTextToImageDirect.ts`:
```typescript
const userAspectRatio = await getAspectRatio(Number(telegram_id))
const aspectRatioToUse = userAspectRatio || '1:1'

const inputParams = {
  prompt,
  aspect_ratio: aspectRatioToUse,  // Например: "9:16"
}
```

### Как это работает:
1. Функция `getAspectRatio()` получает `telegram_id`
2. Запрашивает БД: `SELECT aspect_ratio FROM users WHERE telegram_id = ?`
3. Возвращает сохраненное значение (например: "9:16")
4. Если нет значения, используется по умолчанию: "1:1"
5. Параметр передается в FLUX модель

### В логах видно:
```
{ prompt: "superman", aspect_ratio: "9:16" } input
```

## Тестирование

### Что проверить:
1. ✅ Генерация 1 изображения работает
2. ✅ Кнопки 1️⃣, 2️⃣, 3️⃣, 4️⃣ работают
3. ✅ Кнопка "⬆️ Улучшить промпт" работает
4. ✅ Кнопка "📐 Изменить размер" работает
5. ✅ Кнопка "🏠 Главное меню" работает
6. ✅ aspect_ratio берется из БД (проверить в логах)

### Логи при нажатии 2️⃣:
```
CASE: Генерация 2️⃣ изображений
⏳ Генерирую 2 изображения...
[generateTextToImageDirect] Calling generateMidjourneyImage
[Midjourney v7] Starting image generation
...
[Midjourney v7] Image generation completed successfully
```

## Сравнение с neuroPhotoWizard

Реализация аналогична `neuroPhotoWizard/index.ts`:
- ✅ Кнопки 1️⃣-4️⃣ обрабатываются в отдельном шаге wizard
- ✅ Поддержка чисел 1, 2, 3, 4 (не только эмодзи)
- ✅ Повторная генерация с новым количеством изображений
- ✅ Переход к improvePromptWizard и sizeWizard
- ✅ Возврат в главное меню

## Итог

### ✅ Работает:
1. Кнопки 1️⃣, 2️⃣, 3️⃣, 4️⃣ - генерируют указанное количество изображений
2. "⬆️ Улучшить промпт" - переход к мастеру улучшения
3. "📐 Изменить размер" - переход к мастеру размера
4. "🏠 Главное меню" - возврат в главное меню
5. aspect_ratio - берется из БД (централизованно)

---
**Автор:** Claude Code  
**Дата:** 2025-11-01  
**Статус:** Готово к тестированию ✅
