# 🔧 ОБНОВЛЕНИЕ КЛЮЧЕЙ INNGEST - ПОШАГОВАЯ ИНСТРУКЦИЯ

## 🎯 ЗАДАЧА
Обновить переменные INNGEST в Infisical PRODUCTION environment с рабочими ключами.

---

## 📋 РАБОЧИЕ КЛЮЧИ (ПРОВЕРЕНЫ!)

```
INNGEST_EVENT_KEY=4JiBiCBZ8en7jNonnsAPXCFiLVkrt1uEXklGcDzaQ6SCBV9p7-UBlQlTrze-x_WPRTihikB_uhAGhbkwGhnu4Q

INNGEST_SIGNING_KEY=signkey-test-c4167464e900701832920c98bb2ec6e6e3c59fd2b27c62e1f4140dada01e4597
```

**✅ ТЕСТ ПРОЙДЕН:**
- Status: 200 OK
- Событие отправлено успешно
- ID: 01KBF77XG9V1CC3ZHWW3P0636Q

---

## 🚀 СПОСОБ 1: ЧЕРЕЗ DASHBOARD INFISICAL (РЕКОМЕНДУЕТСЯ)

### Шаг 1: Зайти в Infisical
- URL: https://app.infisical.com/
- Войти в аккаунт

### Шаг 2: Выбрать проект
- Найти проект `Vibee` (ID: fd763fa3-35d5-4045-93bd-1795c5f00fc3)

### Шаг 3: Переключиться на production environment
- Environment: **production** (НЕ development!)

### Шаг 4: Обновить/добавить секреты

**Секрет 1:**
- Name: `INNGEST_EVENT_KEY`
- Value: `4JiBiCBZ8en7jNonnsAPXCFiLVkrt1uEXklGcDzaQ6SCBV9p7-UBlQlTrze-x_WPRTihikB_uhAGhbkwGhnu4Q`
- Type: Shared
- Save

**Секрет 2:**
- Name: `INNGEST_SIGNING_KEY`
- Value: `signkey-test-c4167464e900701832920c98bb2ec6e6e3c59fd2b27c62e1f4140dada01e4597`
- Type: Shared
- Save

### Шаг 5: Сохранить изменения
- Нажать "Save Changes" или "Commit"

---

## 📊 СПОСОБ 2: ЧЕРЕЗ CLI INFISICAL

### Установка CLI
```bash
npm install -g @infisical/cli
```

### Логин
```bash
infisical login
```

### Обновление переменных
```bash
# Event Key
infisical secrets set --environment=production --projectName=Vibee INNGEST_EVENT_KEY=4JiBiCBZ8en7jNonnsAPXCFiLVkrt1uEXklGcDzaQ6SCBV9p7-UBlQlTrze-x_WPRTihikB_uhAGhbkwGhnu4Q

# Signing Key
infisical secrets set --environment=production --projectName=Vibee INNGEST_SIGNING_KEY=signkey-test-c4167464e900701832920c98bb2ec6e6e3c59fd2b27c62e1f4140dada01e4597
```

---

## ✅ ПОСЛЕ ОБНОВЛЕНИЯ

### 1. Подождать синхронизации
- Подождать 1-2 минуты для обновления кэша Infisical

### 2. Перезапустить контейнер
```bash
ssh root@188.137.250.69 "docker restart 999-multibots"
```

### 3. Проверить результат

**Через диагностический API:**
```bash
curl -s http://188.137.250.69:3001/api/diagnostic/template2 | jq '.envVars'
```

**Ожидаемый результат:**
```json
{
  "INNGEST_EVENT_KEY": true,
  "INNGEST_SIGNING_KEY": true,
  "INNGEST_EVENT_KEY_preview": "4JiBiCBZ8en7jNo...",
  "INNGEST_SIGNING_KEY_preview": "signkey-test-c4..."
}
```

### 4. Проверить логи
```bash
ssh root@188.137.250.69 "docker logs 999-multibots --tail 50 | grep -E 'INNGEST|Event sent'"
```

**✅ Успешные логи:**
```
✅ [INNGEST] Event sent successfully
✅ hasEventKey: true, hasSigningKey: true
```

**❌ Если ошибки остались:**
```
❌ 404 Event key not found
❌ Failed to send Inngest event
```

---

## 🔍 ДИАГНОСТИКА

### Текущее состояние (ДО обновления):
```json
{
  "INNGEST_EVENT_KEY": true,     // ✅ загружен
  "INNGEST_SIGNING_KEY": true,   // ✅ загружен
  "preview": "4JiBiCBZ8e..."     // ❌ старый ключ (не работает)
}
```

### Ожидаемое состояние (ПОСЛЕ обновления):
```json
{
  "INNGEST_EVENT_KEY": true,     // ✅ загружен
  "INNGEST_SIGNING_KEY": true,   // ✅ загружен
  "preview": "4JiBiCBZ8en7jNo..." // ✅ новый ключ (работает!)
}
```

---

## 🎉 РЕЗУЛЬТАТ

После обновления:
- ✅ uploadTrainFluxModelScene будет работать
- ✅ Обучение моделей будет запускаться
- ✅ Ошибки 404 исчезнут
- ✅ Логи покажут успешные события

---

## 📞 ПОДДЕРЖКА

Если что-то не получается:
1. Проверьте что environment = **production** (НЕ dev!)
2. Убедитесь что проект = **Vibee**
3. Подождите синхронизации Infisical (1-2 минуты)
4. Перезапустите контейнер

**Дата создания:** 2025-12-02 09:45
**Статус:** Ожидает обновления пользователем
