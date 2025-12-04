# 🚨 ОТЧЕТ: ИСПРАВЛЕНИЕ Inngest 404 Event Key Error (PRODUCTION)

## 📋 СВОДКА

**Дата**: 2025-12-02 14:01
**Критичность**: 🔥 ВЫСОКАЯ
**Статус**: ✅ ДИАГНОСТИКА ЗАВЕРШЕНА, ТРЕБУЕТСЯ РУЧНОЕ ИСПРАВЛЕНИЕ
**Сервис**: Production Telegram Bot (three-head-dragon.shop)
**Влияние**: Пользователи не могут обучать модели (функция обучения LoRA заблокирована)

---

## 🔍 ДИАГНОСТИКА ПРОБЛЕМЫ

### Симптомы
- **Ошибка**: `Inngest API Error: 404 Event key not found`
- **Контекст**: При попытке запуска обучения модели (uploadTrainFluxModelScene)
- **Пользователь**: ID 144022504 (neuro_sage, bot: neuro_blogger_bot)
- **Время**: 2025-12-02 06:57:57
- **Стадия**: После успешной загрузки ZIP с изображениями в Supabase

### Корневая причина
❌ **Отсутствуют критически важные переменные окружения в Production Infisical:**

```bash
BOT_INNGEST_EVENT_KEY        - НЕ УСТАНОВЛЕН
BOT_INNGEST_SIGNING_KEY      - НЕ УСТАНОВЛЕН
BOT_INNGEST_BASE_URL         - НЕ УСТАНОВЛЕН
```

### Код, требующий переменные
**Файл**: `src/inngest_app/client.ts:15-25`

```typescript
const config = {
  // Event key: приоритет тестовому ключу для тестового окружения
  eventKey: process.env.BOT_INNGEST_EVENT_KEY ||
            process.env.BOT_INNGEST_EVENT_KEY ||  // ← FALLBACK НА ТЕСТОВЫЙ КЛЮЧ
            '4JiBiCBZ8en7jNonnsAPXCFiLVkrt1uEXklGcDzaQ6SCBV9p7-UBlQlTrze-x_WPRTihikB_uhAGhbkwGhnu4Q',

  // Signing key: приоритет тестовому ключу
  signingKey: process.env.BOT_INNGEST_TEST_SIGNING_KEY ||
              process.env.BOT_INNGEST_SIGNING_KEY ||  // ← FALLBACK НА ТЕСТОВЫЙ КЛЮЧ
              'signkey-test-c4167464e900701832920c98bb2ec6e6e3c59fd2b27c62e1f4140dada01e4597',
}
```

**Проблема**: Код использует fallback на тестовые ключи в production, что приводит к ошибке 404.

---

## ✅ РЕШЕНИЕ

### Шаг 1: Добавить переменные в Infisical (Production Environment)

**Вариант A: CLI (рекомендуется)**

```bash
# Войти в Infisical
infisical login

# Добавить переменные
infisical secrets set --env=prod --projectId=fd763fa3-35d5-4045-93bd-1795c5f00fc3 \
  BOT_INNGEST_EVENT_KEY=akoHhkQS3NGSQhDzcosD7o-0dGSJ9PWLiGol-fi5QMnZOG5XpvuxGBlnh_an9VQ0ygwA4BZEa3lfjKlbgm3U2A

infisical secrets set --env=prod --projectId=fd763fa3-35d5-4045-93bd-1795c5f00fc3 \
  BOT_INNGEST_SIGNING_KEY=signkey-prod-e2c2d07a9d0306957816b187e3e4fcd617ee0435923a1b613563c4666c82c047

infisical secrets set --env=prod --projectId=fd763fa3-35d5-4045-93bd-1795c5f00fc3 \
  BOT_INNGEST_BASE_URL=https://three-head-dragon.shop/api/inngest
```

**Вариант B: Web Dashboard**

1. Перейти на https://app.infisical.com/
2. Открыть проект: `fd763fa3-35d5-4045-93bd-1795c5f00fc3`
3. Перейти в Environment: `Production`
4. Добавить переменные (см. выше)

### Шаг 2: Развернуть на production сервере

```bash
./deploy.sh production
```

### Шаг 3: Проверить исправление

```bash
# Проверить логи
ssh prod999 "docker logs 999-multibots --tail 50 | grep INNGEST"

# Ожидаемый результат:
# "🔥 [INNGEST CLIENT] Единственный источник правды инициализирован"
# с hasEventKey: true и hasSigningKey: true
```

---

## 📊 ОЖИДАЕМЫЕ РЕЗУЛЬТАТЫ ПОСЛЕ ИСПРАВЛЕНИЯ

### До исправления
```
❌ [ERROR]: Inngest API Error: 404 Event key not found
❌ Model training fails
❌ Users cannot upload training data
```

### После исправления
```
✅ [INNGEST CLIENT] Единственный источник правды инициализирован
✅ hasEventKey: true
✅ hasSigningKey: true
✅ Model training scene works
✅ Event sending to Inngest succeeds
```

---

## 🔧 ДОПОЛНИТЕЛЬНАЯ ИНФОРМАЦИЯ

### Источники данных
1. **Документация**: `docs/INNGEST_PRODUCTION_SECRETS.md`
2. **Production логи**: `/var/lib/docker/containers/*/logs` (999-multibots)
3. **Код конфигурации**: `src/inngest_app/client.ts`

### Связанные файлы
- `src/inngest_app/client.ts` - Клиент Inngest (конфигурация ключей)
- `src/inngest_app/send-event.ts` - Отправка событий
- `docs/INNGEST_PRODUCTION_SECRETS.md` - Документация по production secrets
- `scripts/fix-inngest-production-secrets.js` - Автоматизированный скрипт диагностики

### Техническая справка

**Event Key URL**: `https://inn.gs/e/{EVENT_KEY}`
- Используется для отправки событий в Inngest Cloud
- Должен соответствовать production проекту Inngest
- Тестовые ключи не работают с production API

**Signing Key**:
- Используется для подписи и верификации вебхуков
- Должен соответствовать production signing key
- Необходим для безопасной передачи данных

**Base URL**:
- Указывает на локальный Inngest endpoint (если используется self-hosted)
- Для cloud версии: `https://api.inngest.com`

---

## ⏭️ СЛЕДУЮЩИЕ ШАГИ

1. **ВЫПОЛНИТЬ**: Добавить переменные в Infisical (см. Шаг 1)
2. **ВЫПОЛНИТЬ**: Развернуть на production (Шаг 2)
3. **ПРОВЕРИТЬ**: Протестировать обучение модели (Шаг 3)
4. **ДОКУМЕНТИРОВАТЬ**: Обновить runbook для production deployment

---

## 📞 КОНТАКТЫ

**Проект**: 999-agents-telegraf
**Сервер**: 188.137.250.69
**Production бот**: three-head-dragon.shop
**Infisical проект**: fd763fa3-35d5-4045-93bd-1795c5f00fc3

---

**Статус**: ⏳ ОЖИДАЕТ РУЧНОГО ВМЕШАТЕЛЬСТВА
**Приоритет**: 🔥 КРИТИЧЕСКИЙ - БЛОКИРУЕТ ОСНОВНОЙ ФУНКЦИОНАЛ
