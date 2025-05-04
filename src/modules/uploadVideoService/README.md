# ⬆️ Модуль: Сервис Загрузки Видео (`uploadVideoService`)

Этот модуль отвечает за оркестрацию процесса загрузки видео, используя другие специализированные модули (в данном случае `VideoService`).

## 📜 Назначение

- Принимает URL видео, идентификатор пользователя и имя файла.
- Делегирует фактическое скачивание и сохранение видео модулю `VideoService`.
- Предоставляет единую точку входа для процесса "загрузки видео на сервер" (хотя текущая реализация сохраняет только локально).
- Логирует процесс и обрабатывает ошибки.

## ⚙️ Зависимости (`UploadVideoServiceDependencies`)

Модуль требует явного внедрения следующих зависимостей:

```typescript
import type { VideoService } from '@/modules/videoService';

// Упрощенный интерфейс логгера
interface MinimalLogger { /* ... */ }

export interface UploadVideoServiceDependencies {
  logger: MinimalLogger;
  // Зависим только от метода processVideo из VideoService
  videoService: Pick<VideoService, 'processVideo'>;
}
```

*(Полные определения типов см. в `./types.ts`)*

## 🚀 Использование

```typescript
import {
  uploadVideoService,
  UploadVideoServiceDependencies,
  UploadVideoServiceRequest
} from './modules/uploadVideoService';
import { VideoService, VideoServiceDependencies as VideoDeps } from '@/modules/videoService';
import { logger } from '@/utils/logger';
// ... импорт других зависимостей для VideoService ...

// 1. Создать зависимости для VideoService
const videoServiceDependencies: VideoDeps = { /* ... */ };
// 2. Создать экземпляр VideoService
const videoServiceInstance = new VideoService(videoServiceDependencies);

// 3. Создать зависимости для UploadVideoService
const uploadDependencies: UploadVideoServiceDependencies = {
  logger: logger,
  videoService: videoServiceInstance, // Внедряем экземпляр VideoService
};

// 4. Сформировать объект запроса
const requestData: UploadVideoServiceRequest = {
  videoUrl: 'https://example.com/another_video.mp4',
  telegram_id: 987654321,
  fileName: 'upload_test.mp4',
};

// 5. Вызвать функцию модуля
try {
  const result = await uploadVideoService(requestData, uploadDependencies);
  console.log(`Видео обработано, локальный путь: ${result.localPath}`);
} catch (error) {
  console.error('Ошибка обработки видео:', error);
}
```

## ⚠️ Примечания

- Текущая реализация только скачивает видео локально с помощью `VideoService`. Логика загрузки на внешний сервер (например, с использованием `axios`) отсутствует.
- Модуль перебрасывает ошибки, возникшие в `VideoService`, для обработки вызывающим кодом. 