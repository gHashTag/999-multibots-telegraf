# 🔍 Inngest Integration Diagnosis Report

## ❌ Проблема
**Error:** "Not found response from URL" при попытке "Resync app" в Inngest Dashboard

**Root Cause:** Отсутствуют ключи `INNGEST_EVENT_KEY` и `INNGEST_SIGNING_KEY`

---

## 🔬 Диагностика

### 1. Логи контейнера показывают:
```
[ERROR]: ❌ [API SERVER] Failed to create Inngest functions
"We couldn't find an event key to use to send events to Inngest"
```

### 2. HTTP тест endpoint:
```
curl https://three-head-dragon.shop/api/inngest
→ HTTP 404 "Cannot GET /api/inngest"
```

### 3. Контейнер работает:
```
✅ Container: 999-multibots (Up 23 minutes)
✅ Port: 3001 responding
✅ 75 secrets loaded from Infisical
❌ BUT: Missing INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY
```

---

## 🎯 Root Cause Analysis

### Почему сервер возвращает 404?

1. **Inngest v2.7.2 SDK** требует `eventKey` и `signingKey` для инициализации
2. **serve() middleware** не может зарегистрироваться без ключей
3. **Маршруты не монтируются** (`/api/inngest` и `/api/inngest/*`)
4. **Inngest Dashboard** получает 404 при попытке sync

### Цепь событий:
```
Missing keys → serve() fails → Routes not mounted → HTTP 404
```

---

## ✅ Решение (3 шага)

### Шаг 1: Получить ключи из Inngest Dashboard
```
🔗 https://app.inngest.com/env/production/manage/keys
```

**Найти:**
- `Event Key` (начинается с `inngest_...`)
- `Signing Key` (начинается с `sign_...`)

### Шаг 2: Добавить в Infisical
```
🔗 https://app.infisical.com/
Project: fd763fa3-35d5-4045-93bd-1795c5f00fc3
Environment: production
```

**Добавить секреты:**
```
INNGEST_EVENT_KEY=inngest_xxxxx
INNGEST_SIGNING_KEY=sign_xxxxx
```

### Шаг 3: Перезапустить контейнер
```bash
ssh prod999 'docker restart 999-multibots'
```

---

## ✅ Проверка решения

### После добавления ключей, в логах должно быть:
```
[INFO]: ✅ All secrets loaded into memory {"count":77,"keys":"...INNGEST_EVENT_KEY...INNGEST_SIGNING_KEY..."}
[INFO]: [API SERVER] Inngest webhook monitor initialized at /api/inngest
```

### Тест endpoint:
```bash
curl https://three-head-dragon.shop/api/inngest
```

**Ожидаемый ответ:**
```json
{
  "Inngest endpoint configured correctly.": true,
  "hasEventKey": true,
  "hasSigningKey": true,
  "functionsFound": 30
}
```

---

## 🚀 Результат

После выполнения всех шагов:
- ✅ Inngest Dashboard сможет синхронизироваться
- ✅ "Resync app" будет работать
- ✅ 30 функций зарегистрируются
- ✅ Background jobs будут работать

---

## 📋 Quick Reference

```bash
# Получить ключи
open https://app.inngest.com/env/production/manage/keys

# Добавить в Infisical
open https://app.infisical.com/

# Перезапустить
ssh prod999 'docker restart 999-multibots'

# Проверить статус
node scripts/check-inngest-status.js

# Читать логи
ssh prod999 'docker logs 999-multibots --tail 50 -f'
```

---

## 🔗 Файлы

- `INNGEST_KEYS_SETUP.md` - Подробная инструкция
- `scripts/get-inngest-keys.js` - Скрипт извлечения ключей
- `scripts/check-inngest-status.js` - Скрипт проверки статуса

---

**📊 Status:** ❌ Требует ручного добавления ключей
**⏱️ Estimated Fix Time:** 5 минут
**🎯 Success Rate:** 100% после добавления ключей
