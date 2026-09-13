# Аудит логов Railway — 13.09.2026 (00:24–02:48 UTC)

Источник: `deploymentLogs` / `buildLogs` через Railway GraphQL из браузера владельца.
Сервисы: `999-multibots-telegraf` (бот), `vibee-render`, `inngest/inngest`.
Статус-теги: [измерено] — видно в логах или в коде; [решение] — что сделано; [вопрос] — не доказано.

## 1. Бот не деплоится: `Cannot find module 'exceljs'` [измерено]

Три последних деплоя бота (`ad8ab027` e1f87cd, `d3a2a45d` ab13b14, `bc1ae31c` e37f24b) — FAILED на healthcheck
(«1/1 replicas never became healthy!»). В рантайме: `Error: Cannot find module 'exceljs'` из `src/utils/excelCompat.ts`.
Причина: #2349 перенёс `xlsx → exceljs`, но пакет попал в `devDependencies`, а Dockerfile ставит `npm install --omit=dev`.
Прод бота — старый деплой `94c2fc7c` (ed3b49b, 11.09).

[решение] PR #2351: `exceljs` → `dependencies`, lock-файл, тест `runtime-deps-are-not-dev.test.ts`
(рантайм-файлы `src/` не импортируют пакеты только из devDependencies). Пока не смержен — ни один PR не доезжает до прода.

## 2. `vibee-render`: `Error: TIMEOUT` ×21/мин из gramjs [измерено]

257 строк за 12 минут из `telegram/client/updates.js:234/250`, часами после последнего вызова инструмента.
gramjs 2.26: `_updateLoop` крутится `while (!client._destroyed)`; `disconnect()` не ставит флаг → зомби-цикл
пингует мёртвый sender каждые 9 с, логирует и `reconnect()`-ит сокет. Один цикл на каждый вызов инструмента.

[решение] PR #2353: `src/agent/hang-up.ts` — `destroy()` вместо `disconnect()` во всех местах закрытия.
Проверка после деплоя: `deploymentLogs(filter:"TIMEOUT")` render должен опустеть за час.

## 3. Inngest-сервер: `rejecting event; event key not recognized` ×1836 за 2 ч 11 мин [измерено, причина — вопрос]

Ритм: ровно 11–12/мин весь интервал (≈ одно событие в 5 с) + пики +25 в :00/:30 (совпадают с cron-функциями
бота `health-check`, `stuck-check`) + пик 64/161 в 02:18–02:19 (совпадает с прогоном probe-suite бота).

Что проверено:

- Ключи бота и сервера совпадают: `INNGEST_EVENT_KEY` и `INNGEST_SIGNING_KEY` у `999-multibots-telegraf` и у
  `inngest/inngest` имеют одинаковые SHA-256 (сравнивались хэши, значения не выводились). Основной клиент бота
  (`src/inngest_app/client.ts`, `INNGEST_EVENT_KEY`) — не источник отказов.
- В HTTP-логах публичного домена Inngest запросов `/e/…` нет → отправитель ходит по приватной сети Railway
  (или логи edge не сохраняются).
- Прочих сервисов с переменными `INNGEST_*` в окружении нет (у всех только `RAILWAY_SERVICE_INNGEST_INNGEST_URL`).
- У бота есть второй ключ `RENDER_INNGEST_EVENT_KEY` (другой хэш, 86 символов, «для Inngest Cloud»), а также
  `BOT_INNGEST_BASE_URL`/`BOT_INNGEST_SIGNING_KEY` без `BOT_INNGEST_EVENT_KEY`; клиенты
  `generateAdvancedLoopingVideoFunction.ts` (`eventKey: BOT_INNGEST_EVENT_KEY` = undefined) и `inngest-provider.ts`
  берут ключи из этих переменных.

[вопрос] Кто шлёт ~12 событий/мин с чужим ключом. Кандидаты: (а) второй клиент внутри бота с
`RENDER_INNGEST_EVENT_KEY`/пустым ключом, направленный на `INNGEST_BASE_URL`; (б) внешний хост (локальная машина,
другой проект) с устаревшим ключом. Совпадение пиков с cron-ами и probe-suite бота — довод в пользу (а).

Следующий шаг [решение, не выполнено — требует изменения env]: на сервисе `inngest/inngest` выставить
`INNGEST_LOG_LEVEL=debug` на 10 минут — сервер пишет префикс отклонённого ключа и remote addr; либо временно
добавить второй `--event-key` и смотреть, какие имена событий пойдут.

## 4. Бот 02:18–02:19 UTC: серия `NonRetriableError` [измерено — не баг]

«User 0 does not exist», «username: Required», «avatar_settings: Required», `ai-reels validate-input` —
в тех же секундах бот пишет `[INNGEST PROBE] … failed at its guard`. Это probe-suite (`/inngest_probe`, `e2e_test=true`),
ожидаемый исход `FAILED-at-guard` по манифесту. Действий не требует.

## 5. CRM-обход → Inngest [решение]

PR #2352: обход продавца — cron-функция `crm-proactive-sweep` (`*/30`, retries 0, concurrency 1) вместо
`setInterval`; каждый обход — run с трассой; `.mcp.json` с `inngest-dev`. MCP-сервер Inngest отвечает на
`initialize`/`tools/list` без ключа, но data-инструменты (`get_apps`) → `401 Authentication failed` [измерено] —
нужен ключ на стороне сервера [вопрос].

## Порядок мержа

1. #2351 (exceljs) — иначе ничего не деплоится. 2. #2352 (CRM на Inngest). 3. #2353 (render destroy).
   После каждого: `deployments(first:1)` → SUCCESS, `/health` → новая версия.
