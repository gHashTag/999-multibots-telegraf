# Лучшие практики durable-функций для фоновых задач Telegram-бота с платными AI-генерациями

Контекст: `999-multibots-telegraf` — Inngest TypeScript SDK v3.54 на self-hosted Inngest (Railway), Node/Telegraf, Supabase. Задачи: генерация изображений/видео, тренировка моделей на Replicate, LLM-анализ, рассылки, cron-мониторинг, списание баланса.

Методика: все правила ниже извлечены из первоисточников через `pplx_sdk.search.web` + `pplx_sdk.content.fetch(prompt=...)`; в скобках после каждого правила — URL страницы, которая реально была открыта. Пересказы третьих лиц помечены как таковые. Раздел «Что НЕ подтверждено» перечисляет утверждения, которые в первоисточниках найти не удалось.

Дата сбора: 2026-09-13.

---

## Часть 1. Inngest

### (a) Steps: идемпотентность, детерминизм, именование, размеры

1. **Первый аргумент `step.run` — ID шага; он используется для мемоизации результата между повторными входами в функцию.** Если ID повторяется в цикле, Inngest добавляет счётчик, поэтому паттерн `step.run(\`fetch-products-${pageNumber}\`, …)` корректен, а «одинаковый ID в цикле» — работает, но хуже читается в трассах. (https://www.inngest.com/docs/guides/multi-step-functions, https://www.inngest.com/docs/guides/working-with-loops)
2. **Каждый шаг — отдельный HTTP-запрос к вашему приложению; функция перезапускается с начала и пропускает мемоизированные шаги.** Следствие: любой код вне `step.run` выполняется N раз (по числу шагов) — `console.log`, запросы к БД, отправка сообщений в Telegram. Всё, что имеет побочный эффект или недетерминировано (`Date.now()`, `Math.random()`, чтение баланса), должно жить внутри `step.run`. (https://www.inngest.com/docs/guides/working-with-loops, https://www.inngest.com/docs/learn/how-functions-are-executed)
3. **`step.run` — «транзакция уровня кода»**: либо завершилась и результат сохранён, либо повторяется целиком. Внутри шага код должен быть идемпотентным, потому что at-least-once. (https://www.inngest.com/docs/learn/inngest-steps)
4. **Лимиты**: результат шага ≤ 4 MiB; общее состояние рана ≤ 32 MiB; ≤ 1000 шагов на функцию; таймаут шага до 2 часов (и не больше таймаута хостинга); `step.sleep` ≤ 1 год (7 дней на free-плане Cloud). Для нашего кейса: не возвращать из шага бинарные данные изображений/видео — только URL/ключ в Supabase Storage. (https://www.inngest.com/docs/usage-limits/inngest)
5. **Результат шага и `ID` мемоизируются между версиями кода**: переименование ID шага в деплое ломает in-flight раны (шаг будет выполнен заново). Именовать шаги стабильно: `charge-balance`, `create-replicate-prediction`, `poll-prediction-${i}`. (https://www.inngest.com/docs/reference/functions/step-run, https://www.inngest.com/docs/reference/typescript/v4/functions/step-run)
6. **Практика продакшена (сторонний разбор)**: четыре типичных сбоя — побочные эффекты вне `step.run`; чтение «живого» состояния вне шага; слишком грубые concurrency-ключи (проверять кардинальность); после `step.sleep` состояние нужно перечитывать в новом `step.run`, а не использовать замороженную переменную. (https://perun.au/insights/inngest-production)

### (b) Ошибки: NonRetriableError, RetryAfterError, retries, onFailure

1. **По умолчанию любой брошенный `Error` ретраится**; `retries` в конфиге функции — от 0 до 20, по умолчанию 4 (то есть 5 попыток). `retries: 0` отключает ретраи. (https://www.inngest.com/docs/reference/typescript/functions/create, https://www.inngest.com/docs/features/inngest-functions/error-retries/retries)
2. **Счётчик ретраев — на шаг, не на функцию**: 3 шага × 5 попыток = до 15 попыток; `attempt` в аргументах хендлера нумеруется с 0 и сбрасывается для каждого шага. (https://www.inngest.com/docs/features/inngest-functions/error-retries/retries)
3. **`NonRetriableError(message, { cause })`** — для бизнес-ошибок, которые ретраить бессмысленно: недостаточно средств, невалидный промпт, пользователь заблокировал бота (403 от Telegram). **`RetryAfterError(message, retryAfter: number | string | Date)`** — для 429 от OpenAI/Replicate: задаёт следующую попытку вместо экспоненциального бэкоффа. (https://www.inngest.com/docs/features/inngest-functions/error-retries/inngest-errors, https://www.inngest.com/docs/reference/typescript/functions/errors)
4. **После исчерпания ретраев шага** в код функции прилетает `StepError`; его можно поймать `try/catch` вокруг `step.run` и сделать фолбэк (пример из документации: DALL-E → Midjourney) или запустить компенсацию через `.catch(err => step.run("rollback-…", …))`. Это единственный «saga»-механизм в Inngest — ручной. (https://www.inngest.com/docs/features/inngest-functions/error-retries/rollbacks)
5. **`onFailure({ event, error })`** вызывается один раз, когда функция окончательно упала; альтернатива — отдельная функция на системном событии `inngest/function.failed` (и `inngest/function.cancelled` для отмен). Для платных генераций — именно здесь делать возврат средств и уведомление пользователя. (https://www.inngest.com/docs/features/inngest-functions/error-retries/failure-handlers)

### (c) Flow control: concurrency, rateLimit / throttle / debounce, idempotency, priority, batching

1. **`concurrency` ограничивает одновременно выполняющиеся *шаги*, не раны**; спящие раны не считаются. `key` (CEL, например `event.data.user_id`) создаёт виртуальную очередь на каждое значение ключа; `scope: "account"` + общий ключ (например `"openai"`) разделяет лимит между разными функциями. На одну функцию — не более двух лимитов. (https://www.inngest.com/docs/guides/concurrency)
2. **`rateLimit` — жёсткий лимит: лишние события *пропускаются* (не ставятся в очередь), алгоритм GCRA.** Не использовать для задач, которые обязаны выполниться (платные генерации, рассылки). (https://www.inngest.com/docs/guides/rate-limiting)
3. **`throttle` — ставит в очередь (FIFO)**, параметры `limit/period/burst/key`, period от 1 с до 7 дней. Это правильный примитив для лимитов внешнего API (Replicate, OpenAI, Telegram Bot API при рассылке). (https://www.inngest.com/docs/guides/throttling)
4. **`debounce`** — `period/key/timeout`, запускает функцию с *последним* событием окна; подходит для «пользователь прислал 5 правок промпта подряд». (https://www.inngest.com/docs/guides/debounce)
5. **Идемпотентность**: поле `id` события — идемпотентный ключ на 24 часа (дубликат с тем же `id` игнорируется); при этом дедупликация игнорируется для функций с debounce/batching/paused. Отдельно есть `idempotency` на уровне функции — CEL-выражение, эквивалент `rateLimit { key, limit: 1, period: "24h" }`. Для платёжных событий ставить `id` = `${telegram_payment_charge_id}` или `${user_id}-${prompt_hash}-${date}`. (https://www.inngest.com/docs/guides/handling-idempotency, https://www.inngest.com/docs/reference/typescript/functions/create)
6. **`priority.run`** — CEL, возвращающий секунды: ран ставится «впереди» всех, кто ждёт до N секунд; отрицательные значения задерживают. Пример: платные пользователи `event.data.tier == "paid" ? 120 : 0`. Работает только в связке с concurrency-ограничением. (https://www.inngest.com/docs/guides/priority)
7. **`batchEvents { maxSize, timeout, key, if }`** — суммарный размер батча ≤ 10 MiB; подходит для агрегирования событий аналитики, не для генераций. (https://www.inngest.com/docs/guides/batching, https://www.inngest.com/docs/usage-limits/inngest)
8. **`singleton { key, mode: "skip" | "cancel" }`** (TS SDK ≥ 3.39) — один активный ран на ключ; для «одна тренировка модели на пользователя одновременно». (https://www.inngest.com/docs/guides/singleton)

### (d) sleep / sleepUntil / waitForEvent / invoke / sendEvent / cancelOn / timeouts

1. **`step.sleep` / `step.sleepUntil`** не занимают concurrency-слоты; но дашборд скрывает раны, спящие дольше срока хранения истории. (https://www.inngest.com/docs/features/inngest-functions/steps-workflows/sleeps)
2. **`step.waitForEvent(id, { event, timeout, match | if })`** — `timeout` обязателен; возвращает `null` при таймауте; `match` (равенство поля) и `if` (CEL с `event`/`async`) взаимоисключающие. Это основной примитив для «ждём webhook от Replicate»: генерация отправляет `replicate/prediction.completed` с `data.prediction_id`, функция ждёт `if: "async.data.prediction_id == event.data.prediction_id"`. (https://www.inngest.com/docs/features/inngest-functions/steps-workflows/wait-for-event, https://www.inngest.com/docs/reference/typescript/v4/functions/step-wait-for-event)
3. **`step.waitForSignal` / `inngest.sendSignal`** — более лёгкая альтернатива; документация рекомендует по умолчанию `waitForEvent`. (https://www.inngest.com/docs/features/inngest-functions/steps-workflows/wait-for-signal)
4. **`step.invoke`** — вызвать другую функцию *с её собственной* конфигурацией (concurrency/throttle): именно так изолировать общий «клиент OpenAI/Replicate» с account-scope лимитом. При `timeout` шаг бросает ошибку, но вызванная функция продолжает работать — учитывать при списаниях. (https://www.inngest.com/docs/guides/invoking-functions-directly, https://www.inngest.com/docs/reference/typescript/functions/step-invoke)
5. **Fan-out**: несколько функций на одно событие; внутри функций отправлять события через `step.sendEvent` (мемоизировано — не задублируется при ретрае), а не `inngest.send`; `ts` в будущем = отложенная доставка; `id` = дедупликация. (https://www.inngest.com/docs/guides/fan-out-jobs, https://www.inngest.com/docs/reference/events/send, https://www.inngest.com/docs/reference/typescript/v4/functions/step-send-event)
6. **`cancelOn: [{ event, if, timeout }]`** — до 5 событий; `timeouts.start` (макс. ожидание в очереди до старта) и `timeouts.finish` (макс. длительность после старта) отменяют ран; отмена порождает `inngest/function.cancelled`, где нужно освобождать резерв баланса. (https://www.inngest.com/docs/features/inngest-functions/cancellation/cancel-on-events, https://www.inngest.com/docs/features/inngest-functions/cancellation/cancel-on-timeouts)
7. **Параллелизм**: `Promise.all([...step.run])`; в v4 «optimized parallelism» включён по умолчанию; для `Promise.race` нужен `group.parallel`. (https://www.inngest.com/docs/guides/step-parallelism)

### (e) Схемы событий и типизация

1. **v3**: `new Inngest({ schemas: new EventSchemas().fromSchema({...}) })` — принимает Zod / Standard Schema. (https://www.inngest.com/docs/reference/client/create)
2. **Формат события**: обязательны `name` и `data`; опционально `id` (идемпотентность), `ts`, `v` (версия схемы). Рекомендованное именование — `object.action` в прошедшем времени с префиксом домена: `billing/balance.reserved`, `replicate/prediction.completed`. (https://www.inngest.com/docs/features/events-triggers/event-format)
3. **v4**: `eventType(name, { schema, version })` и `.create()` — типизированный конструктор события; wildcard-триггеры не имеют схемы; фильтр `if`/`match` в триггере. `EventSchemas` удалён. (https://www.inngest.com/docs/reference/typescript/functions/triggers, https://www.inngest.com/docs/reference/typescript/v4/migrations/v3-to-v4)
4. **CEL-выражения** (`if`, `key`, `cancelOn.if`, `priority.run`) используют переменные `event` и `async`. (https://www.inngest.com/docs/guides/writing-expressions)

### (f) Платные операции: reserve → call → commit/refund (saga)

1. В документации Inngest **нет готового примитива saga**; официальный паттерн — `try/catch` вокруг `step.run` и `.catch(() => step.run("rollback-…"))`, плюс `onFailure` как «последняя линия» компенсации. (https://www.inngest.com/docs/features/inngest-functions/error-retries/rollbacks, https://www.inngest.com/docs/features/inngest-functions/error-retries/failure-handlers)
2. Сторонний сравнительный разбор подтверждает: saga в Inngest собирается вручную из шагов, тогда как Temporal даёт отдельный design pattern. (https://letsbuildsolutions.com/blog/web-engineering/durable-execution-in-typescript-temporal-inngest-and-cloudflare-workflows/)
3. Рекомендуемая структура для нашего кейса (синтез из п. 1 и правил Temporal/Restate ниже):

```ts
export const generateImage = inngest.createFunction(
  {
    id: "generate-image",
    retries: 3,
    concurrency: [{ key: "event.data.user_id", limit: 1 }],
    cancelOn: [{ event: "generation/cancel.requested", if: "async.data.job_id == event.data.job_id" }],
    onFailure: async ({ event, step }) => {
      // event.data.event — исходное событие; освобождаем резерв, если он был
      await step.run("refund-on-failure", () => releaseReservation(event.data.event.data.job_id));
    },
  },
  { event: "generation/image.requested" },
  async ({ event, step }) => {
    const reservation = await step.run("reserve-balance", () =>
      reserveBalance({ userId: event.data.user_id, amount: event.data.cost, idempotencyKey: event.data.job_id }),
    );
    if (!reservation.ok) throw new NonRetriableError("insufficient_balance");

    const prediction = await step.run("create-prediction", () =>
      replicate.predictions.create({ ...input, webhook: WEBHOOK_URL, webhook_events_filter: ["completed"] }),
    );

    const done = await step.waitForEvent("wait-prediction", {
      event: "replicate/prediction.completed",
      if: `async.data.prediction_id == "${prediction.id}"`,
      timeout: "30m",
    });

    if (!done || done.data.status !== "succeeded") {
      await step.run("release-reservation", () => releaseReservation(event.data.job_id));
      throw new NonRetriableError(`prediction_${done?.data.status ?? "timeout"}`);
    }

    await step.run("commit-charge", () => commitReservation(event.data.job_id));
    await step.run("persist-output", () => copyToStorage(done.data.output));
    await step.run("notify-user", () => bot.telegram.sendPhoto(event.data.chat_id, ...));
  },
);
```

Здесь `reserveBalance`/`commitReservation`/`releaseReservation` — идемпотентные SQL-операции в Supabase с уникальным ключом `job_id` (единственный атомарный `UPDATE … WHERE balance >= cost`, см. раздел «Биллинг»).

### (g) AI-специфика: step.ai, AgentKit, v4

1. **`step.ai.infer(id, { model, body })`** выполняет запрос к провайдеру на инфраструктуре Inngest (провайдеры: openai, gemini, anthropic, grok, azure-openai) — функция «спит», пока идёт LLM-запрос, не расходуя compute/таймаут вашего сервера. **`step.ai.wrap(id, client.method, args)`** оборачивает произвольный SDK-вызов (аргументы должны быть JSON-сериализуемы). Стриминг на момент чтения — «coming soon». (https://www.inngest.com/docs/features/inngest-functions/steps-workflows/step-ai-orchestration, https://www.inngest.com/blog/step-ai-for-serverless-ai-applications)
2. **AgentKit** — `createAgent`/Networks/Router/State, MCP-серверы как инструменты; каждый вызов агента — durable-шаг. (https://agentkit.inngest.com/, https://www.inngest.com/docs/learn/durable-agents)
3. Пример из документации: общий `chatCompletion` с `throttle` вызывается через `step.invoke` из разных агентов — ровно паттерн для единого лимита OpenAI в мультибот-приложении. (https://www.inngest.com/docs/examples/ai-agents-and-rag)
4. **Миграция v3 → v4 — breaking changes**: режим по умолчанию — cloud (нужен `INNGEST_SIGNING_KEY`; для dev — `isDev: true` или `INNGEST_DEV=1`); триггеры переезжают в options (`triggers: { event }`); `EventSchemas` удалён → `eventType`/`staticSchema`; удалено `event.user`; `serveHost` → `serveOrigin`; `baseUrl`/`signingKey` переезжают в клиент; `logLevel` удалён; `streaming: true|false`; optimized parallelism и checkpointing включены по умолчанию (`maxRuntime` 60–80 % от лимита хостинга); middleware переписан (class-based, не совместим назад); `step.invoke` с сырой строкой не поддерживается. (https://www.inngest.com/docs/reference/typescript/v4/migrations/v3-to-v4, https://www.inngest.com/blog/typescript-sdk-v4.0)
5. **Experiments / scoring (v4, beta)**: `scoreMiddleware` из `inngest/experimental`, `step.score`, `createScorer` + `defer()`, `group.experiment` с весами бакетов, `inngest.score`/`score.experiment` по `runId`. Это готовая рамка для A/B моделей генерации и оценки качества. (https://www.inngest.com/docs/learn/agent-evals)
6. **Realtime (v4)**: каналы/топики, `step.realtime.publish` — публикации внутри шага не дублируются при ретрае. (https://www.inngest.com/docs/features/realtime)

### (h) Self-hosting: ограничения, мониторинг, MCP

1. **Архитектура**: один бинарь `inngest start`, порты 8288 (API/UI) и 8289 (connect); по умолчанию in-memory Redis и SQLite — для продакшена `--redis-uri` и `--postgres-uri` (Supabase явно указан как пример Postgres); SQLite — только один узел. Тюнинг: `--queue-workers` (100), `--tick` (150 мс), `--retry-interval`; SDK-переменные `INNGEST_DEV=0`, `INNGEST_BASE_URL`. Health-check `/health`, диагностика `inngest alpha doctor` (≥ 1.19.3). Официально: «no guaranteed support» для self-hosted. (https://www.inngest.com/docs/self-hosting, https://www.inngest.com/blog/inngest-1-0-announcing-self-hosting-support)
2. **Косвенные признаки функций, доступных только в Cloud**: экспорт метрик в Datadog/Prometheus объявлен для «всех платных планов» Cloud; страница метрик описывает Cloud-дашборд; в self-hosted v1.19.4 поиск ранов по CEL заблокирован (GitHub issue); `step.ai.infer` выполняет запрос «на серверах Inngest» — для self-hosted это ваш же бинарь. (https://www.inngest.com/blog/announcing-metrics-export, https://www.inngest.com/docs/platform/monitor/observability-metrics, https://github.com/inngest/inngest/issues/4731, https://www.inngest.com/blog/step-ai-for-serverless-ai-applications)
3. **Известная проблема**: утечка памяти self-hosted (RSS 500 MiB → 10+ GiB за 2–3 дня, связана с tracing exporter). На Railway — ставить memory-alert и плановый рестарт до фикса. (https://github.com/inngest/inngest/issues/3892)
4. **Connect** (вместо HTTP `serve`): требует Node ≥ 22.4, SDK ≥ 3.34.1, long-running процесс; не ограничен HTTP-таймаутами; graceful shutdown по SIGTERM. Для долгих LLM-шагов на Railway это предпочтительный транспорт. (https://www.inngest.com/docs/setup/connect, https://www.inngest.com/docs/improve-performance)
5. **MCP-сервер Inngest**: Cloud — `https://api.inngest.com/mcp` (API key); Dev Server — `http://127.0.0.1:8288/mcp`; документация предупреждает о мутирующих инструментах. Для self-hosted упомянут только эндпоинт dev-сервера. (https://www.inngest.com/docs/ai-dev-tools/mcp)
6. **Логирование**: использовать `logger` из аргументов функции (Pino child logger), иначе логи вне шагов дублируются на каждый вход. (https://www.inngest.com/docs/guides/logging)
7. **Шифрование**: encryption middleware шифрует события и результаты шагов end-to-end — актуально для промптов и персональных данных пользователей в self-hosted Postgres. (https://www.inngest.com/docs/features/middleware/encryption-middleware)
8. **Webhooks-приёмник** (Replicate → Inngest): проверять подпись, дедуплицировать по ID события провайдера, отправлять внутреннее событие (`ai/inference.completed` в примере документации). (https://www.inngest.com/docs/patterns/jobs/build-reliable-webhooks)

### (i) Тестирование

1. **`@inngest/test`** (требует `inngest ≥ 3.22.12`): `new InngestTestEngine({ function })`, `t.execute()` — весь ран, `t.executeStep(id)` — один шаг; `ctx.step` — spies; можно мокать `step.sleep`/`step.waitForEvent` и подменять `state` (результаты предыдущих шагов). Совместим с jest/vitest/bun:test. (https://www.inngest.com/docs/reference/testing)
2. Из этого следует минимальный набор тестов для платного пайплайна: (1) `reserve-balance` бросает `NonRetriableError` при нехватке средств и ничего не списывает; (2) при `waitForEvent → null` вызывается `release-reservation`; (3) `onFailure` идемпотентен при повторном вызове с тем же `job_id`. (https://www.inngest.com/docs/reference/testing, https://www.inngest.com/docs/features/inngest-functions/error-retries/failure-handlers)

---

## Часть 2. Конкуренты и альтернативы

### Temporal (TypeScript SDK)

- Activities имеют четыре таймаута: `scheduleToStart` (∞, не ретраится по дизайну), `startToClose` (на попытку), `scheduleToClose` (на всю activity включая ретраи), `heartbeatTimeout`; retry policy — `initialInterval/maximumAttempts`, `ApplicationFailure` с `nextRetryDelay`. (https://docs.temporal.io/develop/typescript/activities/timeouts, https://docs.temporal.io/encyclopedia/detecting-activity-failures)
- **Heartbeat**: `heartbeat(details)` внутри activity, `activityInfo().heartbeatDetails` при ретрае — новая попытка продолжает с чекпоинта; рекомендуемая частота 10–30 с, `heartbeatTimeout` = 2–3× интервала и меньше `startToClose`; отмена доставляется через heartbeat. (https://docs.temporal.io/design-patterns/long-running-activity)
- **Saga**: регистрировать компенсацию *до* действия; компенсации идемпотентны, с щедрыми ретраями и только `startToClose`; после компенсаций пробрасывать исходную ошибку. (https://docs.temporal.io/design-patterns/saga-pattern)
- **Идемпотентность**: at-least-once для activities; ключ `${info.workflowRunId}-${info.activityId}` + уникальное ограничение в БД. (https://temporal.io/blog/idempotency-and-durable-execution, https://docs.temporal.io/activity-definition)

### Trigger.dev v3/v4

- `idempotencyKey` при триггере с TTL (по умолчанию 30 дней), scope `run/attempt/global`, ≤ 2048 символов; **упавший ран очищает ключ** (повтор возможен). (https://trigger.dev/docs/idempotency)
- Retry: `factor/minTimeout/maxTimeout`, `AbortTaskRunError`, `catchError` с `retryAt`, `retry.fetch` на 429/5xx, `maxDuration`, `ttl`, `delay`, machine presets. (https://github.com/triggerdotdev/trigger.dev/blob/main/rules/4.0.0/advanced-tasks.md)
- Очереди: `queue.concurrencyLimit`, `concurrencyKey` (копия очереди на пользователя), override очереди при триггере (`free-users`/`paid-users`); env-лимит с burst 2.0×; слот освобождается только на чекпоинте — для `wait.for` короче 60 с слот удерживается. (https://trigger.dev/docs/queue-concurrency, https://trigger.dev/docs/triggering)
- `wait.forToken` — waitpoint-токены с таймаутом (по умолчанию 10 мин), завершаются по URL — удобный приёмник для webhook. (https://trigger.dev/docs/wait-for-token)
- Realtime: подписка на run (status/metadata/tags) и типизированные `streams.define()` для токенов LLM; прогресс — через run metadata. (https://trigger.dev/docs/realtime/overview)

### Hatchet

- Durable tasks: `SleepFor`, `WaitForEvent(key, CEL)`, `WaitFor` (or-группы), `Memo`, `RunChild` — каждый вызов создаёт чекпоинт в event log, задача вытесняется с воркера во время ожидания (слот освобождается). (https://docs.hatchet.run/v1/durable-task-execution, https://docs.hatchet.run/v1/durable-tasks)
- Concurrency с CEL-ключами и стратегиями `GROUP_ROUND_ROBIN`, `CANCEL_IN_PROGRESS`, `CANCEL_NEWEST`; rate limits — статические с единицами и динамические CEL-ключи. (https://docs.hatchet.run/v1/concurrency, https://docs.hatchet.run/v1/rate-limits)
- Self-host OSS: те же возможности, что Cloud, но вы отвечаете за Postgres, бэкапы, мониторинг. (https://docs.hatchet.run/v1/cloud-vs-oss)

### Restate

- Saga: `TerminalError` запускает компенсации; двухфазный reserve/confirm/cancel; компенсацию регистрировать до действия; `ctx.rand.uuidv4()` как детерминированный идемпотентный ключ для внешних API. (https://docs.restate.dev/guides/sagas)
- Идемпотентность вызова — заголовок `idempotency-key`, повторный вызов «прикрепляется» к существующему; журнал + экспоненциальный бэкофф. (https://docs.restate.dev/foundations/invocations, https://docs.restate.dev/foundations/key-concepts)
- Flow control: opt-in (experimental flags, Restate ≥ 1.7.3), пока только concurrency-лимиты со scope до двух уровней (`checkout/*/*`); rate limits — «planned». (https://docs.restate.dev/services/flow-control)

### Upstash Workflow / QStash

- Шаги: `context.run/sleep/sleepUntil/waitForEvent/createWebhook/waitForWebhook/notify/invoke/call/cancel`. (https://upstash.com/docs/workflow/steps)
- `waitForEvent` — таймаут до 7 дней (free) / 1 год (PAYG); есть гонка с `notify` — компенсируется lookback по `workflowRunId`. (https://upstash.com/docs/workflow/features/wait-for-event)
- Ретраи: по умолчанию 3 с экспоненциальным бэкоффом → DLQ с resume/restart/callback; `failureFunction` (работает только пока приложение живо) vs `failureUrl` (работает и когда приложение упало); `WorkflowNonRetryableError`, `context.cancel()`. (https://upstash.com/docs/workflow/howto/failures, https://upstash.com/docs/workflow/features/retries/prevent-retries)
- QStash `flowControl { key, rate, period, parallelism }`. (https://upstash.com/docs/qstash/features/flowcontrol)

### DBOS

- `workflowID` = идемпотентный ключ (глобально уникален), `withNextWorkflowID`; шаги at-least-once, транзакции exactly-once. (https://docs.dbos.dev/typescript/tutorials/workflow-tutorial, https://docs.dbos.dev/typescript/tutorials/idempotency-tutorial)
- Шаги: `retriesAllowed/intervalSeconds/maxAttempts/backoffRate/shouldRetry/timeoutMS`; `maxRecoveryAttempts` → `RETRIES_EXCEEDED`; `DBOS.scheduled` crontab. (https://docs.dbos.dev/typescript/reference/workflows-steps)
- Очереди: `workerConcurrency`, `globalConcurrency`, `rateLimit { limitPerPeriod, periodSec }`, `deduplicationID` (+ `duplicationPolicy: "return-existing"`), durable `timeoutMS` (start-to-completion, отменяет детей), `DBOS.waitFirst`. (https://docs.dbos.dev/typescript/tutorials/queue-tutorial)

### Таблица возможностей

Обозначения: «+» — есть в открытых первоисточниках; «~» — частично/вручную; «−» — не найдено в открытых страницах (не означает отсутствия).

| Возможность | Inngest | Temporal | Trigger.dev | Hatchet | Restate | Upstash | DBOS |
|---|---|---|---|---|---|---|---|
| Durable steps | + `step.run` мемоизация | + activities + event history | + tasks + checkpoints | + durable event log, `Memo` | + journal | + `context.run` | + steps в Postgres |
| Retries policy | + 0–20, per-step, `RetryAfterError`, `NonRetriableError` | + retry policy, `ApplicationFailure.nextRetryDelay` | + factor/min/max, `AbortTaskRunError`, `retryAt` | + (детали не открыты) | + exp. backoff, `TerminalError` | + 3 default, DLQ, `WorkflowNonRetryableError` | + `maxAttempts/backoffRate/shouldRetry` |
| Concurrency keys | + CEL key, scope account, ≤2 лимита | ~ через task queues/worker slots | + `concurrencyKey`, shared queues | + CEL + стратегии cancel | + scope L1/L2 (experimental) | + `flowControl.parallelism` | + worker/global/partition |
| Rate limit | + `rateLimit` (drop), `throttle` (queue) | − на открытых страницах | ~ `retry.fetch` на 429 | + static + dynamic CEL | − «planned» | + `flowControl.rate` | + `rateLimit` per queue |
| Idempotency | + event `id` 24h; функция `idempotency` CEL | ~ вручную (`runId-activityId` + unique) | + `idempotencyKey` TTL 30d, scopes | − на открытых страницах | + `idempotency-key` header, attach | − на открытых страницах | + `workflowID`, `deduplicationID` |
| waitForEvent / signals | + `waitForEvent`, `waitForSignal`, `cancelOn` | + signals (не открывались отдельно) | + `wait.forToken` | + `WaitForEvent` CEL, or-группы | ~ awakeables (не открывались) | + `waitForEvent`/`notify`, `waitForWebhook` | ~ `waitFirst`, events (не открывались) |
| Heartbeat | − нет примитива | + `heartbeat()` + `heartbeatTimeout` + details | ~ run metadata (прогресс, не liveness) | − не найдено | − не найдено | − не найдено | − не найдено |
| Compensation / saga | ~ try/catch + rollback step + `onFailure` | + design pattern (register-before-act) | − не найдено | − не найдено | + гайд sagas, `TerminalError` | ~ `failureFunction`/`failureUrl` | − не найдено |
| Self-host | + один бинарь, Redis+Postgres, «no guaranteed support» | + (не открывалось) | + (не открывалось) | + OSS = Cloud по функциям | + (не открывалось) | − только Cloud (QStash) | + Postgres-only, без сервера |
| AI-примитивы | + `step.ai.infer/wrap`, AgentKit | − | + realtime streams для токенов | − | − | − | − |
| Эксперименты / оценки | + `scoreMiddleware`, `group.experiment` (v4 beta) | − | − | − | − | − | − |

---

## Паттерны, которые стоит перенять (независимо от платформы)

1. **Reserve → call → commit/release вместо charge-after-success.** Restate описывает двухфазный reserve/confirm/cancel, а руководства по кредитному биллингу рекомендуют pessimistic-списание перед дорогой генерацией с возвратом при ошибке; чистый charge-after-success даёт пользователю запуск N генераций на один баланс. (https://docs.restate.dev/guides/sagas, https://dodopayments.com/blogs/add-credits-billing-ai-app)
2. **Один атомарный `UPDATE … SET balance = balance - cost WHERE balance >= cost`, а не read-then-write.** Две заявки в окне 40 мс с балансом 3 кредита иначе списывают 6. В Supabase — RPC-функция с уникальным `job_id`. (https://www.danielolawoyin.com/blog/credit-based-billing-for-ai-features-what-actually-works-in-production, https://www.runonatlas.com/blog-posts/how-to-implement-credit-based-billing-for-ai-companies-a-complete-guide)
3. **Immutable ledger вместо изменяемого поля баланса**: каждое списание/возврат — новая строка с идемпотентным `request_id`; коррекции — новыми записями. Целевые метрики: доля успешных списаний > 99.9 %, алерт при > 1 % ошибок. (https://www.runonatlas.com/blog-posts/how-to-implement-credit-based-billing-for-ai-companies-a-complete-guide)
4. **Идемпотентный ключ платежа по правилам Stripe**: клиент генерирует UUID v4 (≤ 255 символов, без PII), сервер сохраняет и первый ответ включая 500, ключ живёт ≥ 24 ч, отличающиеся параметры при том же ключе → ошибка. Применять и к внутреннему API списания, и к внешним провайдерам. (https://docs.stripe.com/api/idempotent_requests, https://stripe.com/blog/idempotency)
5. **Регистрировать компенсацию до действия и делать компенсации идемпотентными с щедрыми ретраями**; после компенсации пробрасывать исходную ошибку, а не ошибку компенсации. В Inngest — массив `compensations` + `.catch` цикл `step.run("rollback-${i}")`. (https://docs.temporal.io/design-patterns/saga-pattern, https://www.inngest.com/docs/features/inngest-functions/error-retries/rollbacks)
6. **Heartbeat/чекпоинт для долгих Replicate-задач (тренировки).** У Inngest примитива нет — эмулировать: цикл `step.run("poll-${i}")` + `step.sleep`, с сохранением `last_status`/`progress` в БД и `timeouts.finish` как аналог `heartbeatTimeout`; интервал опроса 10–30 с по рекомендации Temporal. (https://docs.temporal.io/design-patterns/long-running-activity, https://www.inngest.com/docs/features/inngest-functions/cancellation/cancel-on-timeouts)
7. **Webhook первичен, polling — резерв.** Replicate шлёт `start/output/logs/completed`; терминальный webhook ретраится с exp. backoff (последняя попытка ≈ 1 мин после завершения), промежуточные — нет; данные predictions удаляются через час — копировать вывод в Storage сразу. Дополнительно можно `Cancel-After` (5 с – 24 ч) как серверный дедлайн и `Prefer: wait` для коротких моделей. (https://replicate.com/docs/topics/webhooks/receive-webhook, https://replicate.com/docs/topics/webhooks, https://replicate.com/docs/topics/predictions/create-a-prediction)
8. **Webhook-приёмник идемпотентен и монотонен**: игнорировать всё после терминального статуса и события, «откатывающие» прогресс; проверять подпись; преобразовывать в внутреннее событие с `id` = `${prediction_id}:${status}`. (https://replicate.com/docs/topics/webhooks/receive-webhook, https://www.inngest.com/docs/patterns/jobs/build-reliable-webhooks)
9. **Отделять «не ретраить» от «ретраить позже» на уровне типов ошибок**: `NonRetriableError` (баланс, 403 Telegram), `RetryAfterError` с `Retry-After` провайдера (429). Аналоги: Temporal `ApplicationFailure.nextRetryDelay`, Trigger.dev `retryAt`, Upstash `WorkflowNonRetryableError`. (https://www.inngest.com/docs/features/inngest-functions/error-retries/inngest-errors, https://docs.temporal.io/develop/typescript/activities/timeouts, https://github.com/triggerdotdev/trigger.dev/blob/main/rules/4.0.0/advanced-tasks.md, https://upstash.com/docs/workflow/features/retries/prevent-retries)
10. **Единая функция-шлюз на провайдера с account-scope лимитом** (`throttle`/`concurrency` с ключом `"replicate"`, `"openai"`), вызываемая через `step.invoke`; per-user очередь — `concurrency.key = event.data.user_id`. Аналоги: Trigger.dev shared queues + `concurrencyKey`, Hatchet CEL-ключи. (https://www.inngest.com/docs/guides/concurrency, https://www.inngest.com/docs/examples/ai-agents-and-rag, https://trigger.dev/docs/queue-concurrency)
11. **Разделять очереди платных и бесплатных пользователей** (`priority.run` по тарифу или отдельный `queue`), чтобы рассылки/бесплатные генерации не блокировали платные. (https://www.inngest.com/docs/guides/priority, https://trigger.dev/docs/queue-concurrency)
12. **Failure-хендлер, живущий вне приложения.** Upstash различает `failureFunction` (только пока приложение живо) и `failureUrl`; в Inngest аналог — отдельная функция на `inngest/function.failed` + `inngest/function.cancelled`, которая освобождает резерв даже если основная функция деплоится/упала. (https://upstash.com/docs/workflow/howto/failures, https://www.inngest.com/docs/features/inngest-functions/error-retries/failure-handlers)
13. **Дедупликация «один активный ран на пользователя»**: Inngest `singleton { key, mode }`, DBOS `deduplicationID` + `return-existing` — для тренировок моделей и массовых рассылок. (https://www.inngest.com/docs/guides/singleton, https://docs.dbos.dev/typescript/tutorials/queue-tutorial)
14. **Перечитывать состояние после долгого ожидания** (`sleep`/`waitForEvent`) в новом шаге: баланс, статус подписки, не заблокировал ли пользователь бота. (https://perun.au/insights/inngest-production)
15. **Не хранить бинарники в результатах шагов** (лимит 4 MiB/32 MiB), возвращать ключи Storage; аналогично Temporal предупреждает о размере heartbeat details. (https://www.inngest.com/docs/usage-limits/inngest, https://docs.temporal.io/design-patterns/long-running-activity)

---

## Что НЕ подтверждено (не найдено в открытых первоисточниках)

- **Официальной страницы «self-hosted vs Cloud: что не работает» у Inngest не найдено.** Есть только косвенные признаки (metrics export для платных планов Cloud, поиск по ранам заблокирован в self-hosted по issue #4731, «no guaranteed support»). Поведение `step.ai.infer` на self-hosted (кто выполняет запрос к провайдеру) в документации не описано явно.
- **Heartbeat-примитив в Inngest, Trigger.dev, Hatchet, Restate, Upstash, DBOS** — на открытых страницах не найден; подтверждён только у Temporal.
- **Встроенный saga/compensation helper в Inngest** — отсутствует; только ручной паттерн try/catch + rollback step. У Trigger.dev, Hatchet, DBOS — тоже не найден на открытых страницах.
- **Rate limits у Restate** — заявлены как planned; текущий flow control только concurrency и experimental.
- **Idempotency key у Upstash Workflow и Hatchet**, retries policy Hatchet, signals Restate/DBOS — не открывались; ячейки таблицы с «−»/«не открывались» не следует трактовать как отсутствие функции.
- **Официальная статья/гайд Inngest про reserve→commit для платных операций** — не найдена; паттерн (f.3) — синтез из rollbacks-доки Inngest, Restate sagas и Temporal saga.
- **Точная политика ретраев webhooks Replicate** (число попыток, интервалы) — описана только качественно («exponential backoff, последняя ≈ через 1 минуту»).
- **Поведение `idempotency` Inngest при падении рана** (сбрасывается ли ключ, как у Trigger.dev) — на открытых страницах не описано.
- **Changelog v4 GA** (`inngest.com/changelog/2026-03-17-typescript-sdk-v4-ga`) и `docs/guides/sending-events-from-functions` — найдены поиском, но не открывались; не цитируются.
- Страницы, вернувшие 404/ошибку и не используемые: `inngest.com/docs/mcp`, `inngest.com/docs/reference/typescript/functions/step-ai`, `inngest.com/docs/sdk/migration` (содержит только v2→v3).

---

## Источники (все URL реально открыты через `pplx_sdk.content.fetch`)

Inngest: https://www.inngest.com/docs/guides/multi-step-functions · https://www.inngest.com/docs/learn/inngest-steps · https://www.inngest.com/docs/reference/functions/step-run · https://www.inngest.com/docs/reference/typescript/v4/functions/step-run · https://www.inngest.com/docs/learn/how-functions-are-executed · https://www.inngest.com/docs/guides/working-with-loops · https://www.inngest.com/docs/usage-limits/inngest · https://www.inngest.com/docs/features/inngest-functions/error-retries/inngest-errors · https://www.inngest.com/docs/reference/typescript/functions/errors · https://www.inngest.com/docs/features/inngest-functions/error-retries/retries · https://www.inngest.com/docs/features/inngest-functions/error-retries/failure-handlers · https://www.inngest.com/docs/features/inngest-functions/error-retries/rollbacks · https://www.inngest.com/docs/reference/typescript/functions/create · https://www.inngest.com/docs/guides/flow-control · https://www.inngest.com/docs/guides/concurrency · https://www.inngest.com/docs/guides/rate-limiting · https://www.inngest.com/docs/guides/throttling · https://www.inngest.com/docs/guides/debounce · https://www.inngest.com/docs/guides/handling-idempotency · https://www.inngest.com/docs/guides/priority · https://www.inngest.com/docs/guides/batching · https://www.inngest.com/docs/guides/singleton · https://www.inngest.com/docs/features/inngest-functions/steps-workflows/wait-for-event · https://www.inngest.com/docs/reference/typescript/v4/functions/step-wait-for-event · https://www.inngest.com/docs/features/inngest-functions/steps-workflows/wait-for-signal · https://www.inngest.com/docs/features/inngest-functions/steps-workflows/sleeps · https://www.inngest.com/docs/guides/invoking-functions-directly · https://www.inngest.com/docs/reference/typescript/functions/step-invoke · https://www.inngest.com/docs/guides/fan-out-jobs · https://www.inngest.com/docs/reference/events/send · https://www.inngest.com/docs/reference/typescript/v4/functions/step-send-event · https://www.inngest.com/docs/features/inngest-functions/cancellation/cancel-on-events · https://www.inngest.com/docs/features/inngest-functions/cancellation/cancel-on-timeouts · https://www.inngest.com/docs/guides/step-parallelism · https://www.inngest.com/docs/reference/client/create · https://www.inngest.com/docs/features/events-triggers/event-format · https://www.inngest.com/docs/reference/typescript/functions/triggers · https://www.inngest.com/docs/reference/typescript/v4/migrations/v3-to-v4 · https://www.inngest.com/blog/typescript-sdk-v4.0 · https://www.inngest.com/docs/learn/agent-evals · https://www.inngest.com/docs/features/inngest-functions/steps-workflows/step-ai-orchestration · https://www.inngest.com/blog/step-ai-for-serverless-ai-applications · https://agentkit.inngest.com/ · https://www.inngest.com/docs/learn/durable-agents · https://www.inngest.com/docs/examples/ai-agents-and-rag · https://www.inngest.com/docs/self-hosting · https://www.inngest.com/blog/inngest-1-0-announcing-self-hosting-support · https://www.inngest.com/docs/setup/connect · https://www.inngest.com/docs/improve-performance · https://www.inngest.com/docs/reference/testing · https://www.inngest.com/docs/ai-dev-tools/mcp · https://www.inngest.com/docs/platform/monitor/observability-metrics · https://www.inngest.com/blog/announcing-metrics-export · https://www.inngest.com/docs/guides/logging · https://www.inngest.com/docs/guides/writing-expressions · https://www.inngest.com/docs/patterns/jobs/build-reliable-webhooks · https://www.inngest.com/docs/features/middleware/encryption-middleware · https://www.inngest.com/docs/features/realtime · https://github.com/inngest/inngest/issues/4731 · https://github.com/inngest/inngest/issues/3892 · https://perun.au/insights/inngest-production · https://letsbuildsolutions.com/blog/web-engineering/durable-execution-in-typescript-temporal-inngest-and-cloudflare-workflows/

Конкуренты: https://docs.temporal.io/develop/typescript/activities/timeouts · https://docs.temporal.io/design-patterns/saga-pattern · https://docs.temporal.io/design-patterns/long-running-activity · https://docs.temporal.io/encyclopedia/detecting-activity-failures · https://temporal.io/blog/idempotency-and-durable-execution · https://docs.temporal.io/activity-definition · https://trigger.dev/docs/idempotency · https://trigger.dev/docs/wait-for-token · https://trigger.dev/docs/triggering · https://trigger.dev/docs/queue-concurrency · https://trigger.dev/docs/realtime/overview · https://github.com/triggerdotdev/trigger.dev/blob/main/rules/4.0.0/advanced-tasks.md · https://docs.hatchet.run/v1/durable-tasks · https://docs.hatchet.run/v1/durable-task-execution · https://docs.hatchet.run/v1/rate-limits · https://docs.hatchet.run/v1/concurrency · https://docs.hatchet.run/v1/cloud-vs-oss · https://docs.restate.dev/guides/sagas · https://docs.restate.dev/foundations/invocations · https://docs.restate.dev/foundations/key-concepts · https://docs.restate.dev/services/flow-control · https://upstash.com/docs/workflow/steps · https://upstash.com/docs/workflow/features/wait-for-event · https://upstash.com/docs/workflow/howto/failures · https://upstash.com/docs/workflow/features/retries/prevent-retries · https://upstash.com/docs/qstash/features/flowcontrol · https://docs.dbos.dev/typescript/tutorials/workflow-tutorial · https://docs.dbos.dev/typescript/tutorials/idempotency-tutorial · https://docs.dbos.dev/typescript/reference/workflows-steps · https://docs.dbos.dev/typescript/tutorials/queue-tutorial

Биллинг и провайдеры: https://docs.stripe.com/api/idempotent_requests · https://stripe.com/blog/idempotency · https://replicate.com/docs/topics/predictions/create-a-prediction · https://replicate.com/docs/topics/webhooks · https://replicate.com/docs/topics/webhooks/receive-webhook · https://www.danielolawoyin.com/blog/credit-based-billing-for-ai-features-what-actually-works-in-production · https://www.runonatlas.com/blog-posts/how-to-implement-credit-based-billing-for-ai-companies-a-complete-guide · https://dodopayments.com/blogs/add-credits-billing-ai-app
