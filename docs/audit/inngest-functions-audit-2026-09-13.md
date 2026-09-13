# Аудит Inngest-функций 999-multibots-telegraf — 2026-09-13

Снимок: 2026-09-13 02:07Z. Источники — продовый Inngest GraphQL
(`https://inngestinngest-production-c468.up.railway.app/v0/gql`: `apps`, `runs` за 7 дней,
`eventsV2` за 7 дней), эндпоинт бота `GET /api/inngest/functions/status`, `GET /health`,
манифест `src/inngest_app/functions.manifest.json` и код на `main` (e1f87cd).
Все числа ниже получены в этот снимок; что не проверено — сказано в конце.

## Итог одной строкой

**Обслуживаются 28 из 28 функций манифеста со статусом `spec+code`; ни одна не сломана по
имеющимся свидетельствам. Доказанно работают в бою 5 (все cron). Остальные 23 — событийные — за
7 дней не получили ни одного боевого события: 11 из них проходят безопасную пробу до конца,
17 доказанно останавливаются на guard. 14 функций манифеста `code-only` не зарегистрированы и не
обслуживаются — это мёртвый код, а не поломка.** Красные «last run FAILED» на вкладке
FUNCTIONS (20 из 28) — артефакт проб, не сбои; исправление идёт (см. «Что исправляется»).

## Цифры

| Показатель | Значение |
|---|---|
| Приложение в Inngest | `telegram-bot-client`, connected, SDK v3.54.2 |
| Функций обслуживается | 53 = 28 рабочих + 25 `*-failure` (onFailure-двойники) |
| Функций в манифесте | 42 = 28 `spec+code` + 14 `code-only/unregistered` |
| Задеплоено (по статус-эндпоинту) | 28/28; `unknownInApp` = [] (дрейфа нет) |
| Запусков за 7 дней | 703: COMPLETED 626, FAILED 77, RUNNING/QUEUED 0 |
| Из них ручных (invoked, пробы) | 124; **все 77 FAILED — пробы**, органических FAILED за 7 дней: 1 (см. аномалии) |
| Запусков `*-failure` (обработчики падений) | 63, все COMPLETED |
| Событий от бота за 7 дней (`eventsV2`, без внутренних) | **0** |
| Cron-запусков по расписанию пропущено | 0 (163/163 у двух получасовых, 3/3 у трёх суточных) |
| `/health` бота | UP 2026-09-13T02:06Z |

## Группа A — работают, доказано боевыми запусками (5)

Все запуски COMPLETED, пропусков расписания нет, длительности в норме.

| ID | Триггер | Guard | Органические 7д | Пробы 7д | Ожидание пробы | Последний боевой |
|---|---|---|---|---|---|---|
| `training-stuck-check` | cron `*/30 * * * *` | none | COMPLETED 163 | COMPLETED 4 | COMPLETED | COMPLETED 2026-09-13 01:59Z |
| `monitoring-health-check` | cron `*/30 * * * *` | none | COMPLETED 163 | COMPLETED 5, FAILED 1 | COMPLETED | COMPLETED 2026-09-13 02:00Z |
| `monitoring-logs-analyze` | cron `0 10 * * *` | none | COMPLETED 3 | COMPLETED 3 | COMPLETED | COMPLETED 2026-09-12 10:00Z |
| `analytics-sales-advise` | cron `0 9 * * *` | none | COMPLETED 3 | COMPLETED 3 | COMPLETED | COMPLETED 2026-09-12 09:00Z |
| `analytics-skills-detect` | cron `0 10 * * *` | none | COMPLETED 3 | COMPLETED 3 | COMPLETED | COMPLETED 2026-09-12 10:00Z |

Длительности (медиана / максимум): stuck-check 1.2 с / 7.8 с; health-check 0.7 с / 1.0 с;
logs-analyze 1.4 с / 1.6 с; sales-advise 9.5 с / 11.9 с; skills-detect 4.5 с / 9.1 с.

## Группа B — проба проходит до конца, боевого трафика нет (6)

Событийные функции с ожиданием `COMPLETED`: безопасная проба (`e2e_test: true`) выполняется
целиком без списаний и рассылок и завершается COMPLETED. Это свидетельство, что код грузится,
шаги выполняются и safe-mode работает; это **не** свидетельство платного пути.

| ID | Триггер | Guard | Органические 7д | Пробы 7д | Ожидание | Последний боевой |
|---|---|---|---|---|---|---|
| `training-model-complete` | event | unknown | — | COMPLETED 4 | COMPLETED | — |
| `payment-ai-server-process` | event | amount-match | — | COMPLETED 3 | COMPLETED | — |
| `monitoring-error-report` | event | none | — | COMPLETED 3 | COMPLETED | — |
| `monitoring-logs-trigger` | event | none | — | COMPLETED 3 | COMPLETED | — |
| `webhook-generation-validate` | event | unknown | — | COMPLETED 3 | COMPLETED | — |
| `welcome-avatar-generate` | event | unknown | — | COMPLETED 3 | COMPLETED | — |

## Группа C — guard доказан, бизнес-путь не проверен (17)

Проба шлёт заведомо негодный payload; функция обязана упасть на первом защитном шаге до любого
списания и платного API. Все 17 упали именно там (по трассам: судья сьюта 28/28 `match`,
свидетельство `docs/inngest/witness/2026-09-10-probe-suite-03-19Z.json`). Что делает функция
после guard с настоящим пользователем — за 7 дней не наблюдалось ни разу.

| ID | Триггер | Guard | Органические 7д | Пробы 7д | Ожидание | Последний боевой |
|---|---|---|---|---|---|---|
| `neuro-image-generate` | event | check-user | — | FAILED 4 | FAILED-at-guard | — |
| `reels-ai-generate` | event | validate-input | — | FAILED 4 | FAILED-at-guard | — |
| `reels-ai-callback` | event | extract-job-id | — | FAILED 4 | FAILED-at-guard | — |
| `reels-loop-generate` | event | min-images | — | FAILED 4 | FAILED-at-guard | — |
| `training-model-start` | event | validate-steps | — | FAILED 4 | FAILED-at-guard | — |
| `training-model-v2-start` | event | check-user-exists | — | FAILED 4 | FAILED-at-guard | — |
| `morph-images-generate` | event | check-user-exists | — | FAILED 4 | FAILED-at-guard | — |
| `render-job-run` | event | zod-schema | — | FAILED 4 | FAILED-at-guard | — |
| `render-avatar-video-run` | event | zod-schema | — | FAILED 3 | FAILED-at-guard | — |
| `render-riddle-run` | event | zod-schema | — | FAILED 3 | FAILED-at-guard | — |
| `broadcast-message-send` | event | validate-input | — | FAILED 3 | FAILED-at-guard | — |
| `instagram-reels-analyze` | event | validate-input | — | FAILED 3 | FAILED-at-guard | — |
| `instagram-competitors-find` | event | validate-input | — | FAILED 3 | FAILED-at-guard | — |
| `instagram-top-content-extract` | event | zod-schema | — | FAILED 3 | FAILED-at-guard | — |
| `content-scripts-generate` | event | zod-schema | — | FAILED 3 | FAILED-at-guard | — |
| `content-detailed-script-generate` | event | zod-schema | — | FAILED 3 | FAILED-at-guard | — |
| `content-scenario-clips-generate` | event | zod-schema | — | FAILED 3 | FAILED-at-guard | — |

## Группа D — в манифесте, но не зарегистрированы (14)

Код есть, в `registerFunctions` не входит, Inngest их не обслуживает. Это осознанный
`control = code-only/unregistered`, не сбой. Состав: 3 dev-теста, 2 голосовых тренинга (RVC),
2 сторожа вебхуков, ручная проверка Kie.ai, 3 legacy-дубликата уже переименованных функций
(`morph-images`, `neuro-image-generation`, `model-training`), 3 экспериментальных Instagram.

| ID | Триггер | Файл |
|---|---|---|
| `test-simple` | event | `src/inngest_app/functions/__dev__/testSimpleFunction.ts` |
| `test-simple-message` | event | `src/inngest_app/functions/__dev__/testSimpleMessageFunction.ts` |
| `test-advanced-loop` | event | `src/inngest_app/functions/__dev__/testAdvancedLoopFunction.ts` |
| `kie-ai-webhook-manual-check` | event | `src/inngest_app/functions/kieAiWebhookMonitor.ts` |
| `voice-training-start` | event | `src/inngest_app/functions/training/voiceTrainingRVC.ts` |
| `voice-training-completed` | event | `src/inngest_app/functions/training/voiceTrainingRVC.ts` |
| `webhook-health-check` | event | `src/inngest_app/functions/webhookHealthGuard.ts` |
| `periodic-webhook-health-check` | cron | `src/inngest_app/functions/webhookHealthGuard.ts` |
| `morph-images` | event | `src/inngest_app/functions/morphImages.ts` |
| `neuro-image-generation` | event | `src/inngest_app/functions/neuroImageGeneration.ts` |
| `model-training` | event | `src/inngest_app/functions/training/generateModelTraining.ts` |
| `instagram-scraper-v2` | event | `src/inngest_app/functions/instagram/instagramScraper-v2.ts` |
| `create-instagram-user` | event | `src/inngest_app/functions/instagram/instagramScraper-v2.ts` |
| `instagram-reels-test` | event | `src/inngest_app/functions/instagram/instagramScraper-v2-simple.ts` |

Решение по группе D владельцу: удалить из дерева, либо зарегистрировать и завести карточки
`.t27`. Пока они ни на что не влияют.

## Аномалии (обе — 2026-09-09, обе объяснимы деплоем переименования)

1. `telegram-bot-client-health-check` (старый slug) — единственный органический FAILED за 7 дней:
   2026-09-09 16:29Z, 61 с, «No function ID found in request». Функция была переименована в
   `monitoring-health-check`; запуск попал в момент деплоя. С тех пор 163/163 COMPLETED под
   новым slug.
2. `monitoring-health-check` — одна проба FAILED 2026-09-09 17:16Z, 61 с, «Unable to reach SDK URL»:
   Inngest не достучался до бота во время рестарта. Последующие 5 проб COMPLETED.

Прочее: 27 slug-ов в истории запусков не совпадают с манифестом — это старые имена до
переименования 9 сентября (`render`, `morph-images`, `daily-sales-advisor` и т. д.), последние
запуски 2026-09-09 14:37–16:29Z. Не дрейф: `unknownInApp` у живого приложения пуст.

## Главный открытый вопрос: 0 событий от бота за 7 дней

`eventsV2` за 7 дней без внутренних событий пуст. Все 23 событийные функции за неделю не получили
ни одного боевого события. Два объяснения, и по имеющимся данным их нельзя различить:

* продукт простаивает — никто не заказывал генерации, тренировки, рассылки;
* путь «бот → `inngest.send` → сервер Inngest» сломан молча (например, ключ события или
  `INNGEST_BASE_URL` на стороне бота), при этом cron и invoke работают, потому что их
  инициирует сам сервер Inngest.

В боте нет админ-инструмента, который бы это засвидетельствовал: `/inngest_probe` идёт через
GraphQL `invokeFunction`, минуя путь отправки события; `/hello_world` импортирован, но его
привязка к команде не найдена, и функции-получателя `test/hello.world` среди 53 обслуживаемых нет.
Логи Railway недоступны из этого окружения.

**Конкретный следующий шаг:** добавить в `/inngest_probe` режим `event` — отправка одного
безопасного события (`webhook/generation.validate` с `e2e_test: true`, ожидание COMPLETED) через
`inngest.send` и проверка, что событие появилось в `eventsV2` и породило запуск. Это закроет
последнюю неизмеренную дорожку.

### Дополнение 2026-09-13 (позже в тот же день): вопрос закрыт по журналам Railway

Журналы и переменные Railway прочитаны через браузер владельца. Ни один из двух вариантов выше
не подтвердился в чистом виде: проводка Inngest на стороне бота согласована с сервером
(`INNGEST_BASE_URL`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` совпадают, строк
`Failed to send event` нет), а единственный боевой продюсер, до которого доходили новые
пользователи — `welcome-avatar-generate` в `createUserScene.ts` — обрывался **до**
`inngest.send`: `SUPABASE_SERVICE_KEY` содержит JWT роли `anon`, `storage.upload` падал с
`new row violates row-level security policy`. Разбор и исправление:
`docs/inngest/lessons/2026-09-13-supabase-key-role.md`, план по остальным функциям:
`docs/audit/inngest-improvement-plan-2026-09-13.md`. Режим `event` в `/inngest_probe` остаётся
полезным как постоянный свидетель пути отправки; пока не сделан.

## Что исправляется сейчас

Видимая «проблема» — 20 красных «последний запуск FAILED» на вкладке FUNCTIONS t27.ai/#/queen —
это пробы 9–10 сентября, спроектированные падать на guard. Исправление спек-первое:

1. **t27 PR #3593** (открыт): новая спека `specs/automation/inngest-functions-status.t27` —
   `lastRun` только органический, пробы в отдельном поле `lastProbe` с ожиданием из манифеста и
   `asExpected`; `inngest-probe-suite.t27` → VERSION 2 с тремя живыми прогонами и явным
   «Telegram-путь смерженного судьи не засвидетельствован».
2. **mb, ветка `status/last-probe-split`** (в работе): `functionsStatus.ts` реализует контракт —
   `lastRun` без invoked-запусков, `lastProbe {id,status,queuedAt,endedAt,expect,asExpected}`,
   `probeExpect` на каждой функции; `probeExpectOf` вынесен в `manifest.ts` и переиспользован
   сьютом; MCP-инструмент отдаёт новые поля. Тесты статуса/сьюта/команды: 78 passed, tsc чист.
   Осталось: полный vitest, eslint, регенерация `docs/inngest/functions.md`, PR.
3. **trinity** (следующее): `FunctionExplorer` красит точку по `lastRun`, пробу показывает
   отдельной пометкой; функция без боевых запусков — серая, не красная.

Отдельно подтверждено по коду (`src/inngest_app/client.ts`, `isProbeFailureEvent`): падение
пробы не шлёт админ-алерт; 63 запуска `*-failure` за неделю завершились COMPLETED. Что писали в
админ-чат фактически — из этого окружения не прочитать.

## Что НЕ проверено

* Платные пути 17 guarded-функций (Replicate, Kie.ai, HeyGen, списания) — ни одного боевого
  запуска за 7 дней; безопасная проба до них по определению не доходит.
* Доставка событий бот → Inngest (см. открытый вопрос).
* Содержимое админ-чата и логи Railway.
* Telegram-путь `/inngest_probe` со смерженным судьёй (последний засвидетельствованный прогон —
  из операторской песочницы, тот же код, другой процесс).
* Trace-уровень проб после 2026-09-10 03:19Z: пробы 4-й серии (по 4 у восьми функций) судились
  только по статусу в этом аудите.

## Воспроизведение

Снимки: `/tmp/inngest_fresh.json` (apps + 703 runs), `/tmp/inngest_events7d.json` (пусто),
`/tmp/status_fresh.json`, `/tmp/audit_rows.json`. Запросы — формы `GQL_APPS_QUERY` /
`GQL_RUNS_QUERY` из `src/inngest_app/status/inngestGraphql.ts` плюс
`eventsV2(filter:{from, includeInternalEvents:false})`.

## Эксперименты и оценки Inngest: как применить к этим функциям

Источники: [Step experiments](https://www.inngest.com/docs/features/inngest-functions/steps-workflows/step-experiments)
и [Score a function run](https://www.inngest.com/docs-markdown/features/inngest-functions/steps-workflows/scoring).
Прочитаны 2026-09-13; код ниже — адаптация примеров из документации под этот репозиторий, в
проде **не запускался**.

### Предусловие, которое сейчас не выполнено

Обе возможности требуют TypeScript SDK **v4 (не ниже 4.8.0)**; `step.score()` дополнительно требует
`scoreMiddleware()` из `inngest/experimental`. В `package.json` стоит `"inngest": "^3.54.0"`, прод
отвечает SDK v3.54.2. Переход 3 → 4 — мажорное обновление с изменением формы `createFunction`
(`triggers: { event }` вместо `{ event }` вторым аргументом), то есть затрагивает все 28 функций;
по правилу проекта делается только с явного разрешения. Отдельно не проверено, отображает ли
self-hosted сервер Inngest на Railway агрегаты экспериментов и оценок в дашборде — документация
описывает трассы и дашборды без оговорки про self-hosted, но версию сервера и наличие этих
экранов я не смотрел. Плана «включить завтра» здесь нет; ниже — как это будет выглядеть, когда
обновление разрешат.

### Как объявить варианты: `group.experiment()`

`group` приходит в обработчик рядом с `event` и `step`. Выбор варианта — сам по себе durable-шаг:
запомнен на run, при retry/replay не меняется. Каждый вариант обязан вызвать хотя бы один
`step.*`. Возвращается `{ result, variant, experimentRef }`.

```ts
import { experiment } from 'inngest'

const { result, variant, experimentRef } = await group.experiment('log-analysis-model', {
  variants: {
    deepseek: () => step.run('analyze-logs-deepseek', () => analyzeLogs(logs, 'deepseek-chat')),
    gpt4o:    () => step.run('analyze-logs-gpt4o',    () => analyzeLogs(logs, 'gpt-4o-mini')),
  },
  select: /* одна из четырёх стратегий */,
})
```

Четыре стратегии выбора:

| Стратегия | Вызов | Когда |
|---|---|---|
| weighted | `experiment.weighted({ control: 90, candidate: 10 })` | Каждый новый run получает свежее назначение; веса относительные; сид — run ID, поэтому retry держит вариант |
| bucket | `experiment.bucket(event.data.telegram_id, { weights: { control: 80, candidate: 20 } })` | Один пользователь/бот стабильно видит один вариант; `null`/`undefined` ключ схлопывает всех в один бакет — передавать строго непустое значение |
| custom | `experiment.custom(async () => (await rollout.get(event.data.bot_name)) ?? 'control')` | Назначение хранится снаружи (таблица раскатки, фича-флаг) и меняется без деплоя; должен вернуть точное имя варианта |
| fixed | `experiment.fixed('control')` | Ручной оверрайд, тест одного пути, пиннинг перед удалением эксперимента |

Правила из документации, которые стоит перенести в `.t27`-карточки: уникальный ID эксперимента
внутри функции, стабильные имена вариантов (они попадают в трассы), логика сравнения — внутри
вариантов, селектор — простой.

### Где безопасно провести пробу изменения

Критерии: есть боевые запуски (иначе сравнивать нечего), нет списаний и сообщений пользователям,
есть недетерминированный шаг, качество которого реально хочется сравнить.

| Функция | Боевых запусков 7д | Побочные эффекты | Недетерминированный шаг | Вердикт |
|---|---|---|---|---|
| `monitoring-logs-analyze` | 3 | только `messages-admin` | `analyze-logs`: LLM (`deepseek-chat` либо `gpt-4-turbo-preview` по наличию ключа), JSON-ответ | **Кандидат №1** |
| `analytics-skills-detect` | 3 | `messages-admin`, `db-write` | `detect-${serviceType}` | Кандидат №2, но пишет в таблицу skills — сравнение вариантов испачкает данные |
| `analytics-sales-advise` | 3 | `messages-owners` | нет (арифметика по платежам) | Не подходит: детерминированна и пишет владельцам ботов |
| `training-stuck-check` | 163 | `charges-balance`, `paid-api`, `messages-user` | нет | Только для операционных настроек (порог «застрял», размер пачки) и только под `fixed`/`custom` — платные эффекты |
| `neuro-image-generate`, `welcome-avatar-generate`, `content-*` | 0 | платные API | модель/промпт | Идеальные по смыслу (сравнение моделей), но без трафика сравнивать нечего |

**Предложение: `monitoring-logs-analyze`, эксперимент `log-analysis-model`.** Получатель отчёта —
админ-чат, деньги пользователей не участвуют, результат структурирован (`LogAnalysisResult`:
`status`, `summary`, `errors[]`, `warnings[]`, `recommendations[]`), так что качество измеримо
без человека. Ограничение честно: 1 запуск в сутки, за месяц ~15 на вариант — выводы будут
грубыми; для ускорения можно временно дёргать `monitoring-logs-trigger` чаще, это тот же путь.

```ts
// src/inngest_app/functions/monitoring/logMonitor.ts (эскиз под SDK v4)
import { experiment } from 'inngest'

async ({ event, step, group }) => {
  const safeMode = isSafeMode(event)
  const logs = await step.run('read-logs', readLogs)

  const startedAt = Date.now()
  const { result: analysis, variant, experimentRef } = await group.experiment(
    'log-analysis-model',
    {
      variants: {
        deepseek: () => step.run('analyze-logs-deepseek', () => analyzeLogs(logs, 'deepseek-chat')),
        gpt4oMini: () => step.run('analyze-logs-gpt4o-mini', () => analyzeLogs(logs, 'gpt-4o-mini')),
      },
      // Пробы (/inngest_probe) не должны попадать в статистику эксперимента.
      select: safeMode ? experiment.fixed('deepseek') : experiment.weighted({ deepseek: 50, gpt4oMini: 50 }),
    }
  )

  // Оценки прямо в run: качество и производительность варианта.
  await step.score('score-json-valid', { name: 'json-valid', value: isLogAnalysisResult(analysis) })
  await step.score('score-latency-ms', { name: 'analyze-latency-ms', value: Date.now() - startedAt })
  await step.score('score-recommendations', { name: 'recommendations-count', value: analysis.recommendations.length })
  await step.score('score-status-agrees', {
    name: 'status-agrees-with-error-count',
    value: (analysis.errors.some(e => e.severity === 'high')) === (analysis.status === 'critical'),
  })

  const message = await step.run('generate-message', () => generateTelegramMessage(analysis))
  await step.run('send-notification', () => (safeMode ? skippedInSafeMode('send-notification') : sendTelegramNotification(message)))
  return { analysis, variant, experimentRef, safeMode }
}
```

Отложенная оценка — ту же трассу можно доосмыслить позже: если в админ-отчёт добавить две кнопки
«полезно / шум», обработчик кнопки вызывает
`inngest.score.experiment({ name: 'admin-useful', value: true, experiment: experimentRef, runId })`
с сохранёнными `experimentRef` и `runId`. Так вариант получает сигнал от человека, а не только
от структурных проверок.

### Как реализовать оценки: три вызова

```ts
// 1. Клиент: src/inngest_app/client.ts
import { scoreMiddleware } from 'inngest/experimental'
new Inngest({ id: 'telegram-bot-client', middleware: [scoreMiddleware()], /* ... */ })

// 2. step.score() — durable-оценка run'а; первый аргумент — ID шага, повтор не запишет дважды
await step.score('score-guard-pass', { name: 'guard-pass', value: passed })

// 3a. inngest.score() внутри step.run() — оценка привязывается к конкретному шагу в трассе
await step.run('generate-image', async () => {
  const out = await replicate.run(...)
  await inngest.score({ name: 'nsfw-flag', value: out.nsfw === true })
  return out
})

// 3b. inngest.score() снаружи функции — по runId (и опционально stepId), когда сигнал пришёл позже
await inngest.score({ name: 'user-feedback', value: 1, runId, stepId: 'generate-image' })
```

Значение — конечное число или boolean (boolean агрегируется как 0/1); строки, объекты, `NaN`
отвергаются. Оценки видны в трассе run'а/шага и как агрегаты на дашборде функции.

### Какие оценки имеют смысл для существующих функций

Три оси, как просили: качество результата, производительность, использование инструментов
(внешних API и шагов). Что уже есть в коде как данные — помечено; остальное потребует одной
строки в нужном шаге.

| Функция | Качество | Производительность | Использование инструментов |
|---|---|---|---|
| `monitoring-logs-analyze` | `json-valid` (bool), `status-agrees-with-error-count` (bool), `recommendations-count` | `analyze-latency-ms`, `source-is-fallback` (bool: ушли в `summarize-inngest-runs`) | `llm-tokens` из `usage` ответа, `llm-model` через имя эксперимента |
| `analytics-sales-advise` | `owners-reported / owners-total` (доля успешных `report-${ownerId}`) | длительность (сейчас 9.5 с медиана — базовая линия) | `payments-rows-loaded` |
| `analytics-skills-detect` | `skills-created`, `duplicates-skipped` | длительность | `services-scanned` |
| `training-stuck-check` | `stuck-found`, `retired-404` (bool за run) | длительность, `replicate-calls` | `completion-events-sent` |
| `monitoring-health-check` | `checks-passed / checks-total` (два шага: `check-api-health`, `check-inngest-health`, сейчас только `response.ok`) | `latency-ms` по каждой из двух проверок (сейчас не измеряется — добавить `Date.now()` вокруг `fetch`) | — |
| `neuro-image-generate` | `images-delivered / images-requested`, `nsfw-flag` (bool), позже `user-liked` отложенно с кнопки | `generate-latency-ms` на изображение, `queue-to-first-image-ms` | `replicate-cost-usd`, `retries-per-image` |
| `welcome-avatar-generate` | `hero-selected` (bool), `delivered` (bool) | `total-latency-ms` | `gift-slot-reserved` (bool) |
| `content-scripts-generate`, `content-detailed-script-generate` | `scripts-count`, `transcript-nonempty` (bool), позже `user-picked-script` отложенно | `transcribe-latency-ms`, `generate-latency-ms` | `whisper-seconds`, `llm-tokens` |
| `reels-ai-generate` / `reels-ai-callback` | `callback-received` (bool, отложенно из callback по `runId`), `video-url-valid` | `queued-to-callback-ms` | `provider` через bucket-эксперимент по `bot_name` |
| `payment-ai-server-process` | `amount-match` (bool — guard уже это считает) | — | — |
| `broadcast-message-send` | `delivered / targeted`, `blocked-by-user` | `messages-per-second` | — |
| Пробный сьют `/inngest_probe` | `probe-as-expected` (bool) — тот самый судья, но как оценка на run'е | `guard-latency-ms` (ожидание < 1 с) | — |

Что здесь спорно и требует решения владельца: оценки на платных функциях дадут пользу только
когда появится трафик; `user-liked`/`user-picked-script` меняют UX (кнопки под результатом).

### Спек-первое оформление

Когда обновление SDK будет разрешено, порядок такой: (1) карточкам `specs/functions/<ID>.t27`
добавить поля `EXPERIMENTS` (имя, варианты, стратегия, что делать в safe mode) и `SCORES` (имя,
тип, ось quality/perf/tools, где вычисляется); (2) генератор манифеста переносит их в
`functions.manifest.json`; (3) вкладка FUNCTIONS показывает объявленные оценки рядом с
`lastRun`/`lastProbe`; (4) `docs/inngest/probe-suite.md` фиксирует, что проба всегда идёт под
`experiment.fixed(...)` и не участвует в статистике. Ничего из этого пока не сделано.
