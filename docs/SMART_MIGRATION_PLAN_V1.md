# 🎯 SMART MIGRATION PLAN v1.0
## Миграция ТОЛЬКО используемых компонентов

> **Принцип**: Мигрировать только то, что РЕАЛЬНО используется bot-farm
> **Версия**: 1.0 (обновляется по мере использования новых функций)
> **Дата**: 2025-10-30
> **Статус**: 🟢 ACTIVE

---

## 📊 АНАЛИЗ ИСПОЛЬЗОВАНИЯ

### ✅ ЧТО РЕАЛЬНО ИСПОЛЬЗУЕТСЯ bot-farm

#### 1. Inngest Functions (существующие в telegraf)
- ✅ `generateAIReelsFunction.ts` - AI Reels генерация (lipSyncWizard)
- ✅ `generateModelTrainingFunction.ts` - Обучение моделей (modelTrainingWizard)
- ✅ `generateAdvancedLoopingVideoFunction.ts` - Looping видео
- ✅ `testSimpleFunction.ts` - Тестовые функции

**Status**: Уже есть в telegraf, обновления не требуется

#### 2. Inngest Functions (НУЖНЫ из ai-server)
- 🔴 `render/renderRiddle.ts` - Riddle workflow (НЕ НАЙДЕНО в telegraf)
- 🔴 `render/renderAvatarVideo.ts` - Avatar video generation (НЕ НАЙДЕНО)
- 🔴 `render/render.ts` - Basic render function (НЕ НАЙДЕНО)
- ⚠️ `paymentProcessing.ts` - Может понадобиться для платежей
- ⚠️ `broadcastMessage.ts` - Может понадобиться для рассылок

#### 3. REST API Endpoints (используются)
- 🔴 `/webhooks/replicate` - Webhook для Replicate (generateModelTrainingFunction)
- ⚠️ `/api/elevenlabs/*` - ElevenLabs endpoints (createVoiceElevenLabs.ts)
- ⚠️ `/api/upload` - Загрузка файлов

#### 4. Services (используются)
- 🔴 ElevenLabs интеграция (createVoiceElevenLabs, createAudioFileFromText)
- ⚠️ Video processing services (если используются render функции)

#### 5. Core Modules (используются)
- ✅ `core/supabase/*` - УЖЕ ЕСТЬ в telegraf
- ✅ `core/elevenlabs/*` - УЖЕ ЕСТЬ в telegraf
- ✅ `core/lipsync/*` - УЖЕ ЕСТЬ в telegraf
- 🔴 `core/replicate/*` - Нужен для webhooks

---

## 🎯 SMART MIGRATION PHASES

### 📍 PHASE 0: Анализ (COMPLETED)
**Что сделано**:
- ✅ Проанализированы все scenes в bot-farm
- ✅ Найдены вызовы Inngest функций
- ✅ Определены используемые API endpoints
- ✅ Проверены существующие функции в telegraf

---

### 🔴 PHASE 1: Критичные Render функции (Priority: HIGH)

**Что мигрировать**:
```
src/inngest-functions/render/
├── render.ts              # Basic render
├── renderRiddle.ts        # Riddle workflow
├── renderAvatarVideo.ts   # Avatar video
├── steps.ts               # Shared steps
├── types.ts               # TypeScript types
├── schemas.ts             # Validation
└── helpers/               # Helper functions
```

**Зачем**: Эти функции могут использоваться для генерации видео с аватарами

**Timeline**: 2-3 часа

**Script**:
```bash
# Copy render functions
cp -r /Users/playra/ai-server/src/inngest-functions/render \
      /Users/playra/999-agents-telegraf/src/inngest_app/functions/

# Update imports
find src/inngest_app/functions/render -name "*.ts" \
  -exec sed -i '' 's|@/core/inngest/clients|@/inngest_app/client|g' {} \;
```

---

### 🟡 PHASE 2: Webhook Routes (Priority: MEDIUM)

**Что мигрировать**:
- `replicateWebhook.route.ts` + controller
- `webhook.route.ts` + controller (если нужен)

**Зачем**: generateModelTrainingFunction использует webhook для Replicate

**Timeline**: 1-2 часа

**Files**:
```
src/api_server/
├── routes/
│   └── replicateWebhook.route.ts
└── controllers/
    └── replicateWebhook.controller.ts
```

---

### 🟢 PHASE 3: Payment & Broadcast (Priority: LOW)

**Что мигрировать** (по необходимости):
- `paymentProcessing.ts` - Inngest функция для платежей
- `broadcastMessage.ts` - Inngest функция для рассылок

**Зачем**: Могут понадобиться для платежей и рассылок

**Timeline**: 1 час

**Status**: ⏸️ ОТЛОЖЕНО до явной необходимости

---

### ⏸️ PHASE 4: On-Demand миграция

**Принцип**: Мигрировать только когда появляется реальная потребность

**Tracking List** (что может понадобиться):
- [ ] generation.route.ts + controller - если будет UI для генерации
- [ ] upload.route.ts + controller - если нужна загрузка файлов
- [ ] pricing.route.ts - если нужно управление ценами
- [ ] Services для генерации изображений

---

## 📊 MIGRATION TRACKING

### Мигрировано
| Component | From | To | Date | Status |
|-----------|------|----|------|--------|
| - | - | - | - | - |

### В процессе
| Component | Phase | Progress | ETA |
|-----------|-------|----------|-----|
| render functions | 1 | 0% | 2-3h |
| replicate webhook | 2 | 0% | 1-2h |

### Отложено
| Component | Reason | Priority |
|-----------|--------|----------|
| payment processing | Не используется явно | LOW |
| broadcast message | Не используется явно | LOW |
| generation routes | Нет UI требований | LOW |

---

## 🔄 VERSION HISTORY

### v1.0 (2025-10-30)
- Initial smart migration plan
- Identified actually used components
- Created phased approach
- Focus on render functions and webhooks

### Next Version Triggers
- Когда появится необходимость в новых функциях
- Когда добавятся новые scenes в bot-farm
- Когда потребуются новые API endpoints

---

## 📋 QUICK CHECKLIST

### Before Migration
- [ ] Проверить что функция ДЕЙСТВИТЕЛЬНО используется
- [ ] Найти все зависимости функции
- [ ] Создать backup
- [ ] Обновить этот документ

### During Migration
- [ ] Копировать только нужные файлы
- [ ] Обновлять импорты сразу
- [ ] Тестировать после каждого компонента
- [ ] Обновлять Migration Tracking таблицу

### After Migration
- [ ] Протестировать в bot-farm
- [ ] Обновить версию плана
- [ ] Документировать что мигрировано
- [ ] Commit с clear message

---

## 🚀 HOW TO START

### Step 1: Migrate Render Functions (PRIORITY)
```bash
cd /Users/playra/999-agents-telegraf
git checkout -b feat/smart-migration-render

# Copy render functions
cp -r /Users/playra/ai-server/src/inngest-functions/render \
      src/inngest_app/functions/

# Update imports
# Test locally
npm run build
npm run test
```

### Step 2: Add Webhook Support
```bash
# Only if needed for model training
mkdir -p src/api_server/routes
mkdir -p src/api_server/controllers

cp /Users/playra/ai-server/src/routes/replicateWebhook.route.ts \
   src/api_server/routes/

cp /Users/playra/ai-server/src/controllers/replicateWebhook.controller.ts \
   src/api_server/controllers/
```

### Step 3: Test in Bot Farm
```bash
# Test specific scenes that use these functions
# - lipSyncWizard
# - modelTrainingWizard (if exists)
```

---

## 📝 NOTES

### Why Smart Migration?
1. **Не мигрируем лишнее** - только то, что используется
2. **Быстрее** - часы вместо дней
3. **Меньше багов** - меньше кода = меньше проблем
4. **Проще поддержка** - понятно что и зачем
5. **Версионирование** - план растет с проектом

### What NOT to Migrate (пока)
- ❌ Все 38 services (мигрируем по необходимости)
- ❌ Все 17 routes (только используемые)
- ❌ Все 17 controllers (только используемые)
- ❌ 82 core/supabase файла (уже есть в telegraf)
- ❌ Неиспользуемые Inngest функции

### Migration Principles
1. **YAGNI** - You Aren't Gonna Need It
2. **Just In Time** - мигрировать когда нужно
3. **Test First** - проверять работает ли
4. **Document Everything** - обновлять этот план
5. **Small Steps** - маленькие изменения

---

## 🎯 CURRENT FOCUS

### 🔴 IMMEDIATE ACTION: Migrate Render Functions

**Why**: lipSyncWizard может их использовать для AI Reels

**What**:
1. `render/render.ts`
2. `render/renderRiddle.ts`
3. `render/renderAvatarVideo.ts`

**How**: See Step 1 above

**Timeline**: 2-3 часа

**Success Criteria**:
- [ ] Functions copied to telegraf
- [ ] Imports updated
- [ ] Build successful
- [ ] Tests passing
- [ ] lipSyncWizard работает

---

**END OF PLAN v1.0**