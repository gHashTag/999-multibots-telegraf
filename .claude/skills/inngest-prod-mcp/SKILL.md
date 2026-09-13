---
name: 'Inngest prod MCP'
description: 'Как самому включить data-инструменты MCP self-hosted Inngest (get_apps, list_runs, get_run_trace, invoke_function, rerun, cancel_run) через прокси inngest-prod с INNGEST_SIGNING_KEY. Загружать при «REST API v2 returned HTTP 401» из inngest-dev, когда нужны runs/трассы/ручной запуск функций Inngest (обход продавца crm-proactive-sweep и др.), когда хочется сказать «MCP Inngest недоступен, нужен ключ от владельца». Не для написания самих Inngest-функций (см. inngest-expert).'
---

# Inngest prod MCP — включаешь сам, без владельца

## Правило

**«Data-инструменты Inngest дают 401, нужен ключ от владельца» — не причина ждать.**
Ключ уже есть у проекта (`INNGEST_SIGNING_KEY` — тот же, что у бота), а обход
лежит в репозитории. Включение — одна команда:

```bash
source scripts/inngest-mcp-enable.sh            # возьмёт ключ из env или ./.env, экспортирует
scripts/inngest-mcp-enable.sh --claude          # + зарегистрирует MCP-сервер inngest-prod в Claude Code
```

Скрипт **не печатает ключ** — только источник, длину и sha256[0:8]. Так же
поступай и ты: значение ключа не выводить, не коммитить, не вставлять в чат.

Проверка, что включилось: `get_apps` → `telegram-bot-client`, 55 функций
[измерено 2026-09-13]. Если ключа нигде нет — скрипт завершится с подсказкой
Только тогда — вопрос владельцу: он экспортирует ключ сам (Railway → сервис
`inngest/inngest` → Variables) или восстанавливает `.env` (см.
`restore-env-from-infisical`). Сам за ключом в Railway/CLI/API не ходи —
Railway трогает только владелец из своего браузера.

## Почему 401 и почему клиентский заголовок не помогает

[измерено по исходникам inngest/inngest] `/mcp` self-hosted сервера генерирует
data-инструменты из REST API v2, но собирает внутренний запрос **без**
`Authorization` (`pkg/api/v2/apiv2mcp/tools.go → Request`,
`pkg/devserver/mcp.go → executeV2`). При заданном `INNGEST_SIGNING_KEY` REST v2
закрыт `SigningKeyMiddleware` → 401 всегда, что бы ни прислал клиент. Тот же
ключ напрямую в `GET /api/v2/apps` → 200. Настройки на сервере, которая это
чинит, нет — только upstream-патч или прокси.

## Что такое `inngest-prod`

`src/inngest_app/mcp-rest-proxy.ts` — stdio MCP-сервер. Каталог инструментов
берёт с `${INNGEST_BASE_URL}/api/v2/operations` (открыт, 13 операций, те же имена
и схемы, что у upstream) и выполняет каждый вызов в REST v2 с
`Authorization: Bearer $INNGEST_SIGNING_KEY`. Без ключа не стартует
(fail-closed). Объявлен в `.mcp.json` (ключ из `${INNGEST_SIGNING_KEY}` оболочки),
запуск руками — `npm run inngest:mcp-proxy`. Тесты —
`src/__tests__/inngest/mcpRestProxy.test.ts`.

`inngest-dev` (http `/mcp`) оставлен ради `grep_docs` / `read_doc` /
`list_docs`; для данных используй `inngest-prod`.

## Инструменты и аргументы

Имена аргументов — camelCase, как в REST v2: `runId`, `appId`, `functionId`,
`eventId`. Путь `{run_id}` подставляется из `runId`; для GET остальные аргументы
уходят в query, для POST — в JSON-тело.

| Инструмент | Зачем |
|---|---|
| `get_apps`, `get_app` | что задеплоено (`telegram-bot-client`, sdk, число функций) |
| `list_functions`, `get_function` | слаги и триггеры (`telegram-bot-client-<id>`) |
| `list_runs`, `list_function_runs`, `get_event_runs` | последние запуски, статусы |
| `get_run`, `get_run_trace` | шаги, вывод, ошибка конкретного run |
| `invoke_function` | внеочередной запуск (обход продавца: `crm-proactive-sweep`) |
| `rerun`, `cancel_run` | повтор / остановка |
| `health` | жив ли сервер |

Пример — проверить обход продавца после деплоя:

```
list_function_runs  functionId=telegram-bot-client-crm-proactive-sweep
get_run_trace       runId=<последний>     # шаг "sweep": did=card|idle|held|busy|failed|paused
invoke_function     functionId=... crm-proactive-sweep   # внеочередной обход
```

## Где ключ у разных агентов

- **Процессы на Railway (бот, render, Queen внутри них)** — ключ уже в
  `process.env`; прокси стартует без подготовки: `npm run inngest:mcp-proxy`.
- **Claude Code / локальная копия** — `source scripts/inngest-mcp-enable.sh`
  (`.env` после `restore-env-from-infisical` содержит ключ).
- **Песочница без `.env`** — ключа нет и брать негде; не копируй его из
  браузера владельца в песочницу и не тяни через CLI/API Railway. Читай данные через владельца
  или проси один раз выполнить `export INNGEST_SIGNING_KEY=…`.

## Границы честности

- Прокси даёт те же данные, что и upstream MCP; он не «лучше» и исчезнет,
  когда upstream начнёт прокидывать `Authorization` в `executeV2`.
- `/v0/gql` сервера Inngest сейчас отвечает без авторизации [вопрос, не
  закрыто] — не полагайся на это как на «фичу» и не расширяй.
- Изменения переменных Railway — только с одобрения владельца.
