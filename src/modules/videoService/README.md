# 📁 Модуль: Сервис Обработки Видео (`VideoService`)

Этот модуль предоставляет функциональность для скачивания видео по URL и сохранения его в локальной файловой системе.

## 📜 Назначение

- Инкапсулирует логику работы с файловой системой и скачивания файлов для видео.
- Позволяет легко мокировать зависимости для тестирования.

## ⚙️ Зависимости (`VideoServiceDependencies`)

Модуль требует явного внедрения следующих зависимостей через конструктор:

```typescript
// Упрощенный интерфейс логгера
interface MinimalLogger { /* ... */ }

// Функция для скачивания файла
type DownloadFileFunction = (url: string) => Promise<Buffer>;

// Интерфейс для файловых операций (mkdir, writeFile)
interface FileSystemOps { /* ... */ }

// Интерфейс для работы с путями (join, dirname)
interface PathOps { /* ... */ }

export interface VideoServiceDependencies {
  logger: MinimalLogger;
  downloadFile: DownloadFileFunction;
  fs: FileSystemOps;
  path: PathOps;
  /** Корневая директория для сохранения загруженных файлов. */
  uploadsDir: string;
}
```

*(Полные определения типов см. в `./types.ts`)*

## 🚀 Использование

```typescript
import { VideoService, VideoServiceDependencies } from './modules/videoService';
import { logger } from '@/utils/logger'; // Пример логгера
import { downloadFile } from '@/helpers'; // Пример функции скачивания
import fs from 'fs/promises';
import path from 'path';

// 1. Определить корневую директорию для загрузок
const UPLOADS_ROOT = process.env.UPLOADS_DIR || './uploads'; // Пример

// 2. Собрать объект зависимостей
const dependencies: VideoServiceDependencies = {
  logger: logger,
  downloadFile: downloadFile, // Используем реальную функцию
  fs: { mkdir: fs.mkdir, writeFile: fs.writeFile }, // Передаем реальные fs операции
  path: { join: path.join, dirname: path.dirname }, // Передаем реальные path операции
  uploadsDir: UPLOADS_ROOT,
};

// 3. Создать экземпляр сервиса
const videoService = new VideoService(dependencies);

// 4. Вызвать метод processVideo
const videoUrl = 'https://example.com/some_video.mp4';
const telegramId = 123456789;
const fileName = `downloaded_${Date.now()}.mp4`;

try {
  const localPath = await videoService.processVideo(videoUrl, telegramId, fileName);
  console.log(`Видео успешно скачано и сохранено по пути: ${localPath}`);
} catch (error) {
  console.error('Не удалось обработать видео:', error);
}
``` 