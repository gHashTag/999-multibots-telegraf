# 🧪 План тестирования Dart AI Task Manager

## 📋 Общий обзор

Этот план описывает как протестировать полную интеграцию Dart AI Task Manager с вашей системой многоботовых Telegram ботов.

## 🔧 Предварительная подготовка

### 1. Проверьте переменные окружения

```bash
# Выполните эту команду для проверки всех переменных
node test-env.js
```

**Обязательные переменные:**
- `DART_AI_API_KEY` - API ключ для Dart AI
- `SUPABASE_URL` - URL базы данных Supabase  
- `SUPABASE_SERVICE_KEY` - Service key для Supabase
- `ADMIN_IDS` - ID администраторов через запятую

### 2. Убедитесь в корректном запуске бота

```bash
# Запустите бота в режиме разработки
npm run dev
```

**Проверьте в логах:**
- ✅ API Server запустился на порту 2999
- ✅ Telegram боты подключились
- ✅ Нет критических ошибок

## 🧪 Тестирование API маршрутов

### 1. Базовые проверки

```bash
# Проверка статуса интеграции
curl -X GET http://localhost:2999/api/dart-ai/status | jq '.'

# Ожидаемый ответ:
# {
#   "success": true,
#   "data": {
#     "configured": true,
#     "api_key_present": true,
#     "base_url": "https://api.dart.ai",
#     "timestamp": "2025-08-24T..."
#   }
# }
```

### 2. Проверка подключения к Dart AI

```bash
# Получение списка пространств (spaces)
curl -X GET http://localhost:2999/api/dart-ai/spaces | jq '.'

# Ожидаемый ответ:
# {
#   "success": true,
#   "data": [
#     {
#       "id": "space123",
#       "name": "My Workspace",
#       "description": "..."
#     }
#   ]
# }
```

### 3. CRUD операции с задачами

```bash
# 1. Получить задачи из пространства (замените SPACE_ID)
SPACE_ID="your_space_id_here"
curl -X GET "http://localhost:2999/api/dart-ai/tasks/$SPACE_ID" | jq '.'

# 2. Создать тестовую задачу
curl -X POST "http://localhost:2999/api/dart-ai/tasks/$SPACE_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "🧪 Тестовая задача",
    "description": "Создано для тестирования API",
    "status": "todo",
    "priority": "medium",
    "tags": ["test", "api"]
  }' | jq '.'

# 3. Получить созданную задачу (замените TASK_ID)
TASK_ID="your_task_id_here"
curl -X GET "http://localhost:2999/api/dart-ai/tasks/$SPACE_ID/$TASK_ID" | jq '.'

# 4. Обновить задачу
curl -X PUT "http://localhost:2999/api/dart-ai/tasks/$SPACE_ID/$TASK_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "in_progress",
    "description": "Обновлено через API тест"
  }' | jq '.'

# 5. Удалить тестовую задачу
curl -X DELETE "http://localhost:2999/api/dart-ai/tasks/$SPACE_ID/$TASK_ID" | jq '.'
```

### 4. GitHub интеграция

```bash
# Создание задачи из GitHub Issue
curl -X POST "http://localhost:2999/api/dart-ai/github-issue" \
  -H "Content-Type: application/json" \
  -d '{
    "issue": {
      "number": 123,
      "title": "Test GitHub Integration",
      "body": "Testing issue creation from GitHub",
      "labels": ["test", "integration"],
      "repository": "gHashTag/ai-server"
    },
    "spaceId": "default"
  }' | jq '.'
```

## 🤖 Тестирование Telegram команд

### 1. Проверка доступа админов

Выполните эти команды в Telegram боте **только как администратор**:

```
/dartai_help - Показать справку по Dart AI
/dartai spaces - Получить список пространств
/dartai_github - Показать команды GitHub интеграции
```

### 2. Основные команды управления

```
# Просмотр задач
/dartai tasks - Показать задачи из первого пространства

# Создание задачи
/dartai create
# Бот попросит ввести:
# 1. Название задачи
# 2. Описание (опционально)
# 3. Приоритет (low/medium/high/critical)
# 4. Теги через запятую

# Получение статистики
/dartai stats - Показать аналитику по задачам
```

### 3. Управление конкретными задачами

```
# Получить задачу по ID
/dartai get <task_id>

# Изменить статус задачи
/dartai status <task_id> <new_status>
# Доступные статусы: todo, in_progress, done, cancelled

# Изменить приоритет
/dartai priority <task_id> <priority>
# Доступные приоритеты: low, medium, high, critical

# Удалить задачу
/dartai delete <task_id>
```

### 4. GitHub интеграция через Telegram

```
# Создать задачу из GitHub Issue
/github_to_dartai <issue_number> <repository>
# Пример: /github_to_dartai 123 gHashTag/ai-server

# Синхронизировать открытые Issues
/sync_github_issues <repository>
# Пример: /sync_github_issues gHashTag/ai-server
```

## 📊 Проверка результатов

### ✅ Критерии успешного тестирования

1. **API маршруты:**
   - Все curl команды возвращают success: true
   - Статус конфигурации configured: true
   - CRUD операции работают без ошибок

2. **Telegram команды:**
   - Все команды отвечают (не показывают "Command not found")
   - Админские команды доступны только администраторам
   - Создание/обновление задач работает корректно

3. **Интеграция:**
   - Задачи создаются в Dart AI с корректными данными
   - GitHub Issues корректно преобразуются в задачи
   - Синхронизация работает в обе стороны

### ❌ Возможные проблемы и решения

#### Проблема: "Command not found" в Telegram
**Решение:**
```bash
# Перезагрузите команды бота
npm run dev
# Или перезапустите полностью
```

#### Проблема: API возвращает 401/403
**Решение:**
```bash
# Проверьте API ключ Dart AI
echo $DART_AI_API_KEY
# Если пустой, добавьте в .env файл
```

#### Проблема: 404 на API маршрутах
**Решение:**
```bash
# Убедитесь, что API сервер запущен на порту 2999
lsof -i :2999
# Проверьте, что маршруты подключены в src/api_server/index.ts
```

#### Проблема: "Access denied" для команд
**Решение:**
```bash
# Проверьте ADMIN_IDS в .env файле
# Ваш Telegram ID должен быть в списке администраторов
```

## 🎯 Автоматическое тестирование

Для быстрой проверки всей функциональности:

```bash
# Запустите полный интеграционный тест
node test-dart-ai-integration.js

# Ожидаемый результат:
# ✅ Все тесты прошли успешно
# 🚀 Dart AI API полностью интегрирован и работает
```

## 📈 Мониторинг и отладка

### Логирование

Все операции Dart AI логируются с префиксом `[Dart AI API]`:

```bash
# Следите за логами в реальном времени
tail -f logs/combined.log | grep "Dart AI"

# Поиск ошибок
grep "ERROR.*Dart AI" logs/combined.log
```

### Отладка через браузер

API эндпоинты можно тестировать через браузер:

```
http://localhost:2999/api/dart-ai/status
http://localhost:2999/api/health
```

## 🎊 Финальная проверка

После успешного завершения всех тестов у вас должно быть:

- ✅ **Полнофункциональный API** для управления задачами Dart AI
- ✅ **Telegram команды** для администраторов
- ✅ **GitHub интеграция** для создания задач из Issues
- ✅ **Двухсторонняя синхронизация** между системами
- ✅ **Мониторинг и логирование** всех операций

**Поздравляем! Dart AI Task Manager полностью интегрирован! 🎉**

---

## 🛠️ Дополнительные инструменты

### Быстрые тестовые скрипты

В проекте созданы вспомогательные скрипты:

- `test-env.js` - Проверка переменных окружения
- `test-dart-ai-integration.js` - Полное интеграционное тестирование
- `test-local-api.js` - Тестирование локального API сервера
- `quick-test-api.js` - Быстрая проверка внешних API

### Документация

- `DART_AI_SETUP_GUIDE.md` - Подробное руководство по настройке
- Этот файл - `DART_AI_TESTING_PLAN.md` - План тестирования

**Используйте этот план для систематической проверки всей функциональности!**