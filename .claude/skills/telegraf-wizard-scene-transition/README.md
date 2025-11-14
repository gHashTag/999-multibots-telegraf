# Telegraf WizardScene Transition Bug Fix

## Проблема

Кнопка "🎥 Фото в видео" требовала **два нажатия** вместо одного для запуска wizard.

### Симптомы:
- Первое нажатие: wizard входит, но пользователь не получает сообщение
- Второе нажатие: wizard работает нормально
- Logs показывают: wizard entered successfully, но Step 0 не выполняется

### Код с ошибкой:
```typescript
// CheckBalanceScene.ts - НЕПРАВИЛЬНО
if (mode === ModeEnum.ImageToVideo) {
  try {
    // ❌ БЕЗ ctx.scene.leave()!
    await ctx.scene.enter('image_to_video')
    return
  } catch (error) {
    // ...
  }
}
```

## Root Cause

**Commit b8c9e26c5** удалил `ctx.scene.leave()` перед `ctx.scene.enter()` для ImageToVideo.

### Техническая причина:

1. **Telegraf WizardScene Lifecycle**: `.enter()` handler выполняется ДО инициализации wizard context
2. **Update Consumption**: Без `ctx.scene.leave()` update (нажатие кнопки) "потребляется" во время перехода между сценами
3. **Race Condition**: Wizard входит, но первый шаг получает уже обработанный (dead) update
4. **Первый шаг wizard**: Выполняется только на СЛЕДУЮЩЕМ сообщении пользователя после `.enter()`

### Почему это происходит:

```typescript
// Когда пользователь нажимает кнопку:
// 1. Update приходит в CheckBalanceScene
// 2. CheckBalanceScene вызывает ctx.scene.enter('image_to_video')
// 3. БЕЗ ctx.scene.leave(): update все еще "активен" во время перехода
// 4. Wizard входит, но update уже "употреблен" CheckBalanceScene
// 5. Первый шаг wizard выполняется, но с пустым/dead update
// 6. Пользователю не приходит сообщение от первого шага
// 7. Требуется ВТОРОЕ нажатие, чтобы wizard получил "свежий" update
```

## Решение

### Правильный паттерн (как в TextToVideo):

```typescript
// CheckBalanceScene.ts - ПРАВИЛЬНО
if (mode === ModeEnum.ImageToVideo) {
  try {
    // ✅ КРИТИЧЕСКОЕ: Выходим из текущей сцены перед входом в wizard
    await ctx.scene.leave()
    await ctx.scene.enter('image_to_video')
    return
  } catch (error) {
    // ...
  }
}
```

### Файлы для исправления:

**CheckBalanceScene.ts** (строки 919-924):
```typescript
try {
  // 🚨 КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ
  console.log('🎯 [DEBUG] Leaving current scene before entering wizard')
  await ctx.scene.leave()  // ✅ ОБЯЗАТЕЛЬНО!
  console.log('🎯 [DEBUG] Left current scene, now entering image_to_video')
  await ctx.scene.enter('image_to_video')
  console.log('🎯 [DEBUG] Successfully entered image_to_video scene')
} catch (sceneEnterError) {
  // ...
}
```

## Правило "Семь раз отмерь, один раз отрежь"

### Что делать ПЕРЕД исправлением:

1. **Изучить git history** за последние 3 дня:
   ```bash
   git log --oneline --since="3 days ago" -- src/scenes/
   ```

2. **Найти рабочую реализацию** (TextToVideo) и сравнить:
   ```bash
   git diff HEAD~5..HEAD src/scenes/textToVideoWizard/index.ts
   ```

3. **Проанализировать паттерн** через Task agent:
   ```
   Запусти telegram-scene-builder agent для глобального анализа
   ```

4. **Сравнить структуру** рабочего и сломанного wizard:
   - TextToVideo: HAS `ctx.scene.leave()` ✅
   - ImageToVideo: NO `ctx.scene.leave()` ❌

5. **Применить решение ОДИН РАЗ** после полного понимания

### Что НЕ делать:

❌ Не пытаться исправить через `.enter()` handler wizard
❌ Не добавлять сообщения в `.enter()` handler
❌ Не пробовать множество вариантов методом "trial-and-error"
❌ Не думать, что wizard "сам выйдет" из предыдущей сцены

## Ключевые технические концепции

### 1. Telegraf WizardScene Lifecycle

```typescript
export const imageToVideoWizard = new Scenes.WizardScene<MyContext>(
  'image_to_video',

  // ========== ШАГ 1 (ПЕРВЫЙ ШАГ) ==========
  async (ctx) => {
    // Этот код выполняется на СЛЕДУЮЩЕМ update после ctx.scene.enter()
    // НЕ на том же update, который вызвал enter()!

    await ctx.reply('🖼️ Отправьте изображение')
    ctx.wizard.next()
    return
  },
  // ... остальные шаги
)

// ❌ НЕ ИСПОЛЬЗУЙТЕ .enter() handler!
// Он выполняется ДО инициализации wizard context
// В этот момент ctx.wizard не существует
```

### 2. Scene Transition Pattern

```typescript
// ПРАВИЛЬНЫЙ паттерн для всех wizard:
await ctx.scene.leave()  // 1. Выходим из текущей сцены
await ctx.scene.enter('wizard_name')  // 2. Входим в wizard

// НЕПРАВИЛЬНЫЙ паттерн:
await ctx.scene.enter('wizard_name')  // ❌ Update consumed!
```

### 3. Unified Navigation System

Все кнопки меню управляются из одного файла:
- `src/navigation/unified-navigation.config.ts`
- Все wizard входят через `CheckBalanceScene.ts`
- CheckBalanceScene проверяет доступ и балансы
- CheckBalanceScene вызывает `ctx.scene.enter()` для target wizard

## Связанные файлы

1. **CheckBalanceScene.ts** (строки 856-957)
   - Центральная точка входа для всех wizard
   - Проверка баланса и доступа
   - **КРИТИЧНО**: Должен вызывать `ctx.scene.leave()` перед `ctx.scene.enter()`

2. **textToVideoWizard/index.ts** (строки 17-56)
   - РАБОЧАЯ реализация wizard
   - Паттерн для копирования

3. **imageToVideoWizard/index.ts** (строки 144-181)
   - Исправленная реализация wizard
   - НЕТ `.enter()` handler

4. **unified-navigation.config.ts** (строки 107-114)
   - Конфигурация кнопки "🎥 Фото в видео"

## Git History

### Проблемный commit:
```
b8c9e26c5 - Удалил ctx.scene.leave() для ImageToVideo
```

### Исправляющий commit:
```
ebb2a751 - 🐛 FIX: Restore ctx.scene.leave() for ImageToVideo wizard
```

## Deployment

После исправления:

```bash
# 1. Commit изменения
git add src/scenes/checkBalanceScene.ts
git commit -m "🐛 FIX: Restore ctx.scene.leave() for ImageToVideo wizard"
git push origin production

# 2. Deploy на production
scp src/scenes/checkBalanceScene.ts prod999:/root/bot-farm/src/scenes/checkBalanceScene.ts
ssh prod999 "cd /root/bot-farm && docker compose restart app"
```

## Проверка решения

После деплоя проверить:
1. Открыть бота в Telegram
2. Нажать "🎥 Фото в видео" ОДИН РАЗ
3. Должно сразу прийти сообщение: "🖼️ Отправьте изображение для создания видео"
4. Wizard должен работать с первого нажатия

## Урок

**"Семь раз отмерь, один раз отрежь"**

- Изучи git history
- Найди рабочую реализацию
- Сравни паттерны
- Поймі причину
- Примени решение ОДИН РАЗ
- Задокументируй для будущего

## Unified Video Models Config

### Проблема дублирования кода

**До исправления** (в ImageToVideo wizard):
```typescript
// ❌ НЕПРАВИЛЬНО: Хардкод моделей и цен
function createImageToVideoButton(modelId: string, aspectRatio: string, isRu: boolean): string {
  let stars: number
  switch (modelId) {
    case 'veo3_fast': stars = 40; break
    case 'veo3': stars = 120; break
    // ... еще 8 моделей с хардкодом цен
  }
  return `${modelName}${durationText} | ${aspectIcon} (${stars}⭐)`
}

function parseImageToVideoSelection(buttonText: string) {
  // ❌ НЕПРАВИЛЬНО: Дублирование логики парсинга
  if (buttonText.includes('Veo 3 Fast')) {
    modelId = 'veo3_fast'
    cost = 40
    duration = 8
  } // ... еще 8 else if блоков
}

// ❌ НЕПРАВИЛЬНО: Хардкод списка моделей
const supportedModels = ['veo3_fast', 'veo3', 'kling-v1.6-pro', ...]
```

**После исправления** (используем unified config):
```typescript
// ✅ ПРАВИЛЬНО: Импортируем из единого источника правды
import { generateModelButton, parseModelButton, generateModelKeyboard } from '@/config/unified-video-models.config'

// ✅ ПРАВИЛЬНО: Автоматически берёт все активные модели с правильными ценами
const keyboardRows = generateModelKeyboard('image', isRu)

// ✅ ПРАВИЛЬНО: Парсинг через unified config
const parsedModel = parseModelButton(selectedText)
```

### Единый источник правды: unified-video-models.config.ts

Файл `/src/config/unified-video-models.config.ts` содержит:

1. **UNIFIED_VIDEO_MODELS** - реестр всех видео-моделей с:
   - Ценами (в звёздах)
   - Длительностью
   - Поддерживаемыми форматами (16:9, 9:16)
   - Типами входа (text, image, morph)
   - Статусом (active, deprecated, broken)

2. **generateModelKeyboard(inputType, isRu)** - создание клавиатуры:
   - `inputType: 'text' | 'image' | 'morph'`
   - Автоматически фильтрует только активные модели
   - Создаёт ряды: горизонтальные (16:9) слева, вертикальные (9:16) справа
   - Возвращает `string[][]` для Markup.keyboard()

3. **generateModelButton(modelId, aspectRatio, isRu)** - создание отдельной кнопки:
   - Форматирует: `"Название | 8s | 🖥️ (25⭐)"`
   - Берёт цены и длительность из unified config
   - Автоматически определяет иконку (📱 для 9:16, 🖥️ для 16:9)

4. **parseModelButton(buttonText)** - парсинг выбранной кнопки:
   - Возвращает `{ modelId, aspectRatio, duration, cost, resolution }`
   - Всегда возвращает валидный результат (fallback к veo3_fast)
   - НЕ возвращает null!

### Примеры использования

#### TextToVideo (правильный паттерн):
```typescript
// Шаг 1: Показ клавиатуры моделей
export const textToVideoWizard = new Scenes.WizardScene<MyContext>(
  'text_to_video',

  // ШАГ 1: ВЫБОР МОДЕЛИ
  async (ctx) => {
    const isRu = isRussianFromState(ctx)

    // ✅ ИСПОЛЬЗУЕМ ЦЕНТРАЛИЗОВАННУЮ ФУНКЦИЮ
    const keyboardRows = generateModelKeyboard('text', isRu)

    if (keyboardRows.length === 0) {
      await ctx.reply('❌ Модели не найдены.')
      return ctx.scene.leave()
    }

    // Добавляем кнопки навигации
    keyboardRows.push([
      isRu ? '⬅️ Назад в меню' : '⬅️ Back to Menu',
      isRu ? '❌ Отмена' : '❌ Cancel'
    ])

    await ctx.reply(
      isRu
        ? `🎥 Выберите модель и формат видео:\n\n🖥️ Горизонтальные (16:9) — слева\n📱 Вертикальные (9:16) — справа\n\n⭐ Цена в Telegram Stars`
        : `🎥 Choose model and video format:\n\n🖥️ Horizontal (16:9) — left\n📱 Vertical (9:16) — right\n\n⭐ Price in Telegram Stars`,
      Markup.keyboard(keyboardRows).resize()
    )

    ctx.wizard.next()
  },

  // ШАГ 2: ОБРАБОТКА ВЫБОРА МОДЕЛИ И ПРОМПТА
  async (ctx) => {
    const message = ctx.message
    if (!message || !('text' in message)) return

    const selectedText = message.text

    // ✅ ИСПОЛЬЗУЕМ ЦЕНТРАЛИЗОВАННУЮ ФУНКЦИЮ ПАРСИНГА
    const parsedModel = parseModelButton(selectedText)

    // Сохраняем в сессию
    ctx.session.selectedVideoModel = parsedModel.modelId
    ctx.session.selectedAspectRatio = parsedModel.aspectRatio
    ctx.session.selectedVideoCost = parsedModel.cost
    ctx.session.selectedDuration = parsedModel.duration

    // ... генерация видео
  }
)
```

#### ImageToVideo (исправленный паттерн):
```typescript
export const imageToVideoWizard = new Scenes.WizardScene<MyContext>(
  'image_to_video',

  // ШАГ 1: ЗАГРУЗКА ИЗОБРАЖЕНИЯ
  async (ctx) => {
    await ctx.reply('🖼️ Отправьте изображение для создания видео:')
    ctx.wizard.next()
  },

  // ШАГ 2: ПОКАЗ КЛАВИАТУРЫ МОДЕЛЕЙ
  async (ctx) => {
    // Получаем изображение
    const photo = ctx.message.photo[ctx.message.photo.length - 1]
    const fileLink = await ctx.telegram.getFileLink(photo.file_id)
    ctx.session.imageUrl = fileLink.href

    // ✅ ИСПОЛЬЗУЕМ ЦЕНТРАЛИЗОВАННУЮ ФУНКЦИЮ (автоматически берет все активные модели)
    const keyboardRows = generateModelKeyboard('image', isRu)

    if (keyboardRows.length === 0) {
      await ctx.reply('❌ Модели не найдены.')
      return ctx.scene.leave()
    }

    keyboardRows.push([
      isRu ? '⬅️ Назад в меню' : '⬅️ Back to Menu',
      isRu ? '❌ Отмена' : '❌ Cancel'
    ])

    await ctx.reply(
      isRu
        ? `✅ Изображение получено!\n\n🎥 Выберите модель и формат видео:\n\n🖥️ Горизонтальные (16:9) — слева\n📱 Вертикальные (9:16) — справа\n\n⭐ Цена в Telegram Stars`
        : `✅ Image received!\n\n🎥 Choose model and video format:\n\n🖥️ Horizontal (16:9) — left\n📱 Vertical (9:16) — right\n\n⭐ Price in Telegram Stars`,
      Markup.keyboard(keyboardRows).resize()
    )

    ctx.wizard.next()
  },

  // ШАГ 3: ОБРАБОТКА ВЫБОРА МОДЕЛИ
  async (ctx) => {
    const selectedText = ctx.message.text

    // ✅ ИСПОЛЬЗУЕМ ЦЕНТРАЛИЗОВАННУЮ ФУНКЦИЮ ПАРСИНГА
    const parsedModel = parseModelButton(selectedText)

    ctx.session.selectedVideoModel = parsedModel.modelId
    ctx.session.selectedAspectRatio = parsedModel.aspectRatio
    ctx.session.selectedVideoCost = parsedModel.cost
    ctx.session.selectedDuration = parsedModel.duration

    await ctx.reply('📝 Теперь опишите, что должно происходить в видео:')
    ctx.wizard.next()
  },

  // ШАГ 4: ГЕНЕРАЦИЯ ВИДЕО
  async (ctx) => {
    const prompt = ctx.message.text
    // ... генерация видео
  }
)
```

### Правила использования

❌ **НИКОГДА НЕ ДЕЛАЙ:**
1. Хардкод цен моделей в wizard файлах
2. Дублирование логики создания кнопок
3. Дублирование логики парсинга кнопок
4. Хардкод списка поддерживаемых моделей
5. Использование своих функций вместо unified config

✅ **ВСЕГДА ДЕЛАЙ:**
1. Импортируй из `unified-video-models.config.ts`
2. Используй `generateModelKeyboard()` для создания клавиатуры
3. Используй `parseModelButton()` для парсинга выбора
4. Добавляй новые модели в `UNIFIED_VIDEO_MODELS`
5. Обновляй цены только в unified config

### Преимущества unified config

1. **Единый источник правды** - все модели, цены и настройки в одном файле
2. **Автоматическое обновление** - изменения сразу влияют на все wizard'ы
3. **Нет дублирования** - одна логика для всех wizard'ов
4. **Проще добавлять модели** - одна запись в UNIFIED_VIDEO_MODELS
5. **Type safety** - TypeScript проверяет корректность конфигурации
6. **Валидация с Zod** - автоматическая проверка конфигурации при загрузке

---

**Created:** 2025-11-12
**Updated:** 2025-11-12
**Commits:**
- ebb2a751 - 🐛 FIX: Restore ctx.scene.leave() for ImageToVideo wizard
- [новый] - ♻️ REFACTOR: Replace hardcoded models with unified-video-models.config

**Status:** ✅ Fixed and deployed
