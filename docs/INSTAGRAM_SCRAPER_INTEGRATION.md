# 🔍 Instagram Scraper V2 - Интеграция в Telegram Bot

## 📋 Обзор

Интеграция позволяет пользователям искать конкурентов Instagram через Telegram бот. Система использует Inngest для фоновой обработки и API сервер для запуска задач.

## 🏗️ Архитектура

```
Telegram Bot (Client) → API Server → Inngest Function → Database → Results
```

## 🚀 Использование

### Команда
```
/instagram
```

### 👑 Доступ админов
- Админы из `ADMIN_IDS_ARRAY` видят **ВСЕ проекты** в базе данных
- Могут запускать анализ конкурентов для любого проекта
- ID админов: `[144022504, 1254048880, 352374518, 1852726961]`

### Процесс (4 шага)
1. **Выбор проекта** - выбирает проект из списка:
   - **👑 Админы** - видят ВСЕ проекты из базы данных
   - **👤 Пользователи** - видят только свои проекты
2. **Instagram Username** - вводит username (без @)
3. **Количество конкурентов** - выбирает от 10, 25 до 50
4. **Анализ рилсов** - выбирает да/нет
5. **Запуск анализа** - система запускает Inngest событие

## 📂 Файловая структура

```
src/
├── services/
│   └── generateInstagramScraping.ts     # Сервис для Inngest событий
├── core/supabase/
│   └── getUserProjects.ts               # Получение проектов пользователя из БД
├── scenes/
│   └── instagramScrapingWizard/
│       └── index.ts                     # Wizard сцена сбора данных (4 шага)
├── interfaces/modes.ts                  # Добавлен InstagramScrapingWizard
└── registerCommands.ts                  # Команда /instagram и регистрация сцены
```

## 🔧 Технические детали

### API Endpoint
- **URL**: `${API_URL}/api/instagram/scrape`
- **Method**: POST
- **Headers**: 
  - `Content-Type: application/json`
  - `x-secret-key: ${SECRET_API_KEY}`

### Параметры запроса
```typescript
interface InstagramScrapingRequest {
  username_or_id: string
  project_id: number
  max_users?: number
  max_reels_per_user?: number
  scrape_reels?: boolean
  requester_telegram_id: string
}
```

### Ответ API
```typescript
interface InstagramScrapingResponse {
  success: boolean
  eventId?: string
  message: string
  error?: string
}
```

## 🎯 Особенности реализации

1. **Валидация Username**: Регулярное выражение `^[a-zA-Z0-9._]{1,30}$`
2. **Ограничения**: 1-50 конкурентов, до 200 рилсов на пользователя
3. **Защита подписки**: Проверка активной подписки через `checkSubscriptionGuard`
4. **Языковая поддержка**: Русский/английский через `isRussianFromState`
5. **Логирование**: Подробные логи всех шагов процесса

## 🛠️ Конфигурация

### Переменные окружения
- `API_SERVER_URL` / `LOCAL_SERVER_URL` - URL API сервера
- `SECRET_API_KEY` - Секретный ключ для API

### Project ID
- **Текущий**: Фиксированный `project_id: 37`
- **TODO**: Получение реального project_id из базы данных пользователя

## 📊 Статусы TODO

- ✅ **Создать Inngest функцию** - Используется существующая на сервере
- ✅ **API endpoint для запуска** - Реализован в generateInstagramScraping.ts
- ✅ **Сцена в боте** - InstagramScrapingWizard готов
- ⏳ **Обработка результатов из БД** - Требует дополнительной реализации
- ✅ **Команда /instagram** - Зарегистрирована и работает

## 🧪 Тестирование

Запуск команды `/instagram` в боте активирует следующий flow:
1. Проверка подписки
2. Вход в InstagramScrapingWizard
3. Пошаговый сбор данных
4. Валидация входных данных
5. API вызов к серверу
6. Отображение результата

## 🔄 Следующие шаги

1. **Получение результатов**: Реализовать функцию опроса базы данных
2. **Отправка результатов**: Уведомление пользователя о готовых данных  
3. **Экспорт данных**: Возможность экспорта в различных форматах
4. **Улучшения UX**: Прогресс-бар, отмена операции

---

*Создано НейроКодером 🤖 | Om Shanti 🙏* 