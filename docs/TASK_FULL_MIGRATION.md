# 🎯 ЗАДАЧА: Полная Миграция Бизнес-Логики ai-server → telegraf

> **Дата создания**: 2025-10-30
> **Приоритет**: 🔴 КРИТИЧЕСКИЙ
> **Срок**: 5 дней
> **Цель**: Всё на одном сервере (Zomro 212.86.115.30)

---

## 📊 КРИТИЧЕСКИЙ АНАЛИЗ

### ❌ ПРОБЛЕМА: Текущий план покрывает только 10% кода!

**Факты**:
- В ai-server: **325 TypeScript файлов** (644 MB)
- В текущем плане: ~30 файлов (только Inngest functions)
- **Упущено**: 295 файлов (90% кодовой базы!)

**Критичные компоненты НЕ в плане**:
- ❌ 17 REST API routes
- ❌ 17 Controllers
- ❌ 38 Services
- ❌ 82 Core/Supabase модулей
- ❌ 9 Core API интеграций
- ❌ 4 Middlewares
- ❌ 10 Utils

**Последствия**: Если мигрировать только Inngest - система полностью нерабочая!

---

## ✅ РЕШЕНИЕ: Полная Миграция

### Что мигрируем:

1. ✅ **REST API** (17 routes + 17 controllers + 4 middlewares)
2. ✅ **Business Services** (38 сервисов)
3. ✅ **Core Modules** (82 Supabase + 9 API интеграций)
4. ✅ **Inngest Functions** (29 функций)
5. ✅ **Utils, Config, DTOs** (~100 файлов)

**Итого**: Все 325 файлов (644 MB)

---

## 🗺️ АРХИТЕКТУРА ПОСЛЕ МИГРАЦИИ

**Один сервер Zomro 212.86.115.30**:
```
Docker Container: 999-multibots
├── Telegram Bot (10 ботов) - порты 2999-3010
├── REST API (Express) - порт 4000
├── Inngest Functions - порт 4000
├── Webhook Handlers
└── Background Workers
```

**Один процесс Node.js**:
- Entry point: `src/index.ts`
- Telegram bot: `src/bot.ts`
- REST API: `src/api_server/server.ts`
- Inngest: `src/inngest_app/`

---

## 🔀 ИЗОЛЯЦИЯ ВЕТОК

### Стратегия: Feature Branch

```bash
cd /Users/playra/999-agents-telegraf
git checkout production
git checkout -b feat/full-ai-server-migration

# ВСЯ работа в этой ветке
# Merge в production только когда ВСЁ готово и протестировано
```

**Изоляция**:
- ✅ Полная изоляция от production
- ✅ Легкий rollback (git revert)
- ✅ Можно тестировать без влияния на production
- ✅ Один merge commit когда готово

---

## 📋 ФАЗЫ МИГРАЦИИ

### 🔴 PHASE 1: Critical Infrastructure (1 день)
**Компоненты**:
- Create feature branch
- Install dependencies (REST API packages)
- Create directory structure
- Migrate core/supabase (82 файла - КРИТИЧНО!)

**Скрипт**: `./scripts/migrate-all-business-logic.sh` (Phase 1)

---

### 🟡 PHASE 2: REST API & Webhooks (1 день)
**Компоненты**:
- 17 Routes
- 17 Controllers
- 4 Middlewares
- Create Express server setup

**Критичные routes**:
- webhook.route.ts
- replicateWebhook.route.ts
- webhook-bfl-neurophoto.route.ts
- payment.route.ts
- generation.route.ts

---

### 🟡 PHASE 3: Services & Business Logic (1 день)
**Компоненты**:
- 38 Services:
  - Generation services (10 файлов)
  - Video services (5 файлов)
  - Broadcast service
  - Avatar services
  - Prompt services
  - И другие

**Largest services**:
- backgroundMorphingProcessor.ts (22 KB)
- broadcast.service.ts (19 KB)
- brollPromptsService.ts (15 KB)

---

### 🟢 PHASE 4: Core Modules (1 день)
**Компоненты**:
- core/openai
- core/replicate
- core/instagram
- core/storytelling
- core/bfl
- core/kling
- core/elevenlabs
- core/100ms
- Utils (10 файлов)
- Config, DTOs, Interfaces

---

### 🟢 PHASE 5: Inngest Functions (4 часа)
**Компоненты** (уже запланировано в INNGEST_MIGRATION_PLAN.md):
- Render functions (3)
- Content functions (7)
- Training functions (2)
- Image functions (2)
- Payment/Broadcast functions (2)
- Monitoring functions (2)

---

### 🟢 PHASE 6: Integration & Testing (1 день)
**Задачи**:
- Update main entry point (src/index.ts)
- Create API server (src/api_server/server.ts)
- Update all imports
- Merge environment variables
- Build and test
- Full integration testing

---

## 🛠️ ИНСТРУМЕНТЫ И СКРИПТЫ

### Созданные скрипты:

1. **`migrate-all-business-logic.sh`** - Полная миграция всех 325 файлов
   ```bash
   ./scripts/migrate-all-business-logic.sh
   ```

2. **`install-migration-deps.sh`** - Установка зависимостей
   ```bash
   ./scripts/install-migration-deps.sh
   ```

3. **`fix-migration-issues.sh`** - Исправление проблем
   ```bash
   ./scripts/fix-migration-issues.sh
   ```

### Документация:

1. **`COMPLETE_MIGRATION_PLAN.md`** - Полный план (5 фаз)
2. **`CRITICAL_MISSING_BUSINESS_LOGIC.md`** - Анализ упущенного
3. **`INNGEST_MIGRATION_PLAN.md`** - План Inngest миграции
4. **`MIGRATION_DEPENDENCIES.md`** - Зависимости
5. **`POST_MIGRATION_CHECKLIST.md`** - Чеклист после миграции
6. **`MIGRATION_QUICKSTART.md`** - Быстрый старт

---

## ⏱️ TIMELINE

| Phase | Duration | Tasks | Files | Status |
|-------|----------|-------|-------|--------|
| **Phase 1** | 1 день | Infrastructure, Supabase | 82 | 🔴 TODO |
| **Phase 2** | 1 день | REST API, Webhooks | 38 | 🔴 TODO |
| **Phase 3** | 1 день | Services | 38 | 🔴 TODO |
| **Phase 4** | 1 день | Core Modules | ~50 | 🔴 TODO |
| **Phase 5** | 4 часа | Inngest Functions | 29 | 🔴 TODO |
| **Phase 6** | 1 день | Integration, Testing | 5 | 🔴 TODO |
| **TOTAL** | **5 дней** | **Полная миграция** | **325** | |

---

## 🎯 КРИТЕРИИ УСПЕХА

### Must Have (обязательно):
- [ ] Все 325 файлов мигрированы
- [ ] Все импорты обновлены
- [ ] Build successful (npm run build)
- [ ] All tests passing
- [ ] REST API endpoints working
- [ ] Inngest functions working
- [ ] Telegram bot working
- [ ] Webhooks processing
- [ ] Docker build successful
- [ ] Zero regressions

### Nice to Have (желательно):
- [ ] Performance improvements
- [ ] Code refactoring
- [ ] Documentation updates
- [ ] Monitoring setup

---

## 🚀 КАК НАЧАТЬ (Quick Start)

### Шаг 1: Прочитать документацию (30 минут)
```bash
# Критический анализ
cat docs/CRITICAL_MISSING_BUSINESS_LOGIC.md

# Полный план
cat docs/COMPLETE_MIGRATION_PLAN.md

# Quick start
cat docs/MIGRATION_QUICKSTART.md
```

### Шаг 2: Создать feature branch (2 минуты)
```bash
cd /Users/playra/999-agents-telegraf
git checkout production
git checkout -b feat/full-ai-server-migration
```

### Шаг 3: Запустить миграцию (5 дней)
```bash
# Установить зависимости
./scripts/install-migration-deps.sh

# Запустить полную миграцию
./scripts/migrate-all-business-logic.sh

# Следовать плану Phase by Phase
# См. COMPLETE_MIGRATION_PLAN.md
```

### Шаг 4: Тестирование и деплой (1 день)
```bash
# Build
npm run build

# Test
npm run test

# Deploy
# См. POST_MIGRATION_CHECKLIST.md
```

---

## ⚠️ КРИТИЧЕСКИЕ ПРЕДУПРЕЖДЕНИЯ

### 🔴 ВАЖНО #1: НЕ начинать миграцию без чтения документации!

**Обязательно прочитать**:
1. CRITICAL_MISSING_BUSINESS_LOGIC.md
2. COMPLETE_MIGRATION_PLAN.md
3. POST_MIGRATION_CHECKLIST.md

### 🔴 ВАЖНО #2: НЕ мигрировать только Inngest!

**Текущий план (INNGEST_MIGRATION_PLAN.md) покрывает только 10% кода!**

Используйте **COMPLETE_MIGRATION_PLAN.md** для полной миграции.

### 🔴 ВАЖНО #3: Изоляция веток

**Работать ТОЛЬКО в feature branch**: `feat/full-ai-server-migration`

**НЕ коммитить** в production до полного завершения!

### 🔴 ВАЖНО #4: Тестирование

**После КАЖДОЙ фазы** запускать:
```bash
npm run build
npm run typecheck
npm run test
```

---

## 📊 СТАТИСТИКА

### Объем работы:

| Метрика | Значение |
|---------|----------|
| Файлов для миграции | 325 |
| Размер кода | 644 MB |
| Routes | 17 |
| Controllers | 17 |
| Services | 38 |
| Core/Supabase | 82 |
| Core/Other | ~30 |
| Inngest functions | 29 |
| Middlewares | 4 |
| Utils | 10 |
| Config/Other | ~100 |

### Покрытие планов:

| План | Файлов | % покрытия |
|------|--------|------------|
| **INNGEST_MIGRATION_PLAN.md** (старый) | 30 | 10% ❌ |
| **COMPLETE_MIGRATION_PLAN.md** (новый) | 325 | 100% ✅ |

---

## 🆘 ROLLBACK PLAN

### Если миграция не удалась:

**Option A: Git Revert**
```bash
git checkout production
git branch -D feat/full-ai-server-migration
# Start over with better plan
```

**Option B: Restore from Backup**
```bash
# Backup создается автоматически скриптом
# Location: /tmp/full-migration-backup-YYYYMMDD-HHMMSS
cp -r /tmp/full-migration-backup-*/src/* /Users/playra/999-agents-telegraf/src/
```

**Option C: Keep ai-server Running**
```bash
# На Zomro сервере
ssh -i ~/.ssh/zomro root@212.86.115.30
cd /root/ai-server
# ai-server продолжает работать
# Откат к нему если нужно
```

---

## 🎯 NEXT STEPS

### Immediate (Сегодня):
1. [ ] Прочитать CRITICAL_MISSING_BUSINESS_LOGIC.md
2. [ ] Прочитать COMPLETE_MIGRATION_PLAN.md
3. [ ] Принять решение: начинать полную миграцию
4. [ ] Создать feature branch
5. [ ] Запустить fix-migration-issues.sh

### This Week (Эта неделя):
6. [ ] Phase 1: Critical Infrastructure (1 день)
7. [ ] Phase 2: REST API (1 день)
8. [ ] Phase 3: Services (1 день)
9. [ ] Phase 4: Core Modules (1 день)
10. [ ] Phase 5: Inngest (4 часа)
11. [ ] Phase 6: Integration & Testing (1 день)

### Next Week (Следующая неделя):
12. [ ] Production deployment
13. [ ] Monitoring (24 hours)
14. [ ] Deprecate ai-server (after 1 week stable)

---

## ✅ CHECKLIST: Готов ли я начать?

Перед началом миграции убедитесь:

- [ ] Прочитал CRITICAL_MISSING_BUSINESS_LOGIC.md
- [ ] Прочитал COMPLETE_MIGRATION_PLAN.md
- [ ] Понимаю что текущий план покрывает только 10%
- [ ] Понимаю что нужна полная миграция 325 файлов
- [ ] Понимаю стратегию изоляции веток
- [ ] Знаю timeline (5 дней)
- [ ] Создал backup ai-server
- [ ] Создал feature branch
- [ ] Готов к 5 дням работы
- [ ] Имею план rollback

**Если все ✅ → начинать миграцию!**

---

## 📞 ПОДДЕРЖКА

**Документация**:
- `docs/COMPLETE_MIGRATION_PLAN.md` - Основной план
- `docs/CRITICAL_MISSING_BUSINESS_LOGIC.md` - Анализ
- `docs/POST_MIGRATION_CHECKLIST.md` - Тестирование
- `docs/MIGRATION_QUICKSTART.md` - Quick start

**Скрипты**:
- `scripts/migrate-all-business-logic.sh` - Полная миграция
- `scripts/install-migration-deps.sh` - Зависимости
- `scripts/fix-migration-issues.sh` - Исправления

---

**Document Version**: 1.0
**Date**: 2025-10-30
**Status**: 🔴 READY TO START
**Priority**: CRITICAL
