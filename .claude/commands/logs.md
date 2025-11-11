# Logs Command - Мониторинг и автоматическое исправление проблем

Автоматически проверяет логи продакшн сервера, анализирует ошибки и применяет исправления.

## Что делает команда:

1. **Подключается к production серверу** (188.137.250.69)
2. **Получает логи Docker контейнера** 999-multibots (последние 100 строк)
3. **Анализирует логи на наличие:**
   - JavaScript runtime errors
   - Telegram API errors
   - Database connection issues
   - Memory/Resource problems
   - Startup failures
4. **Показывает статус системы:**
   - Docker container status
   - Resource usage (CPU, Memory)
   - Active processes
5. **Автоматически исправляет проблемы:**
   - Запускает js-error-fixer агента для JavaScript ошибок
   - Предлагает решения для других типов проблем
   - Генерирует готовые команды для исправления

## Использование:

```bash
/logs
```

## Автоматические действия:

### При обнаружении JavaScript ошибок:
- Запуск `js-error-fixer` агента
- Автоматический анализ stack trace
- Применение common fixes
- Commit и push исправлений
- Автоматический деплой через GitHub Actions

### При обнаружении проблем с Docker:
- Проверка статуса контейнера
- Анализ resource usage
- Рекомендации по перезапуску/пересборке

### При обнаружении Telegram API ошибок:
- Проверка токенов и credentials
- Валидация .env конфигурации
- Рекомендации по исправлению

## Выполняемые команды:

```bash
# 1. Статус Docker контейнера
ssh -i ~/.ssh/zomro root@188.137.250.69 'docker ps | grep 999-multibots'

# 2. Логи контейнера (последние 100 строк)
ssh -i ~/.ssh/zomro root@188.137.250.69 'docker logs 999-multibots --tail 100'

# 3. Поиск JavaScript ошибок
ssh -i ~/.ssh/zomro root@188.137.250.69 'docker logs 999-multibots 2>&1 | grep -E "(Error|Exception|TypeError|ReferenceError|at .*\()" | tail -50'

# 4. Resource usage
ssh -i ~/.ssh/zomro root@188.137.250.69 'docker stats 999-multibots --no-stream'

# 5. Проверка active processes внутри контейнера
ssh -i ~/.ssh/zomro root@188.137.250.69 'docker exec 999-multibots ps aux'
```

## Типы автоматических исправлений:

### JavaScript Errors:
- **TypeError/ReferenceError**: Анализ кода, добавление проверок
- **Undefined properties**: Добавление optional chaining (?.)
- **Promise rejections**: Добавление proper error handling
- **Module import errors**: Исправление путей импорта

### Common Fixes (js-error-fixer):
```javascript
// 1. Add null checks
if (!obj || !obj.property) return defaultValue;

// 2. Proper error handling
try { ... } catch (error) { logger.error('...', error); }

// 3. Safe property access
const value = obj?.property?.nested ?? defaultValue;

// 4. Promise error handling
await someAsyncCall().catch(error => handleError(error));
```

### Docker/Infrastructure Problems:
- Container not running → `docker restart` или rebuild
- High memory usage → рекомендации по оптимизации
- Port conflicts → mapping исправления

## Интеграция с агентами:

### js-error-fixer (автоматически):
```bash
# Активируется при обнаружении JS ошибок в логах
# Инструменты: [Bash, Read, Write, Edit, TodoWrite]
# Действия:
# 1. Определяет тип ошибки
# 2. Находит проблемный файл и строку
# 3. Применяет исправление
# 4. Коммитит изменения
# 5. Пушит в production ветку
# 6. GitHub Actions автоматически делает деплой
```

### deployment-manager (при необходимости):
```bash
# Если нужна пересборка Docker контейнера
/deploy
```

## Формат отчета:

```
📊 PRODUCTION LOGS ANALYSIS - 999-multibots
═══════════════════════════════════════════

🐳 DOCKER STATUS:
   Container: 999-multibots [RUNNING/STOPPED]
   Uptime: X hours
   Restart count: X

💻 RESOURCE USAGE:
   CPU: XX.X%
   Memory: XXX MB / XXX MB (XX%)

📝 RECENT LOGS (last 100 lines):
   [timestamp] [level] message
   ...

🔍 ERROR ANALYSIS:
   ❌ Found X JavaScript errors
   ❌ Found X Telegram API errors
   ⚠️  Found X warnings

⚡ AUTOMATIC ACTIONS TAKEN:
   ✅ js-error-fixer: Fixed TypeError in src/file.ts:123
   ✅ Committed fix: "fix: Handle null user in statsCommand"
   ✅ Pushed to production branch
   ✅ GitHub Actions deployment triggered

🛠️ RECOMMENDED MANUAL ACTIONS:
   1. [Конкретная команда для исправления]
   2. [Альтернативное решение]

💡 QUICK FIX COMMANDS:
   [Готовые SSH команды для копирования]
```

## Примеры использования:

### Простая проверка логов:
```bash
/logs
# Показывает логи и статус, без исправлений если нет проблем
```

### При обнаружении ошибок:
```bash
/logs
# Автоматически:
# 1. Находит JavaScript ошибки
# 2. Запускает js-error-fixer
# 3. Исправляет код
# 4. Делает commit + push
# 5. Деплоит через GitHub Actions
```

## Связанные команды:

- `/deploy` - Ручной деплой в production
- `/check` - Быстрая проверка JS ошибок в логах (без исправлений)
- `/docs-sync` - Синхронизация документации

## Конфигурация:

**Сервер**: root@188.137.250.69
**SSH Key**: ~/.ssh/zomro
**Docker Container**: 999-multibots
**Project Path**: /root/bot-farm
**Log Lines**: 100 (по умолчанию)

## Безопасность:

- Все изменения коммитятся с описанием
- Автоматический деплой только через GitHub Actions
- Возможность отката через git revert
- Логирование всех действий агента

---

**Быстрый доступ:**
```bash
/logs                    # Мониторинг и автофикс
/logs --tail 200        # Больше строк логов (будущая опция)
/logs --no-fix          # Только показать, не исправлять (будущая опция)
```
