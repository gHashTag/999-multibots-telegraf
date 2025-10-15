# Claude Code Commands

Быстрые slash-команды для автоматизации задач.

## 📋 Доступные команды

### `/check` - Server Health Check
Комплексная проверка состояния production сервера.

**Что проверяет**:
- Docker container (status, uptime, resources)
- Critical errors в логах
- AI Photoshop functionality
- System health (Supabase, network)

**Использование**:
```bash
/check
```

**Агент**: `server-health-checker`
**Документация**: `docs/server-health-checker.md`

---

### `/deploy` - Deploy to Production
Автоматический деплой на production сервер.

**Что делает**:
- Git pull & build
- Docker rebuild с --no-cache
- Container restart
- Health check после деплоя

**Использование**:
```bash
/deploy
```

**Агент**: `deployment-manager`

---

### `/user-check [telegram_id]` - User Management
Проверка и управление пользователями Telegram ботов.

**Что проверяет**:
- User existence в базе
- Balance & subscription status
- Payment history
- Access problems

**Использование**:
```bash
/user-check 144022504
```

**Агент**: `telegram-user-manager`
**Автоактивация**: При упоминании 8-12 цифр

---

## 🚀 Как использовать

### 1. Прямой вызов
Просто введите команду с `/`:
```bash
/check
/deploy
/user-check 144022504
```

### 2. В сообщениях
Упомяните нужное действие:
```
"Проверь статус сервера" → автоматически /check
"144022504 нужен доступ" → автоматически /user-check
```

### 3. Через Task tool
```javascript
Task("Run health check", "Execute /check", "general-purpose")
```

## 🎯 Быстрые сценарии

### После изменений кода
```bash
/deploy
/check
```

### При проблемах пользователя
```bash
/user-check [telegram_id]
# Следуйте рекомендациям агента
```

### Регулярный мониторинг
```bash
/check
# Запускайте каждый час или после деплоев
```

## 📊 Создание новой команды

1. Создайте файл `.claude/commands/your-command.md`:
```markdown
---
name: your-command
description: Brief description
---

Detailed command description...
```

2. Перезапустите Claude Code

3. Используйте команду: `/your-command`

## 🛠 Расширенные возможности

### Параметры команд
Некоторые команды принимают параметры:
```bash
/user-check 144022504          # ID как параметр
/deploy --no-cache              # Флаги (если реализовано)
/check --detailed               # Расширенный отчет
```

### Цепочки команд
Комбинируйте команды для сложных задач:
```bash
# 1. Деплой
/deploy

# 2. Проверка
/check

# 3. Если есть проблемы - перезапуск
/restart
```

## 📁 Структура команд

```
.claude/commands/
├── check.md           # Server health
├── deploy.md          # Production deploy
├── user-check.md      # User management
└── README.md          # Этот файл
```

## 🔗 Связанные агенты

Каждая команда использует специализированного агента:

| Команда | Агент | Документация |
|---------|-------|--------------|
| `/check` | server-health-checker | docs/server-health-checker.md |
| `/deploy` | deployment-manager | - |
| `/user-check` | telegram-user-manager | - |

## 💡 Tips & Tricks

1. **Регулярность**: Запускайте `/check` после каждого деплоя
2. **Параметры**: Используйте параметры для точечных операций
3. **Логи**: Команды выводят детальные логи - читайте их
4. **Рекомендации**: Следуйте советам агентов
5. **Автоматизация**: Настройте hooks для автовызова команд

## 📞 Помощь

- Список команд: Этот файл
- Документация агентов: `.claude/agents/README.md`
- Детали по агентам: `docs/`
- Issues: GitHub repository
