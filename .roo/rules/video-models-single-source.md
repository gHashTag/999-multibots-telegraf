# 🎬 Video Models: Single Source of Truth

## ✅ ПРАВИЛО: Единый источник правды для видео-моделей

**ФАЙЛ:** `src/config/unified-video-models.config.ts`

Это **ЕДИНСТВЕННЫЙ** файл с конфигурацией всех видео-моделей в проекте.

## ❌ ЗАПРЕЩЕНО:

- Создавать дубликаты конфигов (videoModels.ts, models.config.ts, video-models.ts, и т.д.)
- Хардкодить цены моделей в других файлах
- Хардкодить названия моделей в кнопках
- Создавать отдельные файлы с ценами или моделями
- Импортировать из `@/modules/videoGenerator/config/models.config` (УДАЛЕНО!)
- Импортировать из `@/services/videoModels` (УДАЛЕНО!)
- Использовать `VideoModelConfig` из старых конфигов (используй `UnifiedVideoModelConfig`)

## ✅ ТРЕБУЕТСЯ:

1. **Все цены** - только через `getUnifiedModelPrice(modelId, options)`
2. **Все кнопки** - только через `generateModelButton(modelId, aspectRatio, isRu)`
3. **Парсинг кнопок** - только через `parseModelButton(buttonText)`
4. **Клавиатуры** - только через `generateModelKeyboard(inputType, isRu)`

## Экспорты из unified-video-models.config.ts:

```typescript
// Основной реестр моделей
export const UNIFIED_VIDEO_MODELS: Record<string, UnifiedVideoModelConfig>

// Функции
export function getUnifiedModelConfig(modelId: string)
export function getUnifiedModelPrice(modelId: string, options?)
export function getModelsByInputType(inputType: VideoInputType)
export function generateModelButton(modelId, aspectRatio, isRu)
export function parseModelButton(buttonText)
export function generateModelKeyboard(inputType, isRu, supportedModels?)

// Алиасы для обратной совместимости (deprecated)
export const VIDEO_MODELS_CONFIG = UNIFIED_VIDEO_MODELS
export function getModelPriceInStars() // -> getUnifiedModelPrice
export function getValidDuration()
export function getTextToVideoModels()
export function getImageToVideoModels()
```

## Структура модели:

```typescript
{
  id: 'model-id',
  name: 'Model Name',
  nameRu: 'Название модели',
  description: 'Description',
  provider: 'kie' | 'replicate',
  apiModel: 'api-model-name',
  inputTypes: ['text', 'image'],
  pricing: {
    type: 'fixed' | 'per_second' | 'per_resolution' | 'per_duration',
    fixedPriceStars?: number,
    pricePerSecondUSD?: number,
    defaultDuration?: number,
  },
  apiSettings: {
    imageKey?: string,
    aspectRatios?: string[],
    durations?: number[],
    resolutions?: string[],
  },
  status: 'active' | 'deprecated',
}
```

## При добавлении новой модели:

1. Добавь конфиг в `UNIFIED_VIDEO_MODELS` в unified-video-models.config.ts
2. **ВСЁ**. Больше ничего делать не нужно!
3. Кнопки, цены, клавиатуры создаются автоматически

## Почему это критично:

- **Дубликаты** ведут к рассинхронизации цен и багам
- **Хардкод** делает невозможным централизованное обновление
- **Разные источники** создают противоречия и ошибки

## Если нашел дубликат:

1. **УДАЛИ** дубликат немедленно
2. Замени все импорты на unified-video-models.config.ts
3. Используй существующие функции вместо кастомной логики
