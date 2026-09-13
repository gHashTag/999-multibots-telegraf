# План улучшения Inngest-функций — 2026-09-13

Статус документа: план + отчёт о том, что уже исправлено в этой ветке. Источники:
четыре обзора в `docs/audit/review/` (по функциям и по практикам), прогон safe-probe
2026-09-13 (`docs/inngest/witness/2026-09-13-probe-suite-02-17Z.json`, 28/28 `match`),
журналы и переменные Railway, прочитанные через браузер владельца (значения секретов не
печатались; `docs/inngest/lessons/2026-09-13-supabase-key-role.md`).

Метки статуса: **[исправлено]** — код в этой ветке, есть тест; **[план]** — не трогали;
**[решение владельца]** — нужен выбор (снять с регистрации / реализовать / оставить);
**[не проверено]** — утверждение, для которого свидетельства нет.

## 1. Корневая причина «0 событий за 7 дней»

Не Inngest. В продакшене `SUPABASE_SERVICE_KEY` содержит JWT с ролью `anon`, а
`SUPABASE_SERVICE_ROLE_KEY` — `service_role`; `src/core/supabase/client.ts` брал первый по
имени. Под `anon` `storage.upload` в бакет `images` падал с
`new row violates row-level security policy`, `getUserPhotoUrl` возвращал `null`, и код до
`inngest.send('welcome-avatar-generate')` в `createUserScene.ts` не доходил. За 7 дней в журнале нет ни одной строки
`Welcome avatar generation triggered`: у новых пользователей с фото путь обрывался на RLS, у
пользователей без фото ветка пропускалась (точное число пользователей в этом документе не
фиксируется — подсчёт по журналу не сохранён). Проводка Inngest (base URL, event key, signing
key) на обеих службах согласована, ошибок отправки в журнале нет.

**[исправлено]** `selectSupabaseServiceKey()` выбирает ключ по роли внутри JWT, предупреждает,
если роль не `service_role`; `supabaseAdmin` использует тот же выбор. Переменные Railway не
менялись. **[не проверено]** эффект в продакшене до деплоя; были ли сломаны остальные
загрузки в storage через тот же клиент (`video.ts`, `uploadTelegramFile.ts`,
`voiceTrainingWizard`, `cleanupOldArchives.ts`); смысл предупреждающего бейджа «3» на
службе бота.

## 2. Исправлено в этой ветке (детерминированные дефекты)

| Функция | Дефект | Исправление | Тест |
|---|---|---|---|
| `reels-loop-generate` | `download-video-clips` вызывал `downloadFile(url)`, который возвращает `Buffer` и ничего не пишет на диск → шаг склейки всегда падал на отсутствующем файле | буфер записывается в `videoPath` | покрыто типами; отдельного теста нет |
| `analytics-sales-advise` | `!payments1d.includes(p)` сравнивал объекты из разных шагов по ссылке → «вчера» всегда равнялось всему 2-дневному окну | разбиение по `created_at` (`isBeforeYesterdayCutoff`) | `p0Fixes2026-09-13.test.ts` |
| `monitoring-logs-analyze` | путь по умолчанию `/tmp/logs` и фильтр по `"timestamp":"…"` не совпадали с логгером (`<cwd>/logs/combined.log`, формат `YYYY-MM-DD HH:mm:ss [LEVEL]:`) → файловая ветка мёртвая | `defaultLogDir()` = каталог логгера, `logLineTimestamp()` понимает оба формата | `p0Fixes2026-09-13.test.ts` |
| `reels-ai-generate` | `rateLimit {5/1m}` **отбрасывает** лишние события, а мастер уже списал баланс до отправки | `throttle` с теми же параметрами (ставит в очередь) | конфигурационное изменение; SDK v3 поддерживает `throttle` |
| все функции | ключ Supabase по имени переменной (см. §1) | выбор по роли JWT | `supabaseKeySelection.test.ts` |

Ограничение: `throttle` на self-hosted сервере Inngest **[не проверено]** в продакшене —
проверить после деплоя по первой генерации reels.

## 3. P0 по функциям — план

### Деньги (reserve → call → commit/refund)

* `neuro-image-generate` **[план]** — списание до генерации без возврата в `onFailure`;
  `processBalanceOperation` без `inv_id` → повтор шага = двойное списание. Нет продюсера в коде
  **[решение владельца]**: снять с регистрации или переписать на «резерв → генерация → фиксация»
  с `inv_id = event.id`.
* `training-model-start` **[план]** — манифест говорит `charges-balance`, код не списывает и не
  возвращает; `PENDING` с фиктивным id залипает для дедупа и watchdog. Вернуть списание из
  незарегистрированной копии `training/generateModelTraining.ts:643-930`, `catch` → `FAILED`.
* `training-model-v2-start` **[решение владельца]** — шаг `get-bot` сериализует `Telegraf` с
  токеном, БД пишется после платного API, у BFL-тренировки нет обработчика завершения.
  Предложение: снять с регистрации (`registerFunctions.ts`) до переделки.
* `payment-ai-server-process` **[план]** — нет CAS `status=PENDING` и сравнения `amount` с
  `IncSum` перед `COMPLETED` (`paymentProcessing.ts:191-218`). Это денежный путь: менять только
  со спекой и тестом на повтор webhook'а.
* `morph-images-generate` **[план]** — `video_url` = локальный путь, `sendVideo` получает строку;
  все пары в одном шаге. `sendVideo({ source })` или S3, шаг на пару, cleanup после доставки.
* `render-job-run` **[план]** — `sendCallback` глотает ошибки, `try/catch` в `render.ts` мёртв →
  «оплачено, не доставлено». `sendCallback` должен бросать; `mkdir -p`.

### Заглушки, которые стоят денег

* `instagram-reels-analyze`, `instagram-competitors-find` **[решение владельца]** —
  `saveReelsAnalysis` / `saveCompetitors` — заглушки (`src/core/instagram/index.ts:13-25`),
  функции отчитываются `saved: N`; до 12 платных вызовов RapidAPI на событие. Реализовать
  запись или снять с регистрации; классифицировать ошибки RapidAPI
  (`RetryAfterError` / `NonRetriableError`).
* `render-avatar-video-run` **[решение владельца]** — пайплайн на stub-сервисах
  (`hedra|heygen|elevenLabs|kieAI`). Не регистрировать до замены.
* `render-riddle-run` **[план]** — `trigger-render` шлёт `render/execute` без подписчика; таблица
  `render_servers` отсутствует. Соединить с Remotion `/render` или `step.sendEvent` на
  `render-job-run`; `step.sleep` в поллинге.

### Один большой шаг вместо многих маленьких

* `content-scenario-clips-generate` **[план]** — до 100 последовательных вызовов gpt-4 в одном
  `step.run`; повтор шага = повтор всех вызовов. Шаг на сцену, `concurrency` по пользователю,
  `retries: 1`, доставка архива пользователю, а не в `./output`.
* `broadcast-message-send` **[план]** — вся рассылка в одном шаге без батчей и обработки 429.
  Батчи по 25 через `step.run('send-batch-<firstId>')` + `step.sleep`, `RetryAfterError`,
  `concurrency` по `bot_name`.
* `reels-loop-generate` `generate-morphing-clips` **[план]** — N платных предсказаний в одном
  шаге с `do…while` без таймаута. Шаг на клип, `step.sleep` между опросами.

### Секреты в событиях

`reels-loop-generate`, `morph-images-generate`, `content-scripts-generate` **[план]** — `bot_token`
/ `openai_api_key` в payload события (видны в Inngest UI и трассах). Передавать `bot_name`,
ключи брать из env в шаге.

## 4. P1/P2 — сводка по группам

Полные списки с номерами строк: `docs/audit/review/group-a-generation.md` (P0 10 / P1 27 /
P2 14), `group-b-training-payments.md` (6 / 31 / 30), `group-c-content-monitoring.md`
(3 / 22 / 46). Повторяющиеся темы:

1. `onFailure` не возвращает деньги ни в одной функции с `charges-balance`.
2. `select('*')` и полные массивы копируются между шагами (размер шага, лимит 4 МБ на шаг).
3. Нет `idempotency` у `welcome-avatar-generate`; нет `concurrency` по ключу у
   `training-model-complete`, `training-stuck-check`, `broadcast-message-send`.
4. Уведомления об ошибке из `catch` внутри тела функции дублируются с `onFailure`.
5. `monitoring-health-check` шлёт каждый цикл, а не переходы состояния; нет `AbortSignal.timeout`.
6. `monitoring-error-report` не экранирует HTML в стеке/тексте LLM.
7. Валидация ответов LLM (`json_object` + схема) отсутствует в `content-*`.

## 5. Практики и конкуренты (из `docs/audit/review/best-practices.md`)

* Inngest: `step.run` — идемпотентный и маленький; `NonRetriableError` для плохого входа,
  `RetryAfterError` для 429; `onFailure` — единственное место для компенсации;
  `throttle` ставит в очередь, `rateLimit` отбрасывает, `debounce` схлопывает; `idempotency`
  — 24-часовой ключ по событию; `cancelOn` для отмены пользователем; `step.sleep` вместо
  `setTimeout`; секреты никогда не в payload.
* Платные операции: reserve → call → commit/release, `inv_id = event.id`, компенсация в
  `onFailure` после исчерпания `retries`.
* Конкуренты (Temporal, Trigger.dev, Hatchet, Restate, Upstash Workflow, DBOS): все дают
  durable steps; у Temporal и Restate сильнее сага/компенсация, у Trigger.dev — очереди по
  ключу и checkpoint-и; у Inngest — flow control из коробки и самый короткий путь на
  self-hosting. Смена платформы не предлагается: дефекты выше — в коде функций, не в оркестраторе.
* Эксперименты (`group.experiment()`) и scores (`step.score()`, `scoreMiddleware`) на
  self-hosted сервере **[не проверено]** — см. раздел в
  `docs/audit/inngest-functions-audit-2026-09-13.md`.

## 6. Порядок работ

1. Деплой этой ветки → проверить в Railway `[mirror] Файл переложен` и появление
   `welcome-avatar-generate` в `eventsV2`.
2. Решения владельца: `training-model-v2-start`, `instagram-*`, `render-avatar-video-run`,
   `neuro-image-generate` — снять или доделать.
3. Денежный контур одной серией PR со спеками в `gHashTag/t27` (`specs/functions/*.t27`,
   поле `NOTE` про flow control и компенсацию): `payment-ai-server-process` CAS + amount,
   `training-model-start` списание/возврат, `render-job-run` callback, `onFailure`-refund.
4. Разбиение больших шагов: `content-scenario-clips-generate`, `broadcast-message-send`,
   `reels-loop-generate`.
5. Секреты из payload; `idempotency` / `concurrency` по списку §4.

## 7. Что НЕ сделано и не проверено

* Продакшен-эффект всех исправлений — до деплоя.
* Безопасный прогон после этих правок не запускался повторно (28/28 относится к состоянию
  до правок; изменения не затрагивают guard-шаги).
* Денежные функции не менялись.
* Спеки `specs/functions/*.t27` в `gHashTag/t27` не обновлены под `throttle` у
  `reels-ai-generate` — в схеме спеки нет поля flow control; требуется отдельное решение
  (новое поле `FLOW_CONTROL` или запись в `NOTE`).
