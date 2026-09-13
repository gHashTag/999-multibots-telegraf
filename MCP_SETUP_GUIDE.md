# 🔌 Inngest MCP Setup Guide

## ✅ Текущий Статус

- ✅ Inngest Dev Server запущен на http://127.0.0.1:8288
- ✅ Тестовое приложение запущено на http://localhost:3000
- ✅ 3 функции зарегистрированы:
  - testSimpleFunction
  - testSimpleMessageFunction
  - testAdvancedLoopFunction
- ✅ Приложение синхронизировано с dev server

## 📋 Подключение MCP к Claude Code

### Вариант 1: HTTP Transport (Рекомендуется)

```bash
# Добавить MCP сервер через HTTP
claude mcp add --transport http inngest-dev http://127.0.0.1:8288/mcp
```

**Примечание**: Этот endpoint может быть недоступен, так как стандартный Inngest dev server не предоставляет MCP endpoint.

### Вариант 2: Stdio Transport (Работает всегда)

```bash
# Добавить локальный MCP сервер
cd /Users/playra/999-agents-telegraf/worktrees/reels-callback-2
claude mcp add inngest-mcp "bun run src/inngest_app/mcp-server.ts"
```

### Вариант 3: Через конфигурацию Claude Code

Добавить в `~/.config/claude-code/mcp.json`:

```json
{
  "mcpServers": {
    "inngest-mcp": {
      "command": "bun",
      "args": [
        "run",
        "/Users/playra/999-agents-telegraf/worktrees/reels-callback-2/src/inngest_app/mcp-server.ts"
      ],
      "env": {
        "INNGEST_DEV_URL": "http://127.0.0.1:8288"
      }
    }
  }
}
```

## 🧪 Тестирование MCP

### 1. Проверка Доступности

```bash
# Проверить что dev server работает
curl http://127.0.0.1:8288/health

# Проверить что приложение работает
curl http://localhost:3000/health

# Отправить тестовое событие
curl -X POST http://127.0.0.1:8288/e/local \
  -H "Content-Type: application/json" \
  -d '{
    "name": "test/simple",
    "data": {"message": "Test from curl"},
    "ts": '$(date +%s000)'
  }'
```

### 2. Тестирование через скрипт

```bash
npm run test:mcp
```

### 3. Тестирование через vitest

```bash
npm run test:inngest:mcp
```

## 🎯 Доступные MCP Tools

После подключения MCP к Claude Code, будут доступны следующие инструменты:

### 1. send_event

Отправка события для триггера функций

**Пример:**

```typescript
{
  "name": "test/simple",
  "data": {
    "message": "Hello from MCP",
    "userId": "test-123"
  }
}
```

### 2. list_functions

Получение списка зарегистрированных функций

### 3. invoke_function

Прямой вызов функции

**Пример:**

```typescript
{
  "function_id": "testSimpleFunction",
  "data": {
    "message": "Direct invocation"
  }
}
```

### 4. get_run_status

Проверка статуса выполнения функции

**Пример:**

```typescript
{
  "run_id": "01K977BKJEP571GQZ8PBX78QE4"
}
```

### 5. poll_run_status

Polling статуса до завершения

**Пример:**

```typescript
{
  "run_id": "01K977BKJEP571GQZ8PBX78QE4",
  "timeout": 30000
}
```

## 🌐 Dashboard

Откройте в браузере: **http://127.0.0.1:8288**

Здесь вы увидите:

- Список зарегистрированных приложений
- Список функций
- История запусков
- Логи в реальном времени
- События

## 🔧 Troubleshooting

### Проблема: Dev server не запускается

```bash
# Убить процесс на порту 8288
lsof -ti:8288 | xargs kill -9

# Перезапустить
npx inngest-cli@latest dev
```

### Проблема: Приложение не синхронизируется

```bash
# Проверить что приложение доступно
curl http://localhost:3000/api/inngest

# Перезапустить приложение
pkill -f "tsx.*test-app"
npx tsx src/inngest_app/test-app.ts &
```

### Проблема: Функции не видны в dashboard

1. Откройте http://127.0.0.1:8288
2. Перейдите в раздел "Apps"
3. Нажмите "+ Sync new app"
4. Введите `http://localhost:3000/api/inngest`
5. Нажмите "Sync"

### Проблема: MCP не подключается

```bash
# Проверить что MCP сервер запускается
bun run src/inngest_app/mcp-server.ts

# Должны увидеть:
# Inngest MCP Server started
```

## 📊 Текущие Сервисы

| Сервис             | URL                               | Статус             |
| ------------------ | --------------------------------- | ------------------ |
| Inngest Dev Server | http://127.0.0.1:8288             | ✅ Running         |
| Inngest Dashboard  | http://127.0.0.1:8288             | ✅ Available       |
| Test App           | http://localhost:3000             | ✅ Running         |
| Test App Health    | http://localhost:3000/health      | ✅ OK              |
| Inngest Endpoint   | http://localhost:3000/api/inngest | ✅ Registered      |
| MCP Server         | stdio                             | ⚠️ Not running yet |

## 🚀 Следующие Шаги

1. ✅ Dev server запущен
2. ✅ Приложение запущено и синхронизировано
3. ✅ Функции зарегистрированы
4. ⏳ Подключить MCP к Claude Code
5. ⏳ Протестировать вызовы через MCP tools

## 📝 Команды для Запуска

```bash
# Terminal 1: Inngest Dev Server
npx inngest-cli@latest dev

# Terminal 2: Test App
npx tsx src/inngest_app/test-app.ts

# Terminal 3: MCP Server (опционально)
bun run src/inngest_app/mcp-server.ts
```

---

**Готово к использованию!** 🎉

Теперь вы можете использовать MCP для тестирования Inngest функций через Claude Code.

## Inngest на Railway (production dev-server) — MCP по HTTP

Сервер `inngest/inngest` из проекта Railway отдаёт MCP прямо по HTTP, без локального `mcp-server.ts`:

```bash
claude mcp add --transport http inngest-dev https://inngestinngest-production-c468.up.railway.app/mcp
```

То же самое лежит в `.mcp.json` в корне репозитория — Claude Code подхватывает его сам. Инструменты: `get_apps`, `list_functions`, `list_function_runs`, `get_run_trace`, `invoke_function`, `rerun`, `cancel_run`, `grep_docs`.

[измерено 2026-09-13] `initialize`, `tools/list`, `grep_docs`/`read_doc` отвечают без ключа. Но все data-инструменты (`get_apps`, `list_runs`, `get_run_trace`, `invoke_function`, …) отвечают `REST API v2 returned HTTP 401: Authentication failed` — **и заголовок `Authorization` на стороне клиента не помогает**. Причина в самом сервере: MCP-обработчик собирает внутренний запрос к REST API v2 без заголовка авторизации (`pkg/api/v2/apiv2mcp/tools.go` → `Request`, `pkg/devserver/mcp.go` → `executeV2`), а REST v2 при заданном `INNGEST_SIGNING_KEY` закрыт `SigningKeyMiddleware`. Проверено: тот же ключ напрямую в `GET /api/v2/apps` с `Authorization: Bearer <INNGEST_SIGNING_KEY>` → 200, через `/mcp` → 401.

#### `inngest-prod` — рабочий обход: REST v2 → MCP прокси

`src/inngest_app/mcp-rest-proxy.ts` — stdio MCP-сервер, который берёт тот же каталог инструментов с `${INNGEST_BASE_URL}/api/v2/operations` (открыт, 13 операций) и выполняет каждый вызов в REST API v2 с `Authorization: Bearer $INNGEST_SIGNING_KEY`. Без ключа не стартует (fail-closed). Записан в `.mcp.json` как `inngest-prod`; ключ подставляется из переменной окружения вашей оболочки — в репозитории его нет:

```bash
# ключ — INNGEST_SIGNING_KEY сервиса inngest/inngest на Railway (Variables), тот же, что у бота
export INNGEST_SIGNING_KEY=…
claude   # .mcp.json подхватится сам; либо вручную:
claude mcp add inngest-prod -e INNGEST_SIGNING_KEY=$INNGEST_SIGNING_KEY -- npx tsx src/inngest_app/mcp-rest-proxy.ts
```

Проверка: `get_apps` → `telegram-bot-client`, 55 функций; `list_function_runs appId=telegram-bot-client functionId=crm-proactive-sweep`.

Идентификаторы в REST v2 — camelCase (`runId`, `appId`, `functionId`), путь `{run_id}` подставляется из них; для GET остальные аргументы уходят в query, для POST — в JSON-тело (как в upstream `apiv2mcp.Request`). Тесты: `src/__tests__/inngest/mcpRestProxy.test.ts`.

`inngest-dev` (http) оставлен ради встроенной документации (`grep_docs`, `list_docs`, `read_doc`) и совместимых инструментов `send_event`/`get_run_status`. Как только upstream начнёт прокидывать `Authorization` в `executeV2`, прокси станет лишним.

### Обход продавца (CRM) — теперь функция `crm-proactive-sweep`

С 2026-09-12 тридцатиминутный обход продавца — cron-функция Inngest `telegram-bot-client-crm-proactive-sweep` (`src/inngest_app/functions/crm/crmProactiveSweep.ts`), а не `setInterval` в процессе бота. Каждый обход — отдельный run с трассой:

```
list_function_runs  function_id=telegram-bot-client-crm-proactive-sweep
get_run_trace       run_id=<id>          # шаг "sweep": did=card|idle|held|busy|failed|paused, ms, owner
invoke_function     ... crm-proactive-sweep   # внеочередной обход (или /sweep в боте)
```

Переключатель: `CRM_SWEEP_DRIVER=inngest` (по умолчанию) | `timer` (старый интервал); `CRM_PROACTIVE_MINUTES=0` выключает оба.
