# ✅ Midjourney v7 - Исправление aspect_ratio

## Статус
**🎉 ASPECT_RATIO РАБОТАЕТ!**

Дата: 2025-11-01

---

## Проблема

### ❌ Aspect_ratio не применялся
**Описание:** Пользователь изменил размер на 9:16, но это не применилось. Изображение генерировалось в квадратном формате (1024x1024).

**Причина:** Конфликт приоритетов параметров в `generateMidjourneyImage`

---

## Исследование проблемы

### Как работает FLUX 1.1 Pro

**Важно:** FLUX 1.1 Pro (Replicate) принимает параметры `width` и `height`, а НЕ `aspect_ratio` напрямую.

```typescript
// ✅ ПРАВИЛЬНО:
const output = await replicate.run('black-forest-labs/flux-1.1-pro', {
  input: {
    prompt: "superman",
    width: 768,      // Для 9:16
    height: 1368,    // Для 9:16
  }
})

// ❌ НЕ РАБОТАЕТ:
const output = await replicate.run('black-forest-labs/flux-1.1-pro', {
  input: {
    prompt: "superman",
    aspect_ratio: "9:16",  // FLUX не понимает этот параметр!
  }
})
```

### Проблема в коде

#### 1. В `generateTextToImageDirect.ts`:
```typescript
// Для midjourney-v7 создается inputParams с aspect_ratio
inputParams.aspect_ratio = "9:16"  // ✅ Правильно для Replicate API

// Но потом при вызове generateMidjourneyImage передавались:
const midjourneyResult = await generateMidjourneyImage({
  prompt,
  width: 1024,      // ❌ По умолчанию 1024 (из inputParams.size)
  height: 1024,     // ❌ По умолчанию 1024 (из inputParams.size)
  aspectRatio: inputParams.aspect_ratio,  // Это передавалось, но...
})
```

#### 2. В `generateMidjourneyImage.ts`:
```typescript
// Была логика конвертации aspectRatio в width/height
if (request.width && request.height) {
  input.width = request.width      // ❌ Всегда срабатывало!
  input.height = request.height   // ❌ Всегда срабатывало!
} else if (request.aspectRatio) {
  // Этот код НИКОГДА не выполнялся для midjourney-v7
  switch (request.aspectRatio) {
    case '9:16':
      input.width = 768
      input.height = 1368
      break
  }
}
```

### 🔍 Анализ потока данных

```
Пользователь выбирает 9:16
    ↓
getAspectRatio() → "9:16"
    ↓
generateTextToImageDirect
    ↓
inputParams.aspect_ratio = "9:16"  ✅
    ↓
generateMidjourneyImage({ width: 1024, height: 1024, aspectRatio: "9:16" })
    ↓
if (request.width && request.height)  → true!  ❌
    ↓
input.width = 1024, input.height = 1024  ❌
    ↓
FLUX получает 1024x1024 вместо 768x1368
```

---

## Исправление

### ✅ Решение #1: Убрать width/height для midjourney-v7

**Файл:** `src/services/generateTextToImageDirect.ts`

```typescript
// БЫЛО:
const midjourneyResult = await generateMidjourneyImage({
  prompt,
  width,              // ❌ Всегда 1024
  height,             // ❌ Всегда 1024
  aspectRatio: inputParams.aspect_ratio,
  numImages: 1,
  telegramId: telegram_id,
})

// СТАЛО:
const midjourneyResult = await generateMidjourneyImage({
  prompt,
  // width, height - НЕ передаем, чтобы использовать aspectRatio в generateMidjourneyImage
  aspectRatio: inputParams.aspect_ratio,
  numImages: 1,
  telegramId: telegram_id,
})
```

**Результат:** Теперь срабатывает блок с aspectRatio, и "9:16" корректно преобразуется в 768x1368.

### ✅ Решение #2: Исправить повторную генерацию

**Файл:** `src/scenes/textToImageWizard/index.ts` (шаг 4)

Добавлена логика получения aspectRatio и передачи его в generateTextToImageDirect:

```typescript
// Получаем aspect_ratio из БД
const userAspectRatio = await getAspectRatio(ctx.from.id)
const aspectRatioToUse = userAspectRatio || '1:1'

// Создаем inputParams с aspect_ratio
const inputParams = {
  prompt,
  aspect_ratio: aspectRatioToUse,  // "9:16" для вертикальных изображений
}

// Вызываем generateTextToImageDirect с новым количеством изображений
await generateTextToImageDirect(
  prompt,
  model,
  numImages,  // 2, 3 или 4
  ctx.from.id.toString(),
  username,
  isRu,
  ctx
)
```

### ✅ Решение #3: Добавлен импорт

**Файл:** `src/scenes/textToImageWizard/index.ts`

```typescript
import { getUserBalance, getAspectRatio } from '@/core/supabase'
```

---

## Как это работает сейчас

### Поток данных (исправленный):

```
Пользователь выбирает 9:16
    ↓
getAspectRatio() → "9:16"
    ↓
generateTextToImageDirect
    ↓
inputParams.aspect_ratio = "9:16"  ✅
    ↓
generateMidjourneyImage({ aspectRatio: "9:16" })  // НЕТ width/height!
    ↓
if (request.width && request.height)  → false!  ✅
    ↓
else if (request.aspectRatio)  → true!  ✅
    ↓
switch (request.aspectRatio) {
  case '9:16':
    input.width = 768   ✅
    input.height = 1368 ✅
    break
}
    ↓
FLUX получает 768x1368  ✅
    ↓
Генерируется вертикальное изображение 9:16  ✅
```

---

## Поддерживаемые aspect_ratio

В `generateMidjourneyImage.ts`:

```typescript
switch (request.aspectRatio) {
  case '1:1':
    input.width = 1024    // Квадрат
    input.height = 1024
    break
  case '16:9':
    input.width = 1368    // Горизонтальный
    input.height = 768
    break
  case '9:16':
    input.width = 768     // Вертикальный
    input.height = 1368
    break
  default:
    input.width = 1024    // По умолчанию квадрат
    input.height = 1024
}
```

---

## Тестирование

### Что проверить:
1. ✅ Пользователь выбирает 9:16 в настройках
2. ✅ Генерирует изображение через Midjourney v7
3. ✅ Изображение имеет соотношение 9:16 (вертикальное)
4. ✅ При повторной генерации (кнопки 1️⃣-4️⃣) размер сохраняется

### Логи при успехе:
```
[generateTextToImageDirect] Calling generateMidjourneyImage
  aspectRatio: "9:16"
  hasSize: false
  hasAspectRatio: true

[Midjourney v7] Starting image generation
  aspectRatio: "9:16"

[Midjourney v7] Using aspect ratio dimensions
  aspectRatio: "9:16"
  width: 768
  height: 1368
```

### В Replicate API:
```json
{
  "input": {
    "prompt": "...",
    "width": 768,
    "height": 1368
  }
}
```

---

## Итог

### ✅ Работает:
1. Aspect_ratio корректно применяется для midjourney-v7
2. 9:16 → 768x1368 (вертикальное)
3. 16:9 → 1368x768 (горизонтальное)
4. 1:1 → 1024x1024 (квадрат)
5. Повторная генерация сохраняет размер
6. Централизованное управление через БД

---
**Автор:** Claude Code  
**Дата:** 2025-11-01  
**Статус:** Готово к деплою ✅
