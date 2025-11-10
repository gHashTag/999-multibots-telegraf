# 🔗 Систематизация URL - Финальный отчёт

**Дата**: 2025-11-09
**Проект**: VIBEE - AI-Powered Telegram Bot Platform

---

## 🔴 Проблема: Дублирование и хаос в URL конфигурации

### Найденные дублирующиеся переменные:

```typescript
// В src/config/index.ts:
API_SERVER_URL          // из .env
SERVER_API_URL          // дубликат!
LOCAL_SERVER_URL        // для локальной разработки
AI_SERVER_LOCAL_URL     // ещё один локальный URL!
USE_PRODUCTION_API      // флаг переключения
API_URL                 // вычисляемый URL (зависит от всех выше)
BASE_PAYMENT_URL        // для Robokassa
UNIFIED_RESULT_URL      // для платежей
```

### Устаревшие ссылки:

1. **Render Server (старый сервер)**: `https://ai-server-production-production-8e2d.up.render-server (local)`
   - Найдено в 20+ файлах
   - Не работает (Connection refused)
   - Должен быть заменён на `https://three-head-dragon.shop`

2. **Miniapp Render Server**: `https://miniapp-production-44c4.up.render-server (local)`
   - Найдено в `src/menu/miniAppButton.ts`
   - Статус неизвестен

---

## ✅ Решение: Единая система URL

### Новая архитектура (1 переменная вместо 7):

```typescript
// ✅ ЕДИНСТВЕННАЯ переменная для API сервера
export const API_SERVER_URL = process.env.API_SERVER_URL || 'https://three-head-dragon.shop'

// ✅ Опциональная локальная переменная (только для dev)
export const LOCAL_SERVER_URL = process.env.LOCAL_SERVER_URL // http://localhost:2999 или ngrok

// ✅ Умное переключение
export const API_URL = isDev && LOCAL_SERVER_URL
  ? LOCAL_SERVER_URL
  : API_SERVER_URL
```

### Удаляемые переменные:

```diff
- SERVER_API_URL          // дубликат API_SERVER_URL
- AI_SERVER_LOCAL_URL     // дубликат LOCAL_SERVER_URL
- USE_PRODUCTION_API      // не нужен при правильной архитектуре
- BASE_PAYMENT_URL        // заменяется на API_URL
```

---

## 📋 План миграции

### Шаг 1: Обновить конфигурацию

**Файл**: `src/config/index.ts`

```typescript
// БЫЛО (хаос):
const forceProductionAPI = USE_PRODUCTION_API === 'true'
export const API_URL = forceProductionAPI
  ? API_SERVER_URL
  : isDev
    ? (LOCAL_SERVER_URL || AI_SERVER_LOCAL_URL || API_SERVER_URL)
    : API_SERVER_URL

const BASE_PAYMENT_URL = isDev
  ? API_SERVER_URL || process.env.SERVER_API_URL || 'https://three-head-dragon.shop'
  : API_SERVER_URL || RESULT_URL2?.split('/payment-success')[0] || process.env.SERVER_API_URL || 'https://three-head-dragon.shop'

// СТАЛО (чисто):
export const API_SERVER_URL = process.env.API_SERVER_URL || 'https://three-head-dragon.shop'
export const LOCAL_SERVER_URL = process.env.LOCAL_SERVER_URL

export const API_URL = isDev && LOCAL_SERVER_URL
  ? LOCAL_SERVER_URL
  : API_SERVER_URL

export const PAYMENT_CALLBACK_URL = `${API_URL}/payment-success`
```

### Шаг 2: Обновить Infisical

#### Dev environment:
```bash
API_SERVER_URL=https://three-head-dragon.shop
LOCAL_SERVER_URL=http://localhost:3001  # или ngrok URL
```

#### Staging environment:
```bash
API_SERVER_URL=https://three-head-dragon.shop
# LOCAL_SERVER_URL не нужен
```

#### Prod environment:
```bash
API_SERVER_URL=https://three-head-dragon.shop
# LOCAL_SERVER_URL не нужен
```

### Шаг 3: Заменить все использования

```typescript
// ❌ УДАЛИТЬ везде:
SERVER_API_URL
AI_SERVER_LOCAL_URL
USE_PRODUCTION_API
BASE_PAYMENT_URL

// ✅ ИСПОЛЬЗОВАТЬ везде:
API_URL  // для всех API запросов
```

---

## 🔍 Где и что заменить

### 1. src/config/index.ts (главный файл)

**Удалить строки 93-116**:
```typescript
// ❌ УДАЛИТЬ:
  SERVER_API_URL,
  USE_PRODUCTION_API,

const forceProductionAPI = USE_PRODUCTION_API === 'true'
export const API_URL = forceProductionAPI
  ? API_SERVER_URL
  : isDev
    ? (LOCAL_SERVER_URL || AI_SERVER_LOCAL_URL || API_SERVER_URL)
    : API_SERVER_URL

const BASE_PAYMENT_URL = isDev
  ? API_SERVER_URL || process.env.SERVER_API_URL || 'https://three-head-dragon.shop'
  : API_SERVER_URL || RESULT_URL2?.split('/payment-success')[0] || process.env.SERVER_API_URL || 'https://three-head-dragon.shop'

export const UNIFIED_RESULT_URL = `${BASE_PAYMENT_URL}/payment-success`
```

**Добавить вместо них**:
```typescript
// ✅ НОВОЕ:
export const API_SERVER_URL = process.env.API_SERVER_URL || 'https://three-head-dragon.shop'
export const LOCAL_SERVER_URL = process.env.LOCAL_SERVER_URL

export const API_URL = isDev && LOCAL_SERVER_URL
  ? LOCAL_SERVER_URL
  : API_SERVER_URL

export const PAYMENT_CALLBACK_URL = `${API_URL}/payment-success`
```

### 2. Заменить использования в коде

```bash
# Команда для массовой замены:
find src -type f -name "*.ts" -exec sed -i '' '
  s/SERVER_API_URL/API_SERVER_URL/g;
  s/AI_SERVER_LOCAL_URL/LOCAL_SERVER_URL/g;
  s/BASE_PAYMENT_URL/API_URL/g;
  s/UNIFIED_RESULT_URL/PAYMENT_CALLBACK_URL/g;
' {} +
```

### 3. Файлы требующие ручной проверки

| Файл | Что проверить | Действие |
|------|---------------|----------|
| `src/services/generateNeuroImage.ts` | Использует `process.env.SERVER_API_URL` | Заменить на `API_URL` |
| `src/core/elevenlabs/createVoiceElevenLabs.ts` | `AI_SERVER_URL = process.env.API_SERVER_URL \\|\\| 'https://three-head-dragon.shop'` | Заменить на импорт `API_URL` |
| `src/menu/miniAppButton.ts` | `https://miniapp-production-44c4.up.render-server (local)` | Проверить актуальность URL |
| `src/core/foundation/ConfigManager.ts` | Проверка `API_SERVER_URL` и `LOCAL_SERVER_URL` | Оставить как есть |

---

## 🗑️ Удаление старых Render Server URL

### Команда для замены во всех файлах:

```bash
# В src/ директории
find src -type f \( -name "*.ts" -o -name "*.js" \) -exec sed -i '' 's|https://ai-server-production-production-8e2d.up.render-server (local)|https://three-head-dragon.shop|g' {} +

# В тестах
find tests -type f \( -name "*.ts" -o -name "*.js" \) -exec sed -i '' 's|https://ai-server-production-production-8e2d.up.render-server (local)|https://three-head-dragon.shop|g' {} +

# В документации
find docs -type f -name "*.md" -exec sed -i '' 's|https://ai-server-production-production-8e2d.up.render-server (local)|https://three-head-dragon.shop|g' {} +

# В worktrees
find worktrees -type f \( -name "*.ts" -o -name "*.js" \) -exec sed -i '' 's|https://ai-server-production-production-8e2d.up.render-server (local)|https://three-head-dragon.shop|g' {} +
```

### Production сервер (.env):

```bash
# Уже обновлено ✅
ssh root@212.86.115.30
cd /root/bot-farm
# BFL_WEBHOOK_URL теперь указывает на three-head-dragon.shop
```

---

## 📊 Итоговая таблица URL

### Было (хаос):

| Переменная | Значение | Проблема |
|-----------|----------|----------|
| API_SERVER_URL | three-head-dragon.shop | ✅ OK |
| SERVER_API_URL | three-head-dragon.shop | ❌ Дубликат |
| LOCAL_SERVER_URL | localhost:2999 | ⚠️ Смешан с другими |
| AI_SERVER_LOCAL_URL | localhost:2999 | ❌ Дубликат |
| USE_PRODUCTION_API | true/false | ❌ Лишний флаг |
| BASE_PAYMENT_URL | вычисляется | ❌ Сложная логика |

### Стало (порядок):

| Переменная | Значение | Использование |
|-----------|----------|---------------|
| API_SERVER_URL | three-head-dragon.shop | Production API |
| LOCAL_SERVER_URL | localhost:3001 (optional) | Dev только |
| API_URL | вычисляется автоматически | Везде в коде |
| PAYMENT_CALLBACK_URL | `${API_URL}/payment-success` | Платежи |

---

## 🎯 Результат систематизации

### Было:
- ❌ 7 переменных для одного сервера
- ❌ Дублирующаяся логика
- ❌ Устаревшие Render Server URL
- ❌ Сложная логика переключения

### Стало:
- ✅ 2 переменных (API_SERVER_URL + LOCAL_SERVER_URL)
- ✅ 1 вычисляемая переменная (API_URL)
- ✅ Все URL обновлены на актуальные
- ✅ Простая и понятная логика

### Преимущества:
1. **Простота**: Одна переменная для production, одна для dev
2. **Чистота**: Нет дублирования кода
3. **Понятность**: Логика переключения на 3 строки
4. **Масштабируемость**: Легко добавить новые окружения
5. **Документированность**: Все URL в одном месте

---

## 🔧 Команды для применения

### 1. Обновить src/config/index.ts:

```bash
# Сделаю это вручную через Edit tool
```

### 2. Заменить устаревшие Render Server URL:

```bash
cd /Users/playra/999-agents-telegraf

# Заменить в исходниках
find src -type f \( -name "*.ts" -o -name "*.js" \) -exec sed -i '' 's|https://ai-server-production-production-8e2d.up.render-server (local)|https://three-head-dragon.shop|g' {} +

# Заменить в тестах
find tests -type f \( -name "*.ts" -o -name "*.js" \) -exec sed -i '' 's|https://ai-server-production-production-8e2d.up.render-server (local)|https://three-head-dragon.shop|g' {} +

# Заменить в документации
find docs -type f -name "*.md" -exec sed -i '' 's|https://ai-server-production-production-8e2d.up.render-server (local)|https://three-head-dragon.shop|g' {} +
```

### 3. Обновить Infisical:

```
1. Открыть https://app.infisical.com
2. Выбрать проект VIBEE
3. Dev environment:
   - API_SERVER_URL = https://three-head-dragon.shop
   - LOCAL_SERVER_URL = http://localhost:3001
4. Staging/Prod environments:
   - API_SERVER_URL = https://three-head-dragon.shop
   - Удалить SERVER_API_URL, AI_SERVER_LOCAL_URL
```

---

## ⚠️ Важно: Проверка after миграции

### 1. Проверить доступность сервера:

```bash
curl https://three-head-dragon.shop/health
```

**Текущий статус**: ❌ Connection refused на порту 443
**Действие**: Нужно настроить Nginx + SSL (см. WEBHOOK_PORT_REPORT.md)

### 2. Временное решение до настройки SSL:

```bash
# В Infisical для всех окружений:
API_SERVER_URL=http://212.86.115.30:2999
```

### 3. Долгосрочное решение:

1. Настроить Nginx reverse proxy
2. Получить SSL сертификат для three-head-dragon.shop
3. Обновить API_SERVER_URL на https://three-head-dragon.shop

---

## 📝 Checklist выполнения

- [ ] Обновить `src/config/index.ts` (упростить логику)
- [ ] Заменить Render Server URL на three-head-dragon.shop во всех файлах
- [ ] Обновить переменные в Infisical (dev/staging/prod)
- [ ] Удалить неиспользуемые переменные из .env
- [ ] Протестировать API запросы
- [ ] Проверить платежную систему (Robokassa)
- [ ] Обновить документацию
- [ ] Настроить Nginx + SSL (долгосрочно)

---

**Дата**: 2025-11-09
**Автор**: Claude Code
**Версия**: 1.0
**Статус**: Готов к применению
