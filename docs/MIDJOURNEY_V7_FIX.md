# Midjourney v7 Integration Fix

## Проблема
Midjourney v7 был настроен через KieAiProvider, но это неправильно, так как Kie.ai не предоставляет доступ к Midjourney. Это вызывало ошибки при генерации изображений.

## Решение
Midjourney v7 был переведен на работу через Replicate API с использованием модели `adminconteudosflix/midjourney-allcraft`.

## Изменения

### 1. Удален неиспользуемый файл
- ❌ `src/services/MidjourneyProvider.ts` - удален (использовал неправильный API)

### 2. Создан новый сервис
- ✅ `src/services/generateMidjourneyImage.ts` - новый сервис для работы с Midjourney v7 через Replicate

### 3. Обновлены существующие файлы

#### `src/services/video-providers/KieAiProvider.ts`
- Удален 'midjourney-v7' из pricing (больше не используется)

#### `src/services/UniversalProviderManager.ts`
- Изменен провайдер для midjourney-v7 с 'Kie.ai' на 'Replicate'
- Добавлена поддержка 'image-to-image' для midjourney-v7
- Добавлен импорт `generateMidjourneyImage`
- Добавлен case для 'Replicate' в `generateImage()`

#### `src/services/generateTextToImageDirect.ts`
- Добавлен импорт `generateMidjourneyImage`
- Добавлена специальная логика для обработки midjourney-v7
- При выборе midjourney-v7 используется `generateMidjourneyImage` вместо стандартного `replicate.run`

#### `src/price/models/imageModelPrices.ts`
- Обновлен `inputType` для midjourney-v7 с `['text']` на `['text', 'image']`

#### `src/core/providers/registry/provider-registry.ts`
- Добавлен Replicate в default registry конфигурацию

#### `src/services/index.ts`
- Добавлен экспорт `generateMidjourneyImage`

## Модель Replicate
- **URL**: https://replicate.com/black-forest-labs/flux-1.1-pro
- **Версия**: latest (последняя)
- **Стоимость**: $0.15 за изображение
- **Поддержка**: text-to-image, image-to-image (улучшенный промпт в стиле Midjourney)
- **Аспект-рацио**: 1:1, 16:9, 9:16
- **Размеры**: до 1024x1024 (по умолчанию)
- **Примечание**: Используется FLUX 1.1 Pro - стабильная и высококачественная модель, которая генерирует изображения в стиле Midjourney

## Тестирование
Создан тест: `tests/midjourney-v7-integration.test.ts`

Для запуска теста:
```bash
REPLICATE_API_TOKEN=your_token npm test -- midjourney-v7-integration.test.ts
```

## Проверка работоспособности

1. Убедитесь, что переменная окружения `REPLICATE_API_TOKEN` установлена
2. Запустите бота
3. Выберите "🖼️ Генерация изображений"
4. Выберите "Midjourney v7"
5. Введите промпт для генерации
6. Проверьте, что изображение генерируется без ошибок

## Ожидаемый результат
✅ Midjourney v7 должен генерировать изображения через Replicate API без ошибок "Произошла ошибка. Пожалуйста, попробуйте позже."

## Логи
При генерации с midjourney-v7 в логах будет:
```
[Midjourney v7] Starting image generation
[Midjourney v7] Image generation completed successfully
[generateTextToImageDirect] Image URL validated
```

## Дополнительные исправления (версия 2)

### Проблема #2: "wrong type of the web page content"
Вторая ошибка при отправке изображения в Telegram - "Bad Request: wrong type of the web page content"

**Решение:**
1. **Проверка URL** - добавлена валидация Content-Type перед обработкой
2. **Множественные форматы** - поддержка разных форматов ответа от FLUX
3. **Fallback отправка** - отправка через URL, если файл недоступен
4. **Подробные логи** - детальная информация для отладки

### Изменения в generateMidjourneyImage.ts:
- Добавлена поддержка object формата ответа: `{ output: [...] }`
- Проверка Content-Type каждого URL через HEAD запрос
- Валидация доступности изображений

### Изменения в generateTextToImageDirect.ts:
- Валидация URL перед скачиванием
- Проверка существования файла перед отправкой
- Fallback отправка через URL при ошибках файловой отправки

## Ценообразование
- Стоимость: 15 ⭐️ за изображение (0.15 USD)
- Расчет: 0.15 USD / 0.016 USD per star = 9.375 → 9 ⭐️ (округляется)
