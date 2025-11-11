# 🎯 Claude Code Skills для VIBEE Telegram Bot

Коллекция специализированных Claude Code Skills для максимально эффективной работы с этим проектом.

## 📦 Установленные Skills

### 1. **telegram-bot-expert** 🤖
Полная экспертиза по Telegraf framework и архитектуре бота.

**Что знает:**
- Архитектура Scenes/Wizards
- Async/await обязательные паттерны
- MyContext типизация
- Структура файлов проекта
- Частые ошибки и их исправления
- Integration points

**Когда использовать:**
- Создание новых scenes/wizards
- Исправление ошибок в handlers
- Рефакторинг bot code
- Вопросы про Telegraf паттерны

---

### 2. **production-deployment** 🚀
Всё о деплое на production сервер 188.137.250.69.

**Что знает:**
- Полный deployment workflow
- Docker команды и docker-compose
- SSH автоматизация
- Health monitoring
- Rollback процедуры
- Emergency procedures
- Log monitoring

**Когда использовать:**
- Деплой на production
- Проблемы с Docker
- SSH операции
- Troubleshooting production issues
- Rollback после fail deploy

---

### 3. **infisical-secrets** 🔐
Cloud-first подход к управлению секретами.

**Что знает:**
- Правило "только 5 переменных в .env"
- Почему AI НЕ ДОЛЖНЫ добавлять секреты в .env
- Infisical initialization процесс
- Все секреты проекта (50+ keys)
- Troubleshooting Infisical
- Security best practices

**Когда использовать:**
- Добавление новых секретов
- Ошибки "secret not found"
- Вопросы про .env файл
- Migration dev/prod environments
- Security questions

---

### 4. **supabase-database** 💾
Полная схема БД и query patterns.

**Что знает:**
- Все таблицы (users, assets, payments, trainings, etc.)
- Query patterns для каждой таблицы
- Helper functions в src/core/supabase/
- RLS policies (если нужны)
- Indexes и оптимизация
- Common errors

**Когда использовать:**
- Database queries
- Создание новых таблиц
- Миграции
- Оптимизация queries
- Ошибки БД

---

### 5. **inngest-expert** ⚡
Event-driven background jobs с Inngest.

**Что знает:**
- Event-driven architecture
- Step-based execution с checkpoints
- Retry стратегии
- Concurrency control
- Все функции проекта
- Обязательные rules (ВСЕГДА копировать похожую функцию!)
- Webhook integration

**Когда использовать:**
- Создание новых Inngest functions
- Async операции (model training, video generation)
- Webhook processing
- Background jobs
- Long-running tasks

---

### 6. **telegram-scenes-master** 🎭
МАСТЕР-класс по Telegram Scenes - ВСЕ паттерны из 50+ scenes.

**Что знает:**
- BaseScene vs WizardScene паттерны
- Session state management
- Zod validation
- Keyboard patterns (Reply vs Inline)
- Language detection
- Balance checking
- Admin-only scenes
- Error handling в scenes
- Cancel button patterns
- File handling
- ALL anti-patterns to avoid

**Когда использовать:**
- Создание ЛЮБОЙ новой сцены
- Рефакторинг существующих scenes
- Wizard flows
- User input validation
- Multi-step processes
- Это САМЫЙ ВАЖНЫЙ skill для работы с ботом!

---

### 7. **ai-pipeline-orchestration** 🎨
AI generation pipelines и provider management.

**Что знает:**
- Provider pattern (Replicate, Fal, KieAI)
- Orchestrator architecture
- Functional programming patterns (TaskEither, pipe)
- LipSync system architecture
- Provider factory
- Caching strategy
- Cost estimation
- Failover logic
- Error recovery
- All supported models

**Когда использовать:**
- Интеграция новых AI providers
- Video/Image/Audio generation
- LipSync операции
- Provider failover
- Cost optimization
- Pipeline architecture

---

## 🎓 Как Claude Code Использует Skills

### Автоматическая Загрузка
Claude Code автоматически:
1. Сканирует `.claude/skills/` при старте
2. Читает SKILL.md файлы
3. Загружает только нужные skills для текущей задачи
4. Использует `name` и `description` для discovery

### Progressive Disclosure
- Сначала загружает только название + описание (несколько токенов)
- Загружает полное содержимое только когда skill нужен
- Эффективное использование context window

### Composability
Skills можно комбинировать:
- `telegram-scenes-master` + `supabase-database` = создать scene с DB
- `telegram-bot-expert` + `production-deployment` = деплой bot changes
- `inngest-expert` + `ai-pipeline-orchestration` = async AI processing

---

## 📋 Best Practices

### 1. Специфичные Описания
```yaml
# ✅ GOOD
description: Expert in Telegraf Scenes with session management, Zod validation, and 50+ production patterns

# ❌ BAD
description: Helps with Telegram bot
```

### 2. Когда Использовать
Включайте в description **когда** использовать skill:
```yaml
description: ... Use when creating scenes, handling user input, or debugging Telegraf issues
```

### 3. Структура SKILL.md
```markdown
---
name: skill-name
description: What it does and when to use it
---

# Skill Name

Clear overview

## Core Concepts
Key patterns

## Common Use Cases
Real examples

## Best Practices
Do's and don'ts

## Quick Reference
Cheat sheet
```

---

## 🔄 Обновление Skills

### Когда Обновлять
- Новые паттерны в проекте
- Изменения в архитектуре
- Новые best practices
- Частые ошибки

### Как Обновлять
```bash
# Edit skill
vim .claude/skills/telegram-bot-expert/SKILL.md

# Claude Code автоматически подхватит изменения
# при следующем запуске
```

---

## 📊 Статистика Проекта

### Telegram Bot
- 50+ scenes (wizards + base scenes)
- 20+ commands
- 10+ AI providers
- Multi-language support (RU/EN)

### Infrastructure
- Infisical (50+ secrets)
- Supabase (10+ tables)
- Inngest (background jobs)
- Docker deployment

### AI Capabilities
- Video generation (5+ models)
- Image generation (10+ models)
- Audio generation (ElevenLabs, OpenAI)
- LipSync (6+ providers)
- Face swap
- Model training (Flux LoRA)

---

## 🎯 Workflow Примеры

### Создать Новую Scene
```
1. Claude использует telegram-scenes-master
2. Находит похожую существующую scene
3. Копирует структуру
4. Адаптирует под новую функциональность
5. Применяет все best practices
```

### Добавить Inngest Function
```
1. Claude использует inngest-expert
2. ОБЯЗАТЕЛЬНО ищет похожую функцию (grep)
3. Копирует структуру
4. Адаптирует под новый event
5. Регистрирует в registerFunctions.ts
```

### Деплой на Production
```
1. Claude использует production-deployment
2. Проверяет checklist (build, typecheck, tests)
3. Запускает npm run deploy
4. Мониторит logs
5. Готов к rollback если нужно
```

---

## 🚨 Критические Правила

### ДЛЯ AI АГЕНТОВ

1. **NEVER** добавляй секреты в .env (см. infisical-secrets)
2. **ALWAYS** копируй похожую функцию перед созданием новой (inngest-expert)
3. **ALWAYS** answer callback queries в scenes (telegram-scenes-master)
4. **ALWAYS** используй isRussianFromState() (telegram-bot-expert)
5. **ALWAYS** validate inputs с Zod (telegram-scenes-master)
6. **ALWAYS** проверяй balance перед операциями (supabase-database)
7. **ALWAYS** логируй с emojis для clarity (все skills)
8. **ALWAYS** handle errors gracefully (все skills)
9. **NEVER** silent catch без уведомления user (telegram-scenes-master)
10. **ALWAYS** тестируй локально перед deploy (production-deployment)

---

## 📚 Дополнительные Ресурсы

### Project Documentation
- `CLAUDECODE_RULES.md` - Общие правила разработки
- `INNGEST_DEVELOPMENT_RULES.md` - Inngest-specific rules
- `DEPLOYMENT_RULES.md` - Deployment procedures
- `NGINX_DEPLOYMENT_CRITICAL_RULES.md` - NGINX config

### Skills Source
Все skills созданы из реального production кода:
- 50+ scenes → telegram-scenes-master
- 7 Inngest functions → inngest-expert
- 10+ database tables → supabase-database
- 20+ AI providers → ai-pipeline-orchestration

---

## 🎉 Итого

**7 Specialized Skills** покрывают:
- ✅ Telegram bot architecture
- ✅ Production deployment
- ✅ Secret management
- ✅ Database operations
- ✅ Background jobs
- ✅ Scene patterns (50+ examples!)
- ✅ AI pipeline orchestration

**Результат:**
- 🚀 Быстрая разработка с правильными паттернами
- 🎯 Меньше ошибок (знает все anti-patterns)
- 📚 Instant expertise (вся документация в одном месте)
- 🔄 Consistent code style across project
- ⚡ Максимальная эффективность Claude Code

---

**Создано:** 2025-01-11
**Автор:** AI-assisted project analysis
**Версия:** 1.0
**Статус:** Production-ready ✅
