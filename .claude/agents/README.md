# Claude Code Agents

Коллекция специализированных саб-агентов для автоматизации задач.

## 📋 Доступные агенты (16 Total)

### Production & Deployment (4) 🚀
1. **server-health-checker** - `/check` - Production server health monitoring
2. **deployment-manager** - `/deploy` - OLD Docker deployment (DEPRECATED)
3. **devops-automation** - `/deploy` - 🆕 NEW! Local build + remote deploy workflow
4. **js-error-fixer** - Auto-fix JavaScript errors in production logs

### User Management (1)
5. **telegram-user-manager** - `/user-check [id]` - Telegram user access management

### Code Quality & Architecture (5) ✨
6. **best-practices-researcher** - Research best practices before implementing
7. **anti-duplication-guardian** - Prevent code duplication (DRY)
8. **business-logic-guardian** - Enforce Clean Architecture separation
9. **code-reviewer** - Strict quality enforcer ("бьет по рукам")
10. **continuous-optimizer** - 🆕 NEW! Perpetually dissatisfied optimization agent

### Development & Testing (3) 🧪
11. **tdd-test-engineer** - Test-First development (RED-GREEN-REFACTOR)
12. **telegram-scene-builder** - Create Telegram scenes with proper patterns
13. **docker-test-controller** - 🆕 NEW! Docker test environment with MCP observability

### Coordination & Docs (3)
14. **rules-guardian** - Meta-agent monitoring all agents
15. **docs-sync** - Sync deployment documentation
16. **sora-video-generator** - OpenAI Sora 2 video generation

---

## 🚀 Как использовать

### Через slash-команды
```bash
/check              # Server health check
/deploy             # Deploy to production
/user-check [id]    # User management
```

### Через естественный язык

**Просто попросите Claude:**
```
Проверь здоровье сервера
Задеплой изменения в production
Проверь пользователя 144022504
Создай промпт для Sora 2 про [тема]
```

**Claude автоматически поймет и вызовет нужного агента!**

### Прямой вызов через Task tool (для разработчиков)

**Правильный XML синтаксис:**
```xml
<invoke name="Task">
<parameter name="description">Server diagnostics</parameter>
<parameter name="prompt">Run complete health check on production server</parameter>
<parameter name="subagent_type">server-health-checker</parameter>
</invoke>
```

**Псевдокод для понимания:**
```javascript
// Это НЕ реальный синтаксис, просто для объяснения структуры
Task({
  description: "Server diagnostics",
  prompt: "Run complete health check",
  subagent_type: "server-health-checker"
})
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
tools: [Bash, Read, Edit]  # IMPORTANT: Array format!
model: sonnet
---

# Your Agent

Agent description and instructions...
```

⚠️ **ВАЖНО**: Поле `tools` ДОЛЖНО быть в формате массива `[Tool1, Tool2]`, НЕ `Tool1, Tool2`!

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
