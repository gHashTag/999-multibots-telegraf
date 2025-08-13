# 🎬 Text-to-Video Direct API Integration

## Обзор

Эта ветка добавляет прямую интеграцию с API сервером для генерации видео из текста, поддерживая множество моделей включая Google Veo, Haiper, Kling, Ray, Hunyuan, Wan и Minimax.

## 🚀 Основные компоненты

### 1. Сервис генерации видео
**Файл:** `src/services/generateTextToVideo.ts`

Основной сервис для взаимодействия с API сервера. Поддерживает:
- Генерацию видео из текстового промпта
- Проверку статуса длительных операций
- Обработку ошибок и локализацию

### 2. Handler для бота
**Файл:** `src/handlers/handleTextToVideoDirect.ts`

Обработчик команд бота для генерации видео:
- Проверка подписки пользователя
- Отправка запроса на генерацию
- Мониторинг статуса генерации
- Отправка готового видео пользователю
- Списание баланса

### 3. Тестовый скрипт
**Файл:** `src/test-text-to-video.ts`

Скрипт для тестирования функциональности без запуска бота.

## 📋 API Endpoints

### Генерация видео
```
POST /generate/text-to-video
```

**Payload:**
```json
{
  "prompt": "string - описание видео",
  "videoModel": "string - ID модели (см. таблицу моделей)",
  "duration": "number - длительность в секундах (только для Veo)",
  "telegram_id": "string - ID пользователя",
  "username": "string - имя пользователя",
  "is_ru": "boolean - язык пользователя",
  "bot_name": "string - имя бота"
}
```

**Response:**
```json
{
  "success": true,
  "videoUrl": "string - URL готового видео (опционально)",
  "jobId": "string - ID задачи для отслеживания (опционально)",
  "message": "string - сообщение",
  "error": "string - описание ошибки (при неудаче)"
}
```

### Проверка статуса
```
GET /generate/text-to-video/status/{jobId}
```

**Response:**
```json
{
  "success": true,
  "videoUrl": "string - URL готового видео",
  "message": "string - статус генерации"
}
```

## 💰 Модели и цены

### Фиксированные модели
| Модель | Название | Цена | Длительность | Тип ввода |
|--------|----------|------|--------------|----------|
| haiper-video-2 | Haiper Video 2 | 4 ⭐ | 6 сек | text, image |
| kling-v1.6-pro | Kling v1.6 Pro | 9 ⭐ | фикс. | text, image |
| ray-v2 | Ray-v2 | 16 ⭐ | фикс. | text, image |
| hunyuan-video-fast | Hunyuan Fast | 18 ⭐ | фикс. | text |
| wan-text-to-video | Wan-2.1 | 23 ⭐ | фикс. | text |
| minimax | Minimax | 46 ⭐ | фикс. | text, image |

### Динамические модели Veo

#### veo-3 (Premium) - $0.40/сек
| Длительность | Цена |
|--------------|------|
| 2 сек | 75 ⭐ |
| 4 сек | 150 ⭐ |
| 6 сек | 225 ⭐ |
| 8 сек | 300 ⭐ (по умолчанию) |

#### veo-3-fast - $0.30/сек
| Длительность | Цена |
|--------------|------|
| 2 сек | 56 ⭐ |
| 4 сек | 112 ⭐ (по умолчанию) |
| 6 сек | 168 ⭐ |
| 8 сек | 225 ⭐ |

#### veo-2 - $0.30/сек
| Длительность | Цена |
|--------------|------|
| 4 сек | 112 ⭐ |
| 6 сек | 168 ⭐ |
| 8 сек | 225 ⭐ (по умолчанию) |
| 10 сек | 281 ⭐ |

## 🔧 Настройка окружения

Убедитесь, что в `.env` файле настроены следующие переменные:

```bash
# API сервер
API_SERVER_URL=https://your-api-server.com
LOCAL_SERVER_URL=http://localhost:4000

# Секретный ключ для API
SECRET_API_KEY=your-secret-key

# Режим разработки
NODE_ENV=development
```

## 🧪 Тестирование

### Запуск тестового скрипта
```bash
# Показать доступные модели
npx ts-node scripts/test-text-to-video.ts

# Тест с самой дешевой моделью
npx ts-node scripts/test-text-to-video.ts haiper-video-2

# Тест Veo моделей с длительностью
npx ts-node scripts/test-text-to-video.ts veo-3-fast 4
npx ts-node scripts/test-text-to-video.ts veo-3 8
npx ts-node scripts/test-text-to-video.ts veo-2 10
```

### Тестирование через curl

#### Самый дешевый вариант (Haiper - 4 звезды)
```bash
curl -X POST http://localhost:4000/generate/text-to-video \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Dancing cat in space",
    "videoModel": "haiper-video-2",
    "telegram_id": "144022504",
    "username": "playra",
    "is_ru": false,
    "bot_name": "neuro_blogger_bot"
  }'
```

#### Veo 3 Fast - 2 секунды (56 звёзд)
```bash
curl -X POST http://localhost:4000/generate/text-to-video \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Quick magic effect",
    "videoModel": "veo-3-fast",
    "duration": 2,
    "telegram_id": "144022504",
    "username": "playra",
    "is_ru": false,
    "bot_name": "neuro_blogger_bot"
  }'
```

#### Veo 3 Premium - 8 секунд (300 звёзд)
```bash
curl -X POST http://localhost:4000/generate/text-to-video \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Epic battle scene",
    "videoModel": "veo-3",
    "duration": 8,
    "telegram_id": "144022504",
    "username": "playra",
    "is_ru": false,
    "bot_name": "neuro_blogger_bot"
  }'
```

## 🔌 Интеграция в бота

### Пример использования в боте:

```typescript
import { handleTextToVideoDirect } from '@/handlers/handleTextToVideoDirect'

// В обработчике команды с выбором модели
bot.command('generate_video', async (ctx) => {
  const args = ctx.message.text.split(' ')
  const model = args[1] || 'haiper-video-2' // Самая дешевая по умолчанию
  const duration = args[2] ? parseInt(args[2]) : undefined
  const prompt = args.slice(duration ? 3 : 2).join(' ')
  
  if (!prompt) {
    await ctx.reply('Usage: /generate_video [model] [duration] <prompt>')
    return
  }
  
  await handleTextToVideoDirect(ctx, prompt, model, duration)
})

// Обработка callback для обновления статуса
bot.action('update_video_status', handleVideoStatusUpdate)
```

## 📝 Логирование

Все операции логируются через `logger` с подробной информацией:
- Начало генерации
- Отправка запроса на API
- Получение ответа
- Ошибки и их обработка
- Статус генерации

## 🔄 Обработка ошибок

Сервис обрабатывает следующие типы ошибок:
- **429** - Превышен лимит запросов
- **402** - Недостаточно средств
- **NSFW** - Неподходящий контент
- Таймауты и сетевые ошибки

## 🌍 Локализация

Поддерживаются два языка:
- Русский (`is_ru: true`)
- Английский (`is_ru: false`)

Все сообщения об ошибках и статусах автоматически локализуются.

## 📊 Мониторинг

При длительной генерации:
1. Пользователь получает сообщение с кнопкой "Обновить статус"
2. Система автоматически проверяет статус каждые 5 секунд
3. Максимальное время ожидания - 5 минут
4. После готовности видео автоматически отправляется пользователю

## 🔒 Безопасность

- Все запросы к API защищены секретным ключом
- Проверка подписки перед генерацией
- Валидация всех входных параметров
- Ограничение длины промпта в логах (100 символов)

## 📦 Зависимости

```json
{
  "axios": "для HTTP запросов",
  "telegraf": "для работы с Telegram Bot API",
  "@/utils/logger": "для логирования",
  "@/helpers/*": "вспомогательные функции"
}
```

## 🚨 Важные замечания

1. **Таймаут запросов** установлен на 5 минут для длительных операций
2. **Видео сохраняется** в Supabase для постоянного хранения
3. **Баланс списывается** только после успешной генерации
4. **Статус сохраняется** в сессии для возможности повторной проверки

## 📈 Будущие улучшения

- [x] Добавить поддержку выбора длительности видео
- [x] Поддержка всех моделей согласно документации сервера
- [ ] Реализовать очередь для обработки множественных запросов
- [ ] Добавить webhook для получения уведомлений о готовности
- [ ] Интегрировать с системой аналитики
- [ ] Добавить кэширование для повторяющихся запросов
- [ ] Добавить поддержку генерации из изображений

## 🤝 Поддержка

При возникновении проблем:
1. Проверьте логи сервера
2. Убедитесь в корректности API ключей
3. Проверьте доступность API сервера
4. Обратитесь к документации Google AI

---

*Документация обновлена: Январь 2025*
