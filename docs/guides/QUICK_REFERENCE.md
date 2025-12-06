# 🚀 Quick Reference: Claude Code Best Practices

> **TL;DR:** Быстрая справка по лучшим паттернам из production проектов

## 📖 Основные документы

1. **[CLAUDE_ADVANCED_PATTERNS.md](CLAUDE_ADVANCED_PATTERNS.md)** - Полное руководство (644 строки)
2. **[DEVELOPMENT/CLAUDE.md](DEVELOPMENT/CLAUDE.md)** - Проектная документация
3. **[../CLAUDECODE_RULES.md](../CLAUDECODE_RULES.md)** - Критические правила

---

## ⚡ Быстрые примеры

### 1. Создание агента с hooks

```yaml
---
name: my-agent
type: developer
color: "#FF6B35"
description: What this agent does
capabilities:
  - code_generation
  - testing
priority: high
hooks:
  pre: |
    echo "🚀 Starting: $TASK"
  post: |
    echo "✅ Done"
    npm run lint
---

Agent system prompt...
```

### 2. Команда с аргументами

```yaml
---
argument-hint: [topic] [--flag]
description: Command with arguments
---

{{#if $1}}
**Topic:** $1
**Flag:** {{#if (eq $2 "--flag")}}✅{{else}}❌{{/if}}

Processing: $1
{{else}}
❌ Usage: /command "your topic"
{{/if}}
```

### 3. Permissions в settings.json

```json
{
  "permissions": {
    "allow": [
      "Bash(npm run *)",
      "Bash(git status)",
      "Read",
      "Write"
    ],
    "deny": [
      "Bash(rm -rf /)",
      "Bash(sudo *)"
    ]
  }
}
```

---

## 🎯 Ключевые принципы

### Агенты
- **Организуй по категориям**: `core/`, `specialized/`, `testing/`
- **Используй hooks**: Автоматизация pre/post действий
- **Определяй capabilities**: Для автоматического выбора
- **Добавляй type и color**: Для визуальной идентификации

### Команды
- **argument-hint**: Подсказки для пользователя
- **allowed-tools**: Ограничение прав
- **Handlebars**: Условная логика `{{#if $1}}`
- **Кавычки**: Аргументы с пробелами в кавычках

### Безопасность
- **Whitelist подход**: Явно разрешай, не запрещай
- **Минимальные права**: Только необходимое
- **Опасные команды**: В deny списке
- **Регулярный аудит**: Проверяй permissions

### Структура проекта
- **Avatar Brain**: Централизованные ассеты
- **Symlinks**: Интеграция с проектом
- **Semantic naming**: `category-number.ext`
- **Keep originals**: Не удаляй исходники

---

## 📁 Рекомендуемая структура

```
.claude/
├── agents/
│   ├── README.md
│   ├── core/              # Основные агенты
│   │   ├── coder.md
│   │   ├── reviewer.md
│   │   ├── tester.md
│   │   ├── planner.md
│   │   └── researcher.md
│   ├── specialized/       # Специализированные
│   ├── testing/           # Тестовые
│   ├── architecture/      # Архитектурные
│   ├── devops/           # DevOps
│   └── guardians/        # Наблюдатели
├── commands/
│   ├── deploy.md
│   ├── logs.md
│   └── scenario.md
└── settings.json
```

---

## 🔧 Полезные паттерны

### Hook: Автоматический TDD check
```yaml
hooks:
  pre: |
    if grep -q "test\|spec" <<< "$TASK"; then
      echo "⚠️  Remember: Write tests first (TDD)"
    fi
```

### Hook: Автоматический линтинг
```yaml
hooks:
  post: |
    if [ -f "package.json" ]; then
      npm run lint --if-present
    fi
```

### Hook: Сохранение в память
```yaml
hooks:
  pre: |
    memory_store "task_$(date +%s)" "$TASK"
  post: |
    echo "✅ Results stored in memory"
```

### Hook: Метрики производительности
```yaml
hooks:
  pre: |
    START_TIME=$(date +%s)
  post: |
    DURATION=$(($(date +%s) - START_TIME))
    echo "✅ Completed in: ${DURATION}s"
```

---

## 💡 Pro Tips

### Агенты
1. Используй `priority` для управления порядком
2. Добавляй `capabilities` для умного routing
3. Hooks должны быть быстрыми (< 1s)
4. Проверяй зависимости в hooks

### Команды
1. Всегда проверяй `{{#if $1}}`
2. Используй `argument-hint` для UX
3. Ограничивай `allowed-tools`
4. Тестируй с разными аргументами

### Производительность
1. Batch операции где возможно
2. Используй caching в hooks
3. Минимизируй количество shell calls
4. Используй параллельные операции

### Документация
1. Всегда добавляй описания
2. Примеры для каждой команды
3. Документируй hooks и их назначение
4. Обновляй при изменениях

---

## 🎨 Цветовая схема агентов

```
Developer:   #FF6B35 (оранжевый)
Validator:   #E74C3C (красный)
Coordinator: #9B59B6 (фиолетовый)
Tester:      #2ECC71 (зеленый)
Researcher:  #3498DB (синий)
Architect:   #F39C12 (желтый)
```

---

## 📊 Метрики качества

### Хороший агент:
- ✅ Четкое описание и capabilities
- ✅ Hooks для автоматизации
- ✅ Ограниченные tools
- ✅ Priority определен
- ✅ Документация и примеры

### Хорошая команда:
- ✅ argument-hint присутствует
- ✅ Проверка аргументов
- ✅ Понятные сообщения об ошибках
- ✅ allowed-tools определены
- ✅ Примеры использования

### Хорошая структура:
- ✅ Агенты по категориям
- ✅ Единый стиль YAML
- ✅ README в каждой категории
- ✅ settings.json с permissions
- ✅ Документация актуальна

---

## 🔗 Связанные ресурсы

### Официальная документация
- [Sub-agents](https://docs.claude.com/en/docs/claude-code/sub-agents)
- [Slash Commands](https://docs.claude.com/en/docs/claude-code/slash-commands)
- [Settings](https://docs.claude.com/en/docs/claude-code/settings)

### Примеры из проектов
- **bible_vibecoder**: Полная система контент-генерации
- **999-agents-telegraf**: Telegram bot с 16 агентами
- Hooks automation patterns
- Command argument handling

---

**Обновлено:** 2025-10-16
**Источник:** Production patterns from bible_vibecoder
