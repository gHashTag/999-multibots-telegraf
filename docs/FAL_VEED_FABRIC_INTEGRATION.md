# 🚀 Fal.ai Veed Fabric 1.0 Fast Integration

## 📋 Обзор

Интеграция нового провайдера **Fal.ai Veed Fabric 1.0 Fast** для синхронизации губ (lip-sync) в проект. Этот провайдер предоставляет более стабильную альтернативу существующим решениям.

## 🎯 Цели Интеграции

- ✅ **Повышение стабильности** - Fal.ai предоставляет более надежную инфраструктуру
- ✅ **Улучшение качества** - Поддержка 720p и 480p разрешений
- ✅ **Упрощение API** - Простой интерфейс с минимальными параметрами
- ✅ **Совместимость** - Интеграция с существующей архитектурой провайдеров

## 🏗️ Архитектура Интеграции

### Новые Компоненты

1. **FalVeedFabricProvider** (`src/core/lipsync/providers/fal-veed-fabric-provider.ts`)
   - Основной провайдер для Fal.ai API
   - Реализует интерфейс `ILipSyncProvider`
   - Поддерживает синхронную генерацию

2. **Обновленная Фабрика Провайдеров** (`src/core/lipsync/providers/provider-factory.ts`)
   - Добавлен новый тип провайдера `'fal'`
   - Обновлены конфигурации по умолчанию

3. **Обновленные Схемы** (`src/core/lipsync/schemas/lipsync-schemas.ts`)
   - Добавлен метод `forFalVeedFabric` в `LipSyncInputBuilder`
   - Новые типы для Fal провайдера

4. **Конфигурация Моделей** (`src/config/lipsync-models.config.ts`)
   - Добавлена новая модель `FAL_VEED_FABRIC`
   - Настроены цены и параметры

## 🔧 API Интеграция

### Входные Параметры

```typescript
interface FalVeedFabricInput {
  provider: 'fal'
  modelId: 'fal-veed-fabric-1.0-fast'
  imageUrl: string      // URL изображения
  audioUrl: string      // URL аудиофайла
  telegramId: string    // ID пользователя
  resolution?: '480p' | '720p'  // Разрешение (по умолчанию 720p)
}
```

### Выходные Данные

```typescript
interface FalVeedFabricOutput {
  success: true
  data: {
    id: string
    status: 'succeeded'
    output: string      // URL сгенерированного видео
    modelUsed: 'Fal.ai Veed Fabric 1.0 Fast'
    costEstimate: number
    metadata: {
      resolution: '720p' | '480p'
      contentType: 'video/mp4'
      provider: 'fal'
      modelId: 'veed/fabric-1.0/fast'
    }
  }
}
```

## 🚀 Использование

### Через LipSyncInputBuilder

```typescript
import { LipSyncInputBuilder } from '@/core/lipsync/schemas/lipsync-schemas'

const input = LipSyncInputBuilder.forFalVeedFabric(
  'https://example.com/image.jpg',
  'https://example.com/audio.mp3',
  '123456789',
  {
    resolution: '720p',
    botName: 'test-bot',
  }
)
```

### Через Оркестратор

```typescript
import { LipSyncOrchestrator } from '@/core/lipsync/lipsync-orchestrator'

const orchestrator = LipSyncOrchestrator.getInstance()
const result = await orchestrator.generate(input)
```

### Через Фабрику Провайдеров

```typescript
import { LipSyncProviderFactory } from '@/core/lipsync/providers/provider-factory'

const factory = LipSyncProviderFactory.getInstance()
const provider = factory.createProvider('fal')
const result = await provider.generate(input)
```

## ⚙️ Конфигурация

### Переменные Окружения

```bash
FAL_KEY=your_fal_api_key_here
```

### Конфигурация Провайдера

```typescript
const falConfig = {
  timeout: 300000,        // 5 минут
  retryAttempts: 2,
  defaultResolution: '720p' as const,
}
```

## 💰 Стоимость

| Разрешение | Стоимость/сек | Звезды/сек |
|------------|---------------|------------|
| 480p       | $0.03         | 2.4⭐      |
| 720p       | $0.045        | 3.6⭐      |

## 🧪 Тестирование

### Запуск Тестов

```bash
# Простые тесты
pnpm test src/__tests__/fal-veed-fabric-simple.test.ts

# Полные тесты (с моками)
pnpm test src/__tests__/fal-veed-fabric-provider.test.ts

# Интеграционные тесты
pnpm test src/__tests__/fal-veed-fabric-integration.test.ts
```

### Покрытие Тестами

- ✅ Инициализация провайдера
- ✅ Создание входных данных
- ✅ Проверка статуса
- ✅ Совместимость с интерфейсом
- ✅ Интеграция с фабрикой
- ✅ Интеграция с оркестратором

## 🔄 Миграция с Существующих Провайдеров

### С Kie.ai Veed Fabric

```typescript
// Старый способ (Kie.ai)
const input = LipSyncInputBuilder.forVeedFabric(
  imageUrl,
  textOrAudioUrl,
  telegramId,
  { resolution: '720p', isAudioUrl: true }
)

// Новый способ (Fal.ai)
const input = LipSyncInputBuilder.forFalVeedFabric(
  imageUrl,
  audioUrl,  // Только URL аудио
  telegramId,
  { resolution: '720p' }
)
```

### С Sync LipSync-2

```typescript
// Старый способ (Sync)
const input = {
  provider: 'sync',
  modelId: 'sync/lipsync-2',
  videoUrl,
  audioUrl,
  telegramId,
}

// Новый способ (Fal.ai)
const input = LipSyncInputBuilder.forFalVeedFabric(
  imageUrl,  // Изображение вместо видео
  audioUrl,
  telegramId,
  { resolution: '720p' }
)
```

## 🚨 Ограничения

1. **Только изображения** - Fal.ai работает с изображениями, не с видео
2. **Синхронный API** - Нет поддержки асинхронной обработки
3. **Максимум 60 секунд** - Ограничение длительности видео
4. **Требует FAL_KEY** - Обязательная переменная окружения

## 🔮 Будущие Улучшения

- [ ] Поддержка асинхронного режима
- [ ] Кэширование результатов
- [ ] Мониторинг производительности
- [ ] Автоматическое переключение между провайдерами
- [ ] Поддержка batch-обработки

## 📚 Дополнительные Ресурсы

- [Fal.ai Documentation](https://docs.fal.ai)
- [Veed Fabric 1.0 Fast API](https://fal.ai/models/veed/fabric-1.0/fast)
- [Примеры использования](https://fal.ai/models/veed/fabric-1.0/fast/api)

## 🎉 Заключение

Интеграция Fal.ai Veed Fabric 1.0 Fast успешно завершена! Новый провайдер предоставляет:

- ✅ **Стабильность** - Надежная инфраструктура Fal.ai
- ✅ **Качество** - Поддержка высокого разрешения
- ✅ **Простота** - Минимальный API
- ✅ **Совместимость** - Полная интеграция с существующей архитектурой

Провайдер готов к использованию в продакшене! 🚀
