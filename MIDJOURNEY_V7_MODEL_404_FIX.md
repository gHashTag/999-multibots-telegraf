# ✅ Midjourney v7 - Исправление 404 ошибки модели

## Статус
**🎯 ИСПРАВЛЕНИЕ ПОСЛЕ ОШИБКИ**

Дата: 2025-11-01

---

## Проблема

### ❌ Ошибка 404 - модель не найдена
**Описание:** После переключения на adminconteudosflix/midjourney-allcraft возникла ошибка:
```
Request to https://api.replicate.com/v1/models/adminconteudosflix/midjourney-allcraft/predictions failed with status 404 Not Found: {"detail":"The requested resource could not be found."}
```

**Причина:** Модель не была доступна без указания конкретной версии.

---

## Исправление

### ✅ Изменение #1: Указание конкретной версии модели

**Файл:** `src/services/generateMidjourneyImage.ts`

```typescript
// БЫЛО:
const output = await replicate.run(
  'adminconteudosflix/midjourney-allcraft',
  {
    input,
  }
)

// СТАЛО:
const output = await replicate.run(
  'adminconteudosflix/midjourney-allcraft:dev',
  {
    input,
  }
)
```

### ✅ Изменение #2: Добавлен параметр model

```typescript
// Добавляем в input параметр model
input.model = 'dev'

// Также обновляем логи
logger.info('[Midjourney v7] Final input params', {
  model: 'adminconteudosflix/midjourney-allcraft:dev',
  accept_ratio: input.accept_ratio,
  width: input.width,
  height: input.height,
  num_images: input.num_images,
  hasImageUrl: !!input.image_url,
})
```

---

## Схема модели (adminconteudosflix/midjourney-allcraft)

### Основные параметры:
- **prompt** (string, required) - описание изображения
- **aspect_ratio** (string, optional) - соотношение сторон ("1:1", "9:16", "16:9")
- **model** (string, optional) - "dev" (качественно, медленно) или "schnell" (быстро)
- **num_outputs** (integer, optional) - количество изображений
- **num_inference_steps** (integer, optional) - количество шагов
- **guidance_scale** (number, optional) - 2-3.5
- **go_fast** (boolean, optional) - использовать оптимизацию скорости
- **lora_scale** (number, optional) - сила LoRA
- **output_format** (string, optional) - "webp", "png"
- **output_quality** (integer, optional) - 0-100

### Пример входных данных:
```json
{
  "model": "dev",
  "prompt": "superman",
  "go_fast": true,
  "lora_scale": 1,
  "num_outputs": 1,
  "aspect_ratio": "9:16",
  "output_format": "webp",
  "guidance_scale": 3,
  "output_quality": 100,
  "num_inference_steps": 38
}
```

---

## Альтернативные решения

### Если adminconteudosflix/midjourney-allcraft все еще не работает:

1. **Вернуться к FLUX:**
   - Модель: `black-forest-labs/flux-1.1-pro`
   - Параметры: width/height вместо accept_ratio
   - ✅ Стабильная и быстрая
   - ❌ Не точно Midjourney

2. **Найти другую Midjourney модель:**
   - Поиск в Replicate: "midjourney"
   - Или использовать промпты в стиле Midjourney с FLUX

3. **Вернуться к KieAiProvider:**
   - Но проблема в том, что Kie.ai не предоставляет Midjourney

---

## Что проверить после исправления:

1. ✅ Модель adminconteudosflix/midjourney-allcraft:dev доступна
2. ✅ Параметр accept_ratio "9:16" передается
3. ✅ Генерируется вертикальное изображение
4. ✅ Нет ошибки 404

### Ожидаемые логи:
```
[Midjourney v7] Final input params
  model: "adminconteudosflix/midjourney-allcraft:dev"
  accept_ratio: "9:16"

[Midjourney v7] Calling replicate.run...
[Midjourney v7] Processing output
[Midjourney v7] Image generation completed successfully
```

---

## Итог

### ✅ Исправлено:
1. Добавлена конкретная версия модели (:dev)
2. Указан параметр model в input
3. Обновлены логи для отладки
4. Сохранена поддержка accept_ratio

### 🎯 Ожидаемый результат:
После этого исправления модель должна работать корректно и генерировать изображения в стиле Midjourney с правильным aspect_ratio.

---
**Автор:** Claude Code  
**Дата:** 2025-11-01  
**Статус:** Готово к тестированию ✅
