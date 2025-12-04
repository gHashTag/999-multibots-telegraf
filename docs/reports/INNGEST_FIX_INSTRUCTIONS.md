# 🔧 ИНСТРУКЦИЯ: Исправление "404 Event key not found"

## ✅ ЧТО ИСПРАВЛЕНО

### 1. Возвращена рабочая конфигурация в `src/inngest_app/client.ts`:
- ✅ Немедленная инициализация Inngest клиента (как в рабочей версии)
- ✅ Использование переменных `BOT_INNGEST_*` (как в рабочей версии)
- ✅ Self-hosted endpoint: `https://three-head-dragon.shop/api/inngest`
- ✅ Добавлена функция `sendInngestEventWithLogs` для детального логирования

### 2. Код успешно собран и задеплоен:
```
Container: 8c2a2844ebaf ✅
Health check: PASSED ✅
Webhook verification: PASSED ✅
URL: http://188.137.250.69:3001
```

## 🔑 ЧТО НУЖНО СДЕЛАТЬ (КРИТИЧНО!)

### Шаг 1: Обновить ключи в Infisical Dashboard

Откройте https://app.infisical.com/ и обновите следующие секреты:

**Секрет 1:**
- **Key**: `BOT_INNGEST_EVENT_KEY`
- **Value**: `DDRreS100AKTh7OAQNLHm7L7dHyMHTAhocQzHGYR6TfvEuHExLc-QYWj_ROzM0ZImzzFT9CskrsDHr7FB8-yPw`
- **Comment**: "Event key for Inngest (new)"

**Секрет 2:**
- **Key**: `BOT_INNGEST_SIGNING_KEY`
- **Value**: `signkey-test-c4167464e900701832920c98bb2ec6e6e3c59fd2b27c62e1f4140dada01e4597`
- **Comment**: "Signing key for Inngest"

### Шаг 2: Зарегистрировать event key в Inngest Dashboard

1. Откройте: https://app.inngest.com/
2. Найдите проект: `three-head-dragon.shop` или `Vibee`
3. Зарегистрируйте новый event key: `DDRreS100AKTh7OAQ...`
   - Если ключ уже зарегистрирован - пропустите этот шаг

### Шаг 3: Перезапустить контейнер

После обновления секретов в Infisical выполните:

```bash
# Перезапуск контейнера
ssh prod999 "docker restart 999-multibots"

# Проверка логов
ssh prod999 "docker logs 999-multibots --tail 100 -f"
```

### Шаг 4: Проверить работу

Ожидаемый лог при инициализации:
```
🔥 [INNGEST CLIENT] Единственный источник правды инициализирован:
{
  name: 'Vibee',
  baseUrl: 'https://three-head-dragon.shop/api/inngest',
  isDev: false,
  hasEventKey: true,
  hasSigningKey: true,
  environment: 'production'
}
```

При отправке события:
```
📤 [INNGEST EVENT] Отправляем событие...
Event Name:   model/training.start
✅ [INNGEST EVENT] Событие отправлено успешно!
```

## 🔍 АЛЬТЕРНАТИВНЫЙ СПОСОБ: Автоматическое обновление

Если у вас есть доступ к Infisical API, можно использовать скрипт:

```bash
node update-bot-inngest-keys.js
```

Этот скрипт автоматически:
1. Получит токен авторизации
2. Обновит `BOT_INNGEST_EVENT_KEY` и `BOT_INNGEST_SIGNING_KEY`
3. Выдаст инструкцию по перезапуску контейнера

## ❗ ВАЖНО

- Ключи в Infisical должны иметь ПРЕФИКС `BOT_INNGEST_*`, а НЕ `INNGEST_*`
- После обновления секретов в Infisical КОНТЕЙНЕР АВТОМАТИЧЕСКИ ПЕРЕЗАГРУЗИТСЯ через 5-10 минут (через систему Infisical Agent)
- Если хотите ускорить - перезапустите контейнер вручную через SSH

## 🎯 РЕЗУЛЬТАТ

После выполнения всех шагов:
- ✅ Inngest клиент будет инициализироваться с правильными ключами
- ✅ События будут отправляться без ошибки "404 Event key not found"
- ✅ uploadTrainFluxModelScene будет работать корректно

---
**Дата**: 2025-12-02
**Статус**: Ожидает обновления ключей в Infisical
