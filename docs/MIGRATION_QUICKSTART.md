# 🚀 INNGEST MIGRATION: Quick Start Guide

> **Цель**: Перенести все Inngest функции из `ai-server` в `999-agents-telegraf`

---

## ⚡ TL;DR - Быстрый старт (5 минут)

```bash
cd /Users/playra/999-agents-telegraf

# 1. Установить зависимости
./scripts/install-migration-deps.sh

# 2. Мигрировать файлы
./scripts/migrate-inngest-functions.sh

# 3. Собрать проект
npm run build

# 4. Запустить тесты
npm run test

# 5. Запустить локально
npm run dev
```

Если всё работает → переходите к деплою в production (см. ниже).

---

## 📚 Полная Документация

| Документ | Описание |
|----------|----------|
| **[INNGEST_MIGRATION_PLAN.md](./INNGEST_MIGRATION_PLAN.md)** | 📋 Полный план миграции (архитектура, фазы, маппинг файлов) |
| **[MIGRATION_DEPENDENCIES.md](./MIGRATION_DEPENDENCIES.md)** | 📦 Анализ зависимостей, что добавить/обновить |
| **[POST_MIGRATION_CHECKLIST.md](./POST_MIGRATION_CHECKLIST.md)** | ✅ Чеклист после миграции (тестирование, деплой) |

---

## 📂 Что будет мигрировано?

### 25+ Inngest функций из ai-server:

#### 🎬 Render (3 функции)
- `render.ts` - Основной рендеринг
- `renderRiddle.ts` - Riddle workflow (avatar + B-roll)
- `renderAvatarVideo.ts` - Avatar video generation

#### 📝 Content (7 функций)
- `analyzeCompetitorReels.ts`
- `instagramScraper-v2.ts`
- `findCompetitors.ts`
- `extractTopContent.ts`
- `generateContentScripts.ts`
- `generateScenarioClips.ts`
- `generateDetailedScript.ts`

#### 🧠 Training (2 функции)
- `generateModelTraining.ts` (будет смержен с существующим)
- `modelTrainingV2.ts`

#### 🎨 Images (2 функции)
- `neuroImageGeneration.ts`
- `morphImages.ts`

#### 💰 Payments & Broadcast (2 функции)
- `paymentProcessing.ts`
- `broadcastMessage.ts`

#### 📊 Monitoring (2 функции)
- `logMonitor.ts`
- `criticalErrorMonitor.ts`

---

## 🛠️ Пошаговая Инструкция

### Шаг 1: Подготовка (5 минут)

```bash
cd /Users/playra/999-agents-telegraf

# Создать бэкап текущего состояния
cp -r src/inngest_app /tmp/inngest_app_backup_$(date +%Y%m%d)

# Создать feature branch
git checkout -b feat/inngest-migration
```

### Шаг 2: Установка зависимостей (3 минуты)

```bash
# Запустить скрипт установки
./scripts/install-migration-deps.sh

# Проверить что установилось
npm list inngest ssh2 @aws-sdk/client-s3 archiver express --depth=0

# Ожидаемые версии:
# ├── inngest@3.37.0
# ├── ssh2@1.17.0
# ├── @aws-sdk/client-s3@3.913.0
# ├── archiver@7.0.1
# └── express@4.18.1
```

### Шаг 3: Миграция файлов (2 минуты)

```bash
# Запустить скрипт миграции
./scripts/migrate-inngest-functions.sh

# Скрипт создаст:
# - src/inngest_app/functions/render/
# - src/inngest_app/functions/content/
# - src/inngest_app/functions/training/
# - src/inngest_app/functions/image/
# - src/inngest_app/functions/payments/
# - src/inngest_app/functions/broadcast/
# - src/inngest_app/functions/monitoring/
# - src/helpers/inngest/
# - docs/MIGRATION_REPORT_<timestamp>.md
```

### Шаг 4: Обновление импортов (10 минут - ВРУЧНУЮ)

Откройте каждый мигрированный файл и обновите импорты:

**Было (ai-server)**:
```typescript
import { inngest } from '@/core/inngest/clients'
import { supabase } from '@/config/supabase'
```

**Стало (telegraf)**:
```typescript
import { inngest } from '@/inngest_app/client'
import { supabase } from '@/core/supabase'
```

**Помощь**: Используйте глобальный поиск и замену (VSCode: Cmd+Shift+H)

### Шаг 5: Создание index файла (5 минут)

Создайте `src/inngest_app/functions/index.ts`:

```typescript
// Export all migrated functions

// Render
export * from './render/render'
export * from './render/renderRiddle'
export * from './render/renderAvatarVideo'

// Content
export * from './content/analyzeCompetitorReels'
export * from './content/instagramScraper-v2'
export * from './content/findCompetitors'
export * from './content/extractTopContent'
export * from './content/generateContentScripts'
export * from './content/generateScenarioClips'
export * from './content/generateDetailedScript'

// Training
export * from './training/generateModelTraining'
export * from './training/modelTrainingV2'

// Images
export * from './image/neuroImageGeneration'
export * from './image/morphImages'

// Payments & Broadcast
export * from './payments/paymentProcessing'
export * from './broadcast/broadcastMessage'

// Monitoring
export * from './monitoring/logMonitor'
export * from './monitoring/criticalErrorMonitor'

// Existing functions
export * from './generateAIReelsFunction'
export * from './generateModelTrainingFunction'
export * from './generateAdvancedLoopingVideoFunction'

// Import all function instances
import { renderFunction } from './render/render'
import { renderRiddleFunction } from './render/renderRiddle'
import { renderAvatarVideoFunction } from './render/renderAvatarVideo'
// ... import all others ...

// Export as array for Inngest registration
export const allFunctions = [
  renderFunction,
  renderRiddleFunction,
  renderAvatarVideoFunction,
  // ... add all imported functions
]
```

### Шаг 6: Интеграция Inngest сервера (5 минут)

Обновите `src/index.ts`:

```typescript
import express from 'express'
import { serve } from 'inngest/express'
import { inngest } from './inngest_app/client'
import { allFunctions } from './inngest_app/functions'

// ... existing bot setup ...

// Add Inngest HTTP endpoint
const app = express()

app.use('/api/inngest', serve({
  client: inngest,
  functions: allFunctions
}))

const INNGEST_PORT = process.env.INNGEST_PORT || 4000

app.listen(INNGEST_PORT, () => {
  console.log(`🚀 Inngest server listening on port ${INNGEST_PORT}`)
  console.log(`📡 Inngest endpoint: http://localhost:${INNGEST_PORT}/api/inngest`)
})

// ... rest of bot code ...
```

### Шаг 7: Environment variables (3 минуты)

Добавьте в `.env`:

```bash
# Render Server (SSH)
RENDER_SERVER_HOST=212.86.115.30
RENDER_SERVER_USER=root
RENDER_SERVER_SSH_KEY_PATH=~/.ssh/zomro  # Local
# RENDER_SERVER_SSH_KEY_PATH=/root/.ssh/zomro  # Production
RENDER_SERVER_PROJECT_PATH=/root/remotion-render

# AWS S3
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_REGION=us-east-1
AWS_S3_BUCKET=your_bucket

# Inngest
INNGEST_PORT=4000
INNGEST_EVENT_KEY=your_event_key
INNGEST_SIGNING_KEY=your_signing_key
```

### Шаг 8: Сборка и тестирование (5 минут)

```bash
# Сборка
npm run build

# Проверка типов
npm run typecheck

# Запуск тестов
npm run test

# Проверить что нет ошибок компиляции
```

### Шаг 9: Локальное тестирование (10 минут)

```bash
# Запустить бота локально
npm run dev

# В другом терминале - запустить Inngest dev сервер
npx inngest-cli@latest dev -u http://localhost:4000/api/inngest

# Проверить:
# 1. Бот запустился
# 2. Inngest сервер доступен
# 3. Все функции зарегистрированы в Inngest dashboard
```

Протестируйте вручную:
1. Отправить команду боту (например, `/start`)
2. Запустить workflow (например, AI Reels generation)
3. Проверить что Inngest функции выполняются
4. Проверить логи на наличие ошибок

### Шаг 10: Деплой в Production (10 минут)

**Вариант A: Через GitHub Actions (автоматически)**
```bash
git add .
git commit -m "feat: migrate Inngest functions from ai-server

- Migrated 25+ Inngest functions
- Updated dependencies (inngest@3.37.0, ssh2, AWS SDK)
- Integrated Inngest server into main bot
- Added environment variables

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"

git push origin feat/inngest-migration

# Merge to production
git checkout production
git merge feat/inngest-migration
git push origin production
# GitHub Actions автоматически задеплоит
```

**Вариант B: Через /deploy команду**
```bash
/deploy
```

**Вариант C: Вручную через SSH**
```bash
ssh -i ~/.ssh/zomro root@212.86.115.30 << 'EOF'
cd /root/bot-farm
git pull origin production
docker stop 999-multibots
docker rm 999-multibots
docker build --no-cache -t 999-multibots .
docker run -d --name 999-multibots --restart=always \
  -p 3000:3000 -p 4000:4000 -p 2999:2999 -p 3001:3001 -p 3002:3002 \
  -p 3003:3003 -p 3004:3004 -p 3005:3005 -p 3006:3006 -p 3007:3007 \
  -p 3008:3008 -p 3009:3009 -p 3010:3010 \
  -v /root/bot-farm/.env:/app/.env:ro \
  999-multibots
sleep 10
docker logs 999-multibots --tail 50
EOF
```

**⚠️ ВАЖНО**: Добавлен порт 4000 для Inngest сервера!

### Шаг 11: Проверка в Production (5 минут)

```bash
# Проверить контейнер
ssh -i ~/.ssh/zomro root@212.86.115.30 'docker ps | grep 999-multibots'

# Проверить логи
ssh -i ~/.ssh/zomro root@212.86.115.30 'docker logs 999-multibots --tail 100'

# Проверить Inngest endpoint
curl https://999-agents.site/api/inngest

# Ожидаемый ответ: JSON с информацией о Inngest приложении
```

### Шаг 12: Обновить Inngest Webhook

1. Открыть Inngest dashboard: https://app.inngest.com
2. Перейти в настройки приложения
3. Обновить Webhook URL: `https://999-agents.site/api/inngest`
4. Проверить подключение (кнопка "Test")

### Шаг 13: Мониторинг (первые 24 часа)

```bash
# Следить за логами в реальном времени
ssh -i ~/.ssh/zomro root@212.86.115.30 'docker logs -f 999-multibots'

# Проверять метрики каждый час
ssh -i ~/.ssh/zomro root@212.86.115.30 'docker stats 999-multibots --no-stream'

# Проверять Inngest dashboard:
# - Function executions
# - Error rates
# - Execution times
```

---

## ✅ Проверочный Чеклист

Перед тем как считать миграцию завершенной:

- [ ] Все файлы мигрированы (check MIGRATION_REPORT)
- [ ] Все импорты обновлены
- [ ] `npm run build` проходит без ошибок
- [ ] `npm run test` проходит без ошибок
- [ ] Локально бот запускается и работает
- [ ] Inngest dev сервер видит все функции
- [ ] Production деплой успешен
- [ ] Docker контейнер работает
- [ ] Inngest endpoint отвечает
- [ ] Webhook обновлен в Inngest dashboard
- [ ] Тестовые workflows выполняются
- [ ] Нет критических ошибок в логах

---

## 🆘 Troubleshooting

### Проблема: "Cannot find module '@/core/inngest/clients'"

**Решение**: Обновите импорт на `@/inngest_app/client`

### Проблема: "SSH connection failed"

**Решение**:
1. Проверить SSH ключ: `ls -la ~/.ssh/zomro`
2. Проверить переменные в `.env`
3. Протестировать SSH вручную: `ssh -i ~/.ssh/zomro root@212.86.115.30`

### Проблема: "S3 upload failed"

**Решение**:
1. Проверить AWS credentials в `.env`
2. Протестировать AWS CLI: `aws s3 ls s3://your-bucket`
3. Проверить IAM permissions

### Проблема: Docker build fails

**Решение**:
1. Очистить кэш: `docker system prune -a`
2. Проверить `package.json` на наличие всех зависимостей
3. Пересобрать с `--no-cache`

### Проблема: Inngest functions не регистрируются

**Решение**:
1. Проверить что все функции добавлены в `allFunctions` массив
2. Проверить `inngest` client инициализацию
3. Проверить INNGEST_SIGNING_KEY в `.env`

---

## 📊 Ожидаемый Timeline

| Фаза | Время | Описание |
|------|-------|----------|
| **Подготовка** | 5 мин | Backup, feature branch |
| **Установка deps** | 3 мин | `install-migration-deps.sh` |
| **Миграция файлов** | 2 мин | `migrate-inngest-functions.sh` |
| **Обновление импортов** | 10 мин | Ручная работа |
| **index.ts** | 5 мин | Создание экспортов |
| **Inngest server** | 5 мин | Интеграция в index.ts |
| **Environment vars** | 3 мин | Добавление в .env |
| **Build & Test** | 5 мин | npm scripts |
| **Локальное тестирование** | 10 мин | Ручное тестирование |
| **Production deploy** | 10 мин | Git push или /deploy |
| **Проверка prod** | 5 мин | Логи, endpoint |
| **Webhook update** | 2 мин | Inngest dashboard |
| **Мониторинг** | 24 часа | Continuous |
| **TOTAL** | **~1 час** | (без мониторинга) |

---

## 🎯 После Миграции

### Через 1 неделю стабильной работы:

1. **Остановить ai-server**:
   ```bash
   ssh -i ~/.ssh/zomro root@212.86.115.30 'pkill -f inngest-sdk-server.js'
   ```

2. **Создать бэкап ai-server**:
   ```bash
   ssh -i ~/.ssh/zomro root@212.86.115.30 'cd /root && tar -czf ai-server-backup-$(date +%Y%m%d).tar.gz ai-server/'
   ```

3. **Обновить документацию**:
   - Обновить CLAUDE.md
   - Архивировать миграционные документы

---

## 📞 Поддержка

- **Документация**: См. `docs/INNGEST_MIGRATION_PLAN.md`
- **Чеклист**: См. `docs/POST_MIGRATION_CHECKLIST.md`
- **Зависимости**: См. `docs/MIGRATION_DEPENDENCIES.md`

---

**Удачи с миграцией!** 🚀

**Last Updated**: 2025-10-30
