# 🎯 Настройка Dart AI Task Manager

## 🚀 Быстрый старт

### 1. Настройте переменные окружения

Скопируйте `.env.example` в `.env` и заполните:

```bash
cp .env .env.local  # или отредактируйте .env
```

**Обязательные переменные:**
```env
# Основной API ключ Dart AI (получите в личном кабинете)
DART_AI_API_KEY=dsa_ваш_api_ключ_здесь

# Минимум один Telegram бот токен
BOT_TOKEN_1=1234567890:AAEhBOwUxuHfz...

# Supabase подключение
SUPABASE_URL=https://ваш-проект.supabase.co
SUPABASE_SERVICE_KEY=ваш_service_key

# ID администраторов (через запятую)
ADMIN_IDS=144022504,1254048880,352374518
```

### 2. Получение Dart AI API ключа

1. Зарегистрируйтесь на [Dart AI](https://dart.ai)
2. Перейдите в **Settings** → **API Keys**
3. Создайте новый API ключ
4. Скопируйте ключ в `.env` как `DART_AI_API_KEY`

### 3. Запуск тестов

```bash
# Запустить только тесты Dart AI интеграции
npm test -- --testPathPattern="dart-ai"

# Запустить все тесты (требует полной настройки .env)
npm test

# Проверка типов
npm run typecheck
```

## 📋 Доступные команды

### Для администраторов в Telegram:

```
/dartai spaces                          - список пространств
/dartai tasks [space_id]               - список задач  
/dartai create "Название" ["Описание"] - создать задачу
/dartai get <task_id>                  - получить задачу
/dartai status <task_id> <статус>      - изменить статус
/dartai priority <task_id> <приоритет> - изменить приоритет
/dartai delete <task_id>               - удалить задачу
/dartai stats                          - показать статистику
/dartai_github <repo> <issue_number>   - создать задачу из GitHub Issue
```

### Примеры:

```
/dartai create "Исправить баг" "Описание проблемы"
/dartai status abc123 done
/dartai priority abc123 high
/dartai_github owner/repo 123
```

## ⚙️ Статусы и приоритеты

### Доступные статусы:
- `todo` - К выполнению
- `in_progress` - В работе  
- `done` - Выполнено
- `cancelled` - Отменено

### Доступные приоритеты:
- `low` - Низкий
- `medium` - Средний
- `high` - Высокий
- `critical` - Критический

## 🔧 Архитектура интеграции

### Основные компоненты:

```
src/
├── services/
│   └── dart-ai.service.ts           # HTTP клиент для Dart AI API
├── handlers/
│   └── dartAIAdminCommands.ts       # Обработчики Telegram команд
├── interfaces/
│   ├── dart-ai.interface.ts         # TypeScript типы
│   └── zod/
│       └── dart-ai.zod.ts           # ZOD схемы валидации
└── registerCommands.ts              # Регистрация команд

__tests__/
├── integration/
│   └── dart-ai-integration.test.ts  # Интеграционные тесты
├── services/
│   └── dart-ai-service.test.ts      # Юнит-тесты сервиса
└── handlers/
    └── dart-ai-admin-commands.test.ts # Тесты команд
```

## 🧪 Тестирование

### Для тестирования используется `.env.test`:

```bash
# Запуск с тестовыми переменными
NODE_ENV=test npm test

# Или создайте .env.test с тестовыми значениями
cp .env.test .env.local
```

### Покрытие тестами:

- ✅ **100% API методов** - все CRUD операции
- ✅ **Обработка ошибок** - network, HTTP, validation
- ✅ **Команды админов** - все /dartai команды
- ✅ **ZOD валидация** - все схемы данных
- ✅ **Многоязычность** - русский и английский
- ✅ **GitHub интеграция** - создание задач из Issues

## 🔐 Безопасность

### Права доступа:
- Только пользователи из `ADMIN_IDS` могут использовать команды
- API ключ Dart AI хранится в переменных окружения
- Все запросы логируются для аудита

### Валидация:
- Все входные данные проверяются ZOD схемами
- Защита от SQL инъекций и XSS
- Rate limiting на уровне Dart AI API

## 🐛 Troubleshooting

### Частые ошибки:

**"Dart AI не настроен"**
```
✅ Проверьте DART_AI_API_KEY в .env
✅ Убедитесь, что ключ действительный
```

**"У вас нет доступа к этой команде"**  
```
✅ Добавьте свой Telegram ID в ADMIN_IDS
✅ Перезапустите бота после изменения .env
```

**"Network error: Unable to reach Dart AI API"**
```
✅ Проверьте интернет подключение
✅ Убедитесь, что dart.ai доступен
✅ Проверьте правильность API ключа
```

### Логирование:

Все операции логируются в консоль:
```
🎯 [Dart AI] Creating task: Название задачи
✅ [Dart AI] Task created: abc123
❌ [Dart AI] Error creating task: Invalid API key
```

## 📞 Поддержка

При проблемах с интеграцией:

1. Проверьте переменные окружения
2. Запустите тесты: `npm test -- --testPathPattern="dart-ai"`
3. Проверьте логи в консоли
4. Убедитесь, что API ключ Dart AI действителен

---

**🎉 Интеграция готова к использованию!**

После настройки `.env` файла администраторы смогут управлять задачами Dart AI прямо из Telegram.