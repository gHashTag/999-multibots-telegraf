# Claude Code Agents

Коллекция специализированных саб-агентов для автоматизации задач.

## 📋 Доступные агенты

### 1. server-health-checker
**Команда**: `/check`

Автоматизированная проверка состояния production сервера.

**Проверяет**:
- ✅ Docker container status & uptime
- 📊 CPU, RAM, процессы
- 🚨 Критические ошибки в логах
- 🎨 AI Photoshop functionality (wasAllModels)
- 📡 Supabase, network, activity

**Использование**:
```bash
/check
```

[Подробная документация](../../docs/server-health-checker.md)

---

### 2. deployment-manager
**Команда**: `/deploy`

Управление деплоем на production сервер.

**Возможности**:
- 🚀 Автоматический деплой
- 🔨 Пересборка Docker контейнера
- 📝 Git операции
- ✅ Проверка после деплоя

**Использование**:
```bash
/deploy
```

---

### 3. telegram-user-manager
**Команда**: `/user-check [telegram_id]`

Автоматическое управление пользователями Telegram ботов.

**Функции**:
- 👤 Проверка статуса пользователя
- 💰 Анализ баланса и подписки
- 🔧 Автоматические рекомендации
- ⚡ Быстрые действия (grant access, etc.)

**Автоактивация**: При упоминании Telegram ID (8-12 цифр)

**Использование**:
```bash
/user-check 144022504
# или просто упомянуть ID в сообщении
```

---

## 🚀 Как использовать

### Через slash-команды
```bash
/check              # Server health check
/deploy             # Deploy to production
/user-check [id]    # User management
```

### Через Task tool
```javascript
Task("Server diagnostics", "Run health check", "general-purpose")
Task("Deploy changes", "Deploy to production", "general-purpose")
Task("Check user 144022504", "Analyze user status", "general-purpose")
```

## 📁 Структура

```
.claude/
├── agents/
│   ├── server-health-checker.md
│   ├── deployment-manager.md
│   ├── telegram-user-manager.md
│   └── README.md (этот файл)
└── commands/
    ├── check.md
    ├── deploy.md
    └── user-check.md
```

## 🔧 Создание нового агента

1. Создайте файл в `.claude/agents/your-agent.md`:
```markdown
---
name: your-agent
description: What this agent does
tools: Bash, Read, Edit
model: sonnet
---

# Your Agent

Agent description and instructions...
```

2. Создайте команду в `.claude/commands/your-command.md`:
```markdown
---
name: your-command
description: What this command does
---

Command description...
```

3. Перезапустите Claude Code для применения изменений

## 📊 Best Practices

1. **Параллельные операции**: Используйте batch Bash calls для скорости
2. **Четкие инструкции**: Опишите точно, что агент должен делать
3. **Обработка ошибок**: Предусмотрите fallback сценарии
4. **Документация**: Всегда документируйте новые агенты

## 🛠 Инструменты агентов

- **Bash**: SSH команды, git, docker
- **Read**: Чтение файлов и логов
- **Edit**: Модификация файлов
- **Write**: Создание новых файлов
- **Grep**: Поиск в файлах
- **Glob**: Поиск файлов по паттерну

## 📞 Поддержка

Для вопросов и предложений:
- Документация: `docs/`
- Issues: GitHub repository
- Примеры использования: См. агенты выше
