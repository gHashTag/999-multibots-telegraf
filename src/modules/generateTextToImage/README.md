# Модуль: generateTextToImage

Этот модуль отвечает за генерацию изображений по текстовому описанию с использованием API Replicate.

## Основная функция: `generateTextToImage`

Главная экспортируемая функция модуля.

```typescript
import { GenerationResult } from '@/interfaces'
import { GenerateTextToImageDependencies } from './types'

interface GenerateTextToImageRequest {
  prompt: string          // Текстовое описание для генерации
  model_type: string      // Идентификатор модели Replicate (например, 'stability-ai/stable-diffusion-3')
  num_images: number      // Количество изображений для генерации (1-4)
  telegram_id: string     // Telegram ID пользователя
  username: string        // Имя пользователя Telegram
  is_ru: boolean          // Флаг русского языка для сообщений
}

export declare const generateTextToImage: (
  requestData: GenerateTextToImageRequest,
  dependencies: GenerateTextToImageDependencies
) => Promise<GenerationResult[]>;
```

### Входные параметры (`GenerateTextToImageRequest`)

*   `prompt`: Текстовое описание желаемого изображения.
*   `model_type`: Строковый идентификатор модели, используемой в Replicate и для конфигурации цен (например, `stability-ai/stable-diffusion-3`). Должен соответствовать ключу в `imageModelsConfig`.
*   `num_images`: Количество изображений, которые нужно сгенерировать за один вызов (обычно от 1 до 4).
*   `telegram_id`: Уникальный идентификатор пользователя Telegram (в виде строки).
*   `username`: Имя пользователя в Telegram.
*   `is_ru`: Булевый флаг, указывающий, следует ли использовать русский язык в сообщениях пользователю.

### Возвращаемое значение (`Promise<GenerationResult[]>`)

Функция возвращает промис, который разрешается массивом объектов `GenerationResult`. Каждый объект содержит:

*   `image`: Локальный URL сохраненного изображения (например, `/uploads/12345/text-to-image/image.jpeg`).
*   `prompt_id`: ID сохраненного промпта в базе данных.

В случае ошибки (например, недостаточный баланс, ошибка API Replicate) функция может выбросить исключение или вернуть пустой массив, отправив сообщение об ошибке пользователю через Telegram.

## Зависимости (`GenerateTextToImageDependencies`)

Для своей работы функция `generateTextToImage` требует передачи объекта со следующими зависимостями:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Telegraf } from 'telegraf'
import type Replicate from 'replicate'
import type { MyContext } from '@/interfaces'
import type { MinimalLogger } from '@/modules/localImageToVideo/types'
import type { ModelInfo as ImageModelConfig } from '@/price/models/IMAGES_MODELS'
import type fs from 'fs'
import type path from 'path'

// Определение типов для вспомогательных функций
type ProcessBalanceFunction = (ctx: MyContext, model: string, isRu: boolean) => Promise<{ success: boolean; newBalance?: number; paymentAmount: number; error?: string }>;
type ProcessImageApiResponseFunction = (output: string | string[] | unknown) => Promise<string>;
type SaveImagePromptFunction = (prompt: string, modelKey: string, imageLocalUrl: string, telegramId: number) => Promise<number>;
type SaveImageLocallyFunction = (telegramId: string, imageUrl: string, subfolder: string, extension: string) => Promise<string>;
type GetAspectRatioFunction = (telegramId: number) => Promise<string>;
type SendErrorToUserFunction = (botName: string, telegramId: string, error: Error, isRu: boolean) => Promise<void>;
type SendErrorToAdminFunction = (botName: string, telegramId: string, error: Error) => Promise<void>;

export interface GenerateTextToImageDependencies {
  logger: MinimalLogger                       // Экземпляр логгера (минимальный интерфейс)
  supabase: SupabaseClient                    // Клиент Supabase
  replicate: Replicate                        // Клиент Replicate
  telegram: Telegraf<MyContext>['telegram']  // Объект Telegram API из Telegraf
  fsCreateReadStream: typeof fs.createReadStream // Функция fs.createReadStream
  pathBasename: typeof path.basename          // Функция path.basename
  processBalance: ProcessBalanceFunction      // Функция для проверки и списания баланса
  processImageApiResponse: ProcessImageApiResponseFunction // Функция обработки ответа Replicate API
  saveImagePrompt: SaveImagePromptFunction    // Функция сохранения промпта в БД
  saveImageLocally: SaveImageLocallyFunction  // Функция сохранения изображения локально
  getAspectRatio: GetAspectRatioFunction      // Функция получения соотношения сторон (может быть устаревшей)
  sendErrorToUser: SendErrorToUserFunction    // Функция отправки ошибки пользователю
  sendErrorToAdmin: SendErrorToAdminFunction  // Функция отправки ошибки администратору
  imageModelsConfig: Record<string, ImageModelConfig> // Конфигурация моделей изображений
}
```

**Важно:** Вызывающий код несет ответственность за предоставление корректных реализаций всех этих зависимостей.

## Пример использования

```typescript
import { generateTextToImage, GenerateTextToImageDependencies } from './index'
import { logger, supabase, replicate, /* ... другие зависимости */ } from '../path/to/dependencies'
import { IMAGES_MODELS } from '../path/to/imageModelsConfig'

// 1. Собрать объект зависимостей (пример)
const dependencies: GenerateTextToImageDependencies = {
  logger,
  supabase,
  replicate,
  telegram: bot.telegram, // Предполагается, что есть инстанс бота
  fsCreateReadStream: require('fs').createReadStream,
  pathBasename: require('path').basename,
  processBalance: async (ctx, model, isRu) => { /* ... реализация ... */ return { success: true, paymentAmount: 10, newBalance: 90 }; },
  processImageApiResponse: async (output) => { /* ... реализация ... */ return 'http://example.com/image.jpeg'; },
  saveImagePrompt: async (prompt, model, url, id) => { /* ... реализация ... */ return 123; },
  saveImageLocally: async (id, url, sub, ext) => { /* ... реализация ... */ return '/local/path/image.jpeg'; },
  getAspectRatio: async (id) => { /* ... реализация ... */ return '1:1'; },
  sendErrorToUser: async (botName, id, error, isRu) => { /* ... реализация ... */ },
  sendErrorToAdmin: async (botName, id, error) => { /* ... реализация ... */ },
  imageModelsConfig: IMAGES_MODELS,
};

// 2. Собрать данные запроса
const requestData = {
  prompt: 'A beautiful sunset over the mountains',
  model_type: 'stability-ai/stable-diffusion-3',
  num_images: 1,
  telegram_id: '123456789',
  username: 'testuser',
  is_ru: false,
};

// 3. Вызвать функцию
async function runGeneration() {
  try {
    const results = await generateTextToImage(requestData, dependencies);
    console.log('Generated images:', results);
  } catch (error) {
    console.error('Generation failed:', error);
  }
}

runGeneration();
```

## Тестирование

Юнит-тесты для этого модуля находятся в файле `__tests__/generateTextToImage.test.ts`.

Для запуска тестов:

```bash
bun test src/modules/generateTextToImage/__tests__/generateTextToImage.test.ts
``` 