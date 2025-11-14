# ⚠️ Отчёт: Конфликт портов - порт 3000 занят

**Дата**: 2025-11-09
**Проект**: VIBEE - AI-Powered Telegram Bot Platform

---

## 🔴 Проблема

При запуске приложения VIBEE обнаружен конфликт портов:

```
🔌 [PORTS] Проверка доступных портов...
   ✅ Порт 80: доступен
   ✅ Порт 443: доступен
   ⚠️  Порт 3000: занят (используется другим процессом)
   ✅ Порт 8080: доступен
```

---

## 🔍 Анализ проблемы

### Процесс, занимающий порт 3000:

```bash
$ lsof -i :3000 -P -n

COMMAND   PID    USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node      13994  playra 19u  IPv6 0x940d29572e80316a      0t0  TCP *:3000 (LISTEN)
```

### Детали процесса:

```bash
$ ps aux | grep 13994

playra  13994  0.0  0.2  443835136  31280  s060  S  5:40PM  1:39.93  node (npx remotion studio)
```

### Что работает на порту 3000:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <title>Remotion Studio</title>
  </head>
  <body>
    <script>window.remotion_projectName = "bible_vibecoder";</script>
    <script>window.remotion_cwd = "/Users/playra/bible_vibecoder";</script>
    <script>window.remotion_studioServerCommand = "npx remotion studio";</script>
```

**Вывод**: Порт 3000 занят **Remotion Studio** (видео-редактор для проекта `bible_vibecoder`)

---

## 📊 Все активные процессы

### VIBEE Bot процессы:

```bash
PID     COMMAND                    STATUS
84452   bun --watch src/index.ts   ✅ Работает (наш бот)
84428   bun dev                    ✅ Работает
```

### Конфликтующие процессы:

```bash
PID     COMMAND                      PROJECT             PORT
13994   npx remotion studio          bible_vibecoder     3000 ❌
5598    npx remotion studio          (другой инстанс)    ?
```

---

## ⚡ Решения

### Вариант 1: Изменить порт API сервера VIBEE (рекомендуется)

**Преимущества**:
- Не нужно закрывать Remotion Studio
- Можно работать с обоими проектами одновременно
- Быстрое решение

**Реализация**:

1. Обновить конфигурацию порта в `src/api_server/index.ts`:

```typescript
// БЫЛО:
const PORT = process.env.API_PORT || 3000

// СТАЛО:
const PORT = process.env.API_PORT || 3001  // или 8080, 8000, 4000
```

2. Добавить в `.env`:

```bash
API_PORT=3001
```

3. Добавить в Infisical (dev environment):

```bash
API_PORT=3001
```

4. Обновить документацию и клиенты:

```bash
# Старый URL
http://localhost:3000/webhook

# Новый URL
http://localhost:3001/webhook
```

---

### Вариант 2: Закрыть Remotion Studio

**Преимущества**:
- Освободить порт 3000
- Уменьшить нагрузку на систему

**Реализация**:

```bash
# Найти и убить процесс
kill 13994
kill 5598

# Или убить все Remotion Studio процессы
pkill -f "remotion studio"
```

**Недостатки**:
- Придётся перезапускать при работе с bible_vibecoder
- Неудобно при одновременной работе с двумя проектами

---

### Вариант 3: Настроить динамический выбор порта

**Преимущества**:
- Автоматически находит свободный порт
- Нет конфликтов
- Гибкость

**Реализация**:

```typescript
// src/api_server/index.ts

import { createServer } from 'net'

async function findAvailablePort(startPort: number): Promise<number> {
  let port = startPort

  while (port < startPort + 100) {
    const isAvailable = await new Promise<boolean>((resolve) => {
      const server = createServer()
      server.once('error', () => resolve(false))
      server.once('listening', () => {
        server.close()
        resolve(true)
      })
      server.listen(port, '0.0.0.0')
    })

    if (isAvailable) {
      return port
    }

    port++
  }

  throw new Error(`No available ports found in range ${startPort}-${startPort + 100}`)
}

// Использование
const preferredPort = parseInt(process.env.API_PORT || '3000', 10)
const PORT = await findAvailablePort(preferredPort)

console.log(`🚀 API сервер запущен на порту: ${PORT}`)
if (PORT !== preferredPort) {
  console.log(`   ℹ️  Порт ${preferredPort} был занят, использован альтернативный порт ${PORT}`)
}
```

---

### Вариант 4: Использовать разные порты для разных окружений

**Конфигурация**:

```bash
# .env (локальная разработка)
API_PORT=3001

# Infisical dev
API_PORT=3001

# Infisical staging
API_PORT=3000

# Infisical prod
API_PORT=2999  # уже используется в production
```

**Преимущества**:
- Чёткое разделение окружений
- Нет конфликтов
- Легко документировать

---

## 🎯 Рекомендуемое решение

### Краткосрочно (прямо сейчас):

**Используйте Вариант 1 + Вариант 4**:

1. Изменить порт API сервера на **3001** для dev окружения
2. Обновить конфигурацию в Infisical
3. Оставить Remotion Studio работающим

```bash
# Шаги:
# 1. Обновить src/api_server/index.ts (порт 3001)
# 2. Добавить API_PORT=3001 в Infisical dev
# 3. Перезапустить бот
```

### Долгосрочно (для production):

**Используйте Вариант 3**:

1. Реализовать автоматический поиск свободного порта
2. Логировать финальный порт при старте
3. Добавить проверку доступности порта в health check

---

## 📋 Текущая конфигурация портов

### Dev окружение (localhost):

| Сервис              | Порт  | Статус | Процесс                |
|---------------------|-------|--------|------------------------|
| Remotion Studio     | 3000  | ✅ Занят | npx remotion studio   |
| VIBEE API Server    | 3001  | ⚠️ Нужно настроить | bun src/index.ts |
| VIBEE Telegram Bots | N/A   | ✅ Polling | bun src/index.ts    |

### Production окружение (212.86.115.30):

| Сервис              | Порт  | Статус | Процесс                |
|---------------------|-------|--------|------------------------|
| VIBEE API Server    | 2999  | ✅ Работает | node src/index.ts  |
| VIBEE Telegram Bots | N/A   | ✅ Polling | node src/index.ts   |
| Nginx (планируется) | 80    | ⚠️ Не настроен | -             |

---

## 🔧 Реализация рекомендуемого решения

### Шаг 1: Обновить код

Откройте файл `src/api_server/index.ts`:

```typescript
// Найти:
const PORT = process.env.API_PORT || 3000

// Заменить на:
const PORT = process.env.API_PORT
  ? parseInt(process.env.API_PORT, 10)
  : 3001  // 3001 вместо 3000 для dev окружения
```

### Шаг 2: Обновить Infisical

```bash
# В Infisical dev environment добавить:
API_PORT=3001
```

### Шаг 3: Перезапустить бот

```bash
# Остановить текущий процесс
killall -9 bun node

# Запустить снова
bun --watch src/index.ts
```

### Шаг 4: Проверить

```bash
# Должно показать:
🔌 [PORTS] Проверка доступных портов...
   ✅ Порт 80: доступен
   ✅ Порт 443: доступен
   ⚠️  Порт 3000: занят (используется другим процессом)
   ✅ Порт 8080: доступен

[API] Server started on port 3001 (listening on 0.0.0.0)  ← НОВЫЙ ПОРТ!
```

### Шаг 5: Обновить документацию

Обновить все ссылки на API:
- Webhook URL: `http://localhost:3001/webhook`
- Health check: `http://localhost:3001/health`
- Docs: обновить README.md

---

## ✅ Проверка после внедрения

```bash
# 1. Проверить доступность нового порта
curl http://localhost:3001/health

# 2. Проверить что оба сервиса работают
curl http://localhost:3000  # Remotion Studio
curl http://localhost:3001  # VIBEE API

# 3. Проверить логи
tail -f /tmp/bot-webhook-test.log | grep PORT
```

Ожидаемый результат:
```
🔌 [PORTS] Проверка доступных портов...
   ⚠️  Порт 3000: занят (используется другим процессом)
   ✅ Порт 3001: доступен
[API] Server started on port 3001 (listening on 0.0.0.0)
```

---

## 📊 Сравнение вариантов

| Критерий                  | Вариант 1 (Новый порт) | Вариант 2 (Kill Remotion) | Вариант 3 (Авто-поиск) |
|---------------------------|------------------------|---------------------------|------------------------|
| Скорость внедрения        | ⚡ 5 минут             | ⚡ 1 минута               | 🔧 30 минут           |
| Удобство разработки       | ✅ Отлично             | ❌ Плохо                  | ✅ Отлично            |
| Одновременная работа      | ✅ Да                  | ❌ Нет                    | ✅ Да                 |
| Конфликты в будущем       | ⚠️ Возможны            | ⚠️ Возможны               | ✅ Исключены          |
| Поддержка                 | ✅ Простая             | ✅ Простая                | ⚠️ Сложнее            |

**Рекомендация**: Начать с **Варианта 1** (быстро), затем мигрировать на **Вариант 3** (долгосрочно).

---

## 🎯 Итог

### Текущее состояние:
- ❌ Порт 3000 занят Remotion Studio
- ⚠️ API сервер не может запуститься на порту 3000
- ✅ Боты работают в polling режиме (не зависят от API порта)

### Рекомендуемые действия:
1. **Немедленно**: Изменить порт API на 3001
2. **В течение дня**: Добавить автоматический поиск свободного порта
3. **В течение недели**: Документировать конфигурацию портов для всех окружений

### Критичность:
- **Не блокирует работу**: Боты работают через polling
- **Средний приоритет**: API сервер нужен для webhooks
- **Простое решение**: 5 минут на исправление

---

**Дата**: 2025-11-09
**Автор**: Claude Code
**Версия**: 1.0
