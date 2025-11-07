# 🚀 Advanced Claude Code Patterns from bible_vibecoder

> **Источник:** Проверенные паттерны из продакшн проекта bible_vibecoder
> **Дата обновления:** 2025-10-16

## 📋 Содержание

1. [Расширенная структура агентов](#-расширенная-структура-агентов)
2. [Hooks система для автоматизации](#-hooks-система-для-автоматизации)
3. [Правильная работа с аргументами в командах](#-правильная-работа-с-аргументами-в-командах)
4. [Организация агентов по категориям](#-организация-агентов-по-категориям)
5. [Permissions и безопасность](#-permissions-и-безопасность)
6. [Централизованное управление ассетами](#-централизованное-управление-ассетами)

---

## 🤖 Расширенная структура агентов

### Базовый формат (официальная документация)
```yaml
---
name: agent-name
description: When this subagent should be invoked
tools: Read, Write, Bash, Grep, Glob
model: sonnet
---

System prompt for agent.
```

### Расширенный формат (bible_vibecoder patterns)

```yaml
---
name: coder
type: developer              # Категория агента
color: "#FF6B35"            # Цветовая метка для визуализации
description: Implementation specialist for writing clean, efficient code
capabilities:               # Список специфических навыков
  - code_generation
  - refactoring
  - optimization
  - api_design
  - error_handling
priority: high              # high/medium/low - для автоматического выбора
tools: Read, Write, Bash, Grep, Glob
model: sonnet
hooks:                      # Автоматические действия
  pre: |
    echo "💻 Coder agent implementing: $TASK"
    if grep -q "test\|spec" <<< "$TASK"; then
      echo "⚠️  Remember: Write tests first (TDD)"
    fi
  post: |
    echo "✨ Implementation complete"
    if [ -f "package.json" ]; then
      npm run lint --if-present
    fi
---

# System prompt with detailed instructions
```

### Ключевые преимущества расширенного формата

1. **`type`** - позволяет категоризировать агентов (developer, validator, coordinator, etc.)
2. **`color`** - визуальная идентификация в UI/логах
3. **`capabilities`** - четкое определение навыков для автоматического выбора
4. **`priority`** - управление порядком выполнения
5. **`hooks`** - автоматизация pre/post действий

### Примеры разных типов агентов

#### Developer Agent
```yaml
---
name: backend-dev
type: developer
color: "#3498DB"
capabilities:
  - api_design
  - database_schema
  - microservices
priority: high
---
```

#### Validator Agent
```yaml
---
name: reviewer
type: validator
color: "#E74C3C"
capabilities:
  - code_review
  - security_audit
  - performance_analysis
priority: medium
---
```

#### Coordinator Agent
```yaml
---
name: task-orchestrator
type: coordinator
color: "#9B59B6"
capabilities:
  - task_decomposition
  - agent_coordination
  - workflow_optimization
priority: critical
---
```

---

## 🔗 Hooks система для автоматизации

### Что такое hooks?

Hooks - это bash-скрипты, которые выполняются автоматически **до** (pre) и **после** (post) работы агента.

### Синтаксис hooks

```yaml
hooks:
  pre: |
    # Bash команды, выполняемые ДО начала работы агента
    echo "🚀 Starting: $TASK"
    # Доступные переменные:
    # $TASK - описание задачи
    # $AGENT_NAME - имя агента
    # $TIMESTAMP - текущее время

  post: |
    # Bash команды, выполняемые ПОСЛЕ завершения работы агента
    echo "✅ Completed: $TASK"
    # Автоматические проверки, форматирование, etc.
```

### Примеры использования hooks

#### 1. Автоматическая проверка TDD

```yaml
hooks:
  pre: |
    echo "💻 Coder agent implementing: $TASK"
    # Проверяем, есть ли упоминание тестов в задаче
    if grep -q "test\|spec" <<< "$TASK"; then
      echo "⚠️  Remember: Write tests first (TDD)"
    fi
  post: |
    echo "✨ Implementation complete"
    # Запускаем линтер если есть package.json
    if [ -f "package.json" ]; then
      npm run lint --if-present
    fi
```

#### 2. Сохранение результатов в память

```yaml
hooks:
  pre: |
    echo "👀 Reviewer agent analyzing: $TASK"
    # Создаем checklist для review
    memory_store "review_checklist_$(date +%s)" \
      "functionality,security,performance,maintainability,documentation"
  post: |
    echo "✅ Review complete"
    echo "📝 Review summary stored in memory"
```

#### 3. Автоматическое тестирование

```yaml
hooks:
  pre: |
    echo "🧪 Tester agent running tests"
    # Проверяем окружение
    if ! command -v npm &> /dev/null; then
      echo "❌ npm not found"
      exit 1
    fi
  post: |
    # Запускаем тесты
    npm test
    # Генерируем coverage report
    npm run coverage
    echo "📊 Test results stored"
```

#### 4. Git автоматизация

```yaml
hooks:
  pre: |
    echo "📝 Committing changes"
    git status
  post: |
    # Auto-commit если изменений немного
    CHANGES=$(git diff --stat | tail -n1)
    echo "Changes: $CHANGES"
    if [[ $CHANGES =~ "1 file changed" ]]; then
      git add .
      git commit -m "Auto-commit: $TASK"
    fi
```

#### 5. Производительность и метрики

```yaml
hooks:
  pre: |
    START_TIME=$(date +%s)
    echo "⏱️  Started at: $START_TIME"
  post: |
    END_TIME=$(date +%s)
    DURATION=$((END_TIME - START_TIME))
    echo "✅ Completed in: ${DURATION}s"
    # Сохраняем метрики
    echo "$AGENT_NAME,$TASK,$DURATION" >> metrics.csv
```

### Best Practices для hooks

1. **Быстрое выполнение**: Hooks должны работать < 1 секунды
2. **Безопасность**: Не используйте опасные команды (rm -rf, etc.)
3. **Проверки**: Всегда проверяйте наличие зависимостей
4. **Логирование**: Выводите понятные сообщения
5. **Условная логика**: Используйте проверки перед действиями

---

## 🔧 Правильная работа с аргументами в командах

### Базовый синтаксис аргументов

```yaml
---
argument-hint: [тема] [--tts]  # Подсказка для пользователя
description: Команда с аргументами
---

# В теле команды доступны:
$ARGUMENTS  # Все аргументы целиком
$1          # Первый аргумент
$2          # Второй аргумент
$3          # Третий аргумент
```

### Примеры использования аргументов

#### 1. Обязательный аргумент с проверкой

```yaml
---
argument-hint: [topic]
---

{{#if $1}}
**Тема:** $1

Обрабатываем тему: $1
{{else}}
❌ **Ошибка:** Укажите тему!

**Использование:**
```bash
/command "ваша тема"
```
{{/if}}
```

#### 2. Множественные аргументы

```yaml
---
argument-hint: [project] [task] [priority]
---

**Проект:** $1
**Задача:** $2
**Приоритет:** {{#if $3}}$3{{else}}normal{{/if}}

{{#if (and $1 $2)}}
✅ Запускаем задачу "$2" для проекта "$1"
{{else}}
❌ Укажите проект и задачу!
{{/if}}
```

#### 3. Опциональные флаги

```yaml
---
argument-hint: [тема] [--verbose] [--tts]
---

**Тема:** $1

**Verbose режим:** {{#if (eq $2 "--verbose")}}✅ Включен{{else}}❌ Отключен{{/if}}

**TTS озвучка:** {{#if (eq $3 "--tts")}}✅ Включена{{else}}❌ Отключена{{/if}}

{{#if (eq $2 "--verbose")}}
## 📋 Детальная информация
- Полные логи
- Расширенная статистика
- Debug информация
{{/if}}
```

#### 4. Условная логика с аргументами

```yaml
---
argument-hint: [command] [target]
---

## Выполнение команды: $1

{{#if (eq $1 "deploy")}}
🚀 Деплой на сервер: $2
{{else if (eq $1 "test")}}
🧪 Запуск тестов для: $2
{{else if (eq $1 "build")}}
🔨 Сборка проекта: $2
{{else}}
❌ Неизвестная команда: $1

**Доступные команды:**
- deploy
- test
- build
{{/if}}
```

### Важные правила работы с аргументами

1. **Кавычки**: Аргументы с пробелами ВСЕГДА в кавычках
   ```bash
   ✅ /command "нейронные сети" --verbose
   ❌ /command нейронные сети --verbose
   ```

2. **Проверка наличия**: Всегда проверяйте `{{#if $1}}`
3. **argument-hint**: Используйте для подсказок пользователю
4. **Логика Handlebars**: Используйте условия для гибкости

---

## 📁 Организация агентов по категориям

### Рекомендуемая структура директорий

```
.claude/agents/
├── README.md                    # Документация агентов
├── core/                        # Основные агенты
│   ├── coder.md                # Разработчик
│   ├── reviewer.md             # Ревьюер
│   ├── tester.md               # Тестировщик
│   ├── planner.md              # Планировщик
│   └── researcher.md           # Исследователь
├── specialized/                 # Специализированные агенты
│   ├── telegram-scene-builder.md
│   ├── telegram-user-manager.md
│   ├── sora-video-generator.md
│   └── best-practices-researcher.md
├── testing/                     # Тестовые агенты
│   ├── tdd-test-engineer.md
│   ├── unit-tester.md
│   └── integration-tester.md
├── architecture/                # Архитектурные агенты
│   ├── system-architect.md
│   └── database-architect.md
├── devops/                      # DevOps агенты
│   ├── deployment-manager.md
│   └── server-health-checker.md
├── documentation/               # Документационные агенты
│   ├── docs-sync.md
│   └── api-docs-generator.md
└── guardians/                   # Агенты-наблюдатели
    ├── rules-guardian.md
    ├── code-reviewer.md
    ├── business-logic-guardian.md
    └── anti-duplication-guardian.md
```

### Преимущества организации по категориям

1. **Простая навигация**: Быстрый поиск нужного агента
2. **Масштабируемость**: Легко добавлять новых агентов
3. **Понятная структура**: Сразу видно, какие агенты для чего
4. **Изоляция**: Агенты не мешают друг другу

### Пример README.md для агентов

```markdown
# Claude Code Agents Directory

## Core Agents (5)
- `coder` - Implementation specialist
- `reviewer` - Code review and QA
- `tester` - Testing automation
- `planner` - Task decomposition
- `researcher` - Information gathering

## Specialized Agents (7)
- `telegram-scene-builder` - Telegram bot scenes
- `telegram-user-manager` - User management automation
- `sora-video-generator` - AI video generation
- `best-practices-researcher` - Research best practices
- `business-logic-guardian` - Clean Architecture enforcement
- `anti-duplication-guardian` - DRY principle enforcer
- `tdd-test-engineer` - TDD implementation specialist

## Automatic Delegation

Agents are automatically triggered by:
1. **Keywords**: "test" → tester, "deploy" → deployment-manager
2. **File patterns**: `*.test.ts` → tester, `*.scene.ts` → telegram-scene-builder
3. **Context**: Database queries → database-architect
```

---

## 🔐 Permissions и безопасность

### Настройка permissions в settings.json

```json
{
  "permissions": {
    "allow": [
      "Bash(npx claude-flow *)",
      "Bash(npm run lint)",
      "Bash(npm run test:*)",
      "Bash(git status)",
      "Bash(git diff *)",
      "Bash(git log *)",
      "Bash(git add *)",
      "Bash(git commit *)",
      "Bash(node *)",
      "Bash(ls *)",
      "Bash(pwd)"
    ],
    "deny": [
      "Bash(rm -rf /)",
      "Bash(curl * | bash)",
      "Bash(wget * | sh)",
      "Bash(eval *)",
      "Bash(sudo *)"
    ]
  }
}
```

### Ограничение инструментов в командах

```yaml
---
allowed-tools: Bash(node:*), Bash(echo:*), Read, Write
description: Команда с ограниченными правами
---

# Теперь эта команда может использовать только:
- Bash с node
- Bash с echo
- Read tool
- Write tool
```

### Best Practices безопасности

1. **Минимальные права**: Разрешайте только необходимое
2. **Whitelist подход**: Явно разрешайте, а не запрещайте
3. **Опасные команды**: Всегда в deny списке
4. **Регулярный аудит**: Проверяйте permissions

---

## 📦 Централизованное управление ассетами

### Концепция "Avatar Brain"

**Проблема:** Медиа-файлы разбросаны по проекту, дублируются, сложно управлять.

**Решение:** Единый источник правды для всех ассетов.

### Структура Avatar Brain

```
avatar_brain/
├── video/
│   ├── backgrounds/          # Фоновые видео по категориям
│   │   ├── educational/      # 01.mp4, 02.mp4, 03.mp4, 04.mp4
│   │   ├── business/
│   │   ├── entertainment/
│   │   └── spiritual/
│   ├── source/               # Исходные видео файлы
│   ├── generated/            # AI-сгенерированные видео
│   ├── processed/            # Обработанные видео
│   └── templates/            # Шаблоны видео
├── audio/
│   ├── music/                # Фоновая музыка
│   ├── voices/               # Голосовые записи
│   ├── generated/            # AI TTS аудио
│   └── effects/              # Звуковые эффекты
├── images/
│   ├── covers/               # Обложки для видео
│   ├── backgrounds/          # Фоновые изображения
│   ├── avatars/              # Изображения аватаров
│   └── logos/                # Логотипы
├── texts/
│   ├── scenarios/            # Сценарии
│   ├── templates/            # Текстовые шаблоны
│   └── generated/            # AI-сгенерированный текст
└── config/
    ├── settings/             # Системные настройки
    └── profiles/             # Профили аватаров
```

### Интеграция через symlink

```bash
# Создание symlink для доступа к ассетам
ln -s avatar_brain/ public/avatar-assets

# Теперь в коде можно использовать:
staticFile("avatar-assets/video/backgrounds/educational/01.mp4")
staticFile("avatar-assets/audio/music/corporate.mp3")
```

### Правила работы с ассетами

1. **ALWAYS**: Храни новые медиа в avatar_brain/
2. **NEVER**: Создавай дублирующие папки вне avatar_brain/
3. **Semantic naming**: `category-number.ext` (e.g., `educational-01.mp4`)
4. **Symlink reference**: Используй `avatar-assets/` в коде
5. **Keep originals**: Никогда не удаляй исходники в source/

### Преимущества Avatar Brain

- ✅ **Single Source of Truth** - все ассеты в одном месте
- ✅ **Easy Backup** - одна папка для бэкапа
- ✅ **Version Control** - отслеживание изменений
- ✅ **Reusability** - переиспользование ассетов
- ✅ **Organization** - чистая структура
- ✅ **Scalability** - легко добавлять категории

---

## 🎯 Практические примеры

### Полный пример специализированного агента

```yaml
---
name: telegram-scene-builder
type: specialized
color: "#2ECC71"
description: Expert in creating Telegram bot scenes using Telegraf WizardScene pattern
capabilities:
  - scene_creation
  - ui_design
  - user_flow
  - validation
  - error_handling
priority: high
tools: Read, Write, Edit, Grep, Glob
model: sonnet
hooks:
  pre: |
    echo "🎭 Building Telegram scene: $TASK"
    # Check for existing similar scenes
    if [ -d "src/scenes" ]; then
      existing=$(find src/scenes -name "*.scene.ts" | wc -l)
      echo "📁 Found $existing existing scenes"
    fi
  post: |
    echo "✅ Scene created successfully"
    # Auto-format TypeScript
    if command -v prettier &> /dev/null; then
      prettier --write "src/scenes/**/*.scene.ts"
    fi
    # Run type check
    npm run typecheck
---

# Telegram Scene Builder Agent

You are an expert in creating Telegram bot scenes following best practices...

## Scene Structure Pattern

```typescript
import { Scenes } from 'telegraf';

export const myScene = new Scenes.WizardScene(
  'scene-name',
  // Step 1: Initial prompt
  async (ctx) => {
    await ctx.reply('Welcome! What is your name?');
    return ctx.wizard.next();
  },
  // Step 2: Process input
  async (ctx) => {
    const name = ctx.message.text;
    ctx.scene.session.name = name;
    await ctx.reply(`Nice to meet you, ${name}!`);
    return ctx.scene.leave();
  }
);
```

[Detailed instructions continue...]
```

---

## 📚 Дополнительные ресурсы

### Официальная документация
- [Claude Code Sub-agents](https://docs.claude.com/en/docs/claude-code/sub-agents)
- [Slash Commands](https://docs.claude.com/en/docs/claude-code/slash-commands)

### Примеры из bible_vibecoder
- Полная структура агентов: `.claude/agents/`
- Система команд: `.claude/commands/`
- Hooks примеры: См. `coder.md`, `reviewer.md`, `tester.md`

### Применение в 999-agents-telegraf
- Специализированные агенты уже созданы (см. `.claude/agents/`)
- Команды настроены (см. `.claude/commands/`)
- Документация обновлена

---

**Обновлено:** 2025-10-16
**Источник:** bible_vibecoder production patterns
