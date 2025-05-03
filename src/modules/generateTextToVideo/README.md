# 🎬 Модуль: Генерация Видео из Текста (`generateTextToVideo`)

Этот модуль отвечает за генерацию видео на основе текстового промпта пользователя с использованием внешних AI-моделей (например, через Replicate).

## 📜 Назначение

- Принимает текстовый промпт, идентификатор выбранной видеомодели и информацию о пользователе.
- Взаимодействует с зависимостями для:
    - Проверки и списания баланса пользователя (`processBalance`).
    - Вызова внутренней функции для генерации видео через API (`generateVideoInternal`).
    - Сохранения информации о сгенерированном видео в базе данных (`supabase`).
    - Логирования операций (`logger`).
    - Отправки уведомлений пользователю и администратору (`telegram`, `sendErrorToUser`, `sendErrorToAdmin`).
    - Записи статистики (`pulseHelper`).
- Возвращает локальный путь к сгенерированному видео (хотя сама запись на диск и отправка файла на данный момент пропущены в коде).

## ⚙️ Зависимости (`GenerateTextToVideoDependencies`)

Модуль требует явного внедрения следующих зависимостей:

```typescript
import { SupabaseClient } from '@supabase/supabase-js';
import Replicate from 'replicate';
import { Telegraf } from 'telegraf';
import { MyContext } from '@/interfaces';
import { VideoModelConfig } from '@/price/models/VIDEO_MODELS_CONFIG';

// Упрощенный интерфейс логгера
interface MinimalLogger {
  info: (message: string, ...meta: any[]) => void;
  error: (message: string, ...meta: any[]) => void;
  warn: (message: string, ...meta: any[]) => void;
}

// Интерфейс для файловых операций
interface FileSystemOps {
  mkdir: (path: string, options?: { recursive?: boolean }) => Promise<void>;
  // writeFile: (path: string, data: Buffer | string) => Promise<void>; // Если понадобится запись
}

// Тип для функции обработки баланса
type ProcessBalanceFunction = (
  ctx: Partial<MyContext>, // Временный контекст
  itemId: string,
  isRu: boolean
) => Promise<{ success: boolean; newBalance?: number; paymentAmount?: number; error?: string }>;

// Тип для внутренней функции генерации видео
type GenerateVideoInternalFunction = (
  prompt: string,
  model: string, // Replicate model string like 'minimax/video-01'
  negativePrompt: string
) => Promise<string | string[]>; // Returns URL(s)

// Типы для функций отправки ошибок
type SendErrorToUserFunction = (botName: string, chatId: number | string, error: Error, isRu: boolean) => Promise<void>;
type SendErrorToAdminFunction = (botName: string, userTelegramId: number | string, error: Error) => Promise<void>;

// Тип для хелпера статистики
type PulseHelperFunction = (
  filePath: string | null,
  prompt: string,
  mode: string,
  telegramId: number | string,
  username: string | undefined,
  isRu: boolean,
  botName: string
) => Promise<void>;

// Главный интерфейс зависимостей
export interface GenerateTextToVideoDependencies {
  logger: MinimalLogger;
  supabase: SupabaseClient;
  replicate: Replicate; // Несмотря на то что не используется напрямую, нужен для generateVideoInternal
  telegram: Telegraf<MyContext>['telegram'];
  fs: FileSystemOps;
  processBalance: ProcessBalanceFunction;
  generateVideoInternal: GenerateVideoInternalFunction;
  sendErrorToUser: SendErrorToUserFunction;
  sendErrorToAdmin: SendErrorToAdminFunction;
  pulseHelper: PulseHelperFunction;
  videoModelsConfig: Record<string, VideoModelConfig>; // Передаем конфиг через DI
  pathJoin: (...paths: string[]) => string; // Передаем path.join
  pathDirname: (p: string) => string; // Передаем path.dirname
  toBotName: (botName: string | undefined) => string | undefined; // Передаем toBotName
}
```

## 🚀 Использование

```typescript
import { generateTextToVideo, GenerateTextToVideoDependencies } from './modules/generateTextToVideo';
import { VIDEO_MODELS_CONFIG } from '@/price/models/VIDEO_MODELS_CONFIG';
// ... импорт других зависимостей ...

// 1. Собрать объект зависимостей
const dependencies: GenerateTextToVideoDependencies = {
  logger: /* ... */,
  supabase: /* ... */,
  replicate: /* ... */,
  telegram: /* ... */,
  fs: /* ... */,
  processBalance: /* ... */,
  generateVideoInternal: /* ... */,
  sendErrorToUser: /* ... */,
  sendErrorToAdmin: /* ... */,
  pulseHelper: /* ... */,
  videoModelsConfig: VIDEO_MODELS_CONFIG,
  pathJoin: require('path').join,
  pathDirname: require('path').dirname,
  toBotName: /* ... */,
};

// 2. Сформировать объект запроса
const requestData = {
  prompt: 'a cat riding a skateboard',
  videoModel: 'minimax', // ID модели из VIDEO_MODELS_CONFIG
  telegram_id: '123456789',
  username: 'testuser',
  is_ru: false,
  bot_name: 'my_test_bot',
};

// 3. Вызвать функцию модуля
try {
  const result = await generateTextToVideo(requestData, dependencies);
  console.log('Видео сгенерировано, локальный путь:', result.videoLocalPath);
  // Дальнейшая обработка (например, отправка пользователю)
} catch (error) {
  console.error('Ошибка генерации видео:', error);
}
```

## ⚠️ Текущие Ограничения

- Запись сгенерированного видео в локальный файл и его отправка пользователю **пропущены** в текущей реализации (`Skipping video file writing`, `Skipping sending video via local path`). Логика возвращает только предполагаемый локальный путь.
- Обработка ошибок полагается на выброс исключений, которые должны быть перехвачены вызывающим кодом. 