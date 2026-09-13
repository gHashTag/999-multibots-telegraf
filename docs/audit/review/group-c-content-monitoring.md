# Ревью группы C — content / instagram / monitoring / analytics (2026-09-13)

Чек-лист: `docs/audit/review/CHECKLIST.md`. Только чтение кода. Все пути относительно корня репозитория.
Общий контекст, влияющий на несколько вердиктов:

- `src/core/instagram/index.ts:7-31` — `InstagramContentAgentDB` является **заглушкой** (`console.log`, возвращает `saved: data.length`). `src/core/instagram/database-validation.ts:27-35` — `validateProjectInStep`/`ensureProjectsTableExists` тоже заглушки. Это делает «db-write» у двух Instagram-функций фиктивным.
- `src/utils/logger.ts:171,184-190` — файловый лог пишется в `process.cwd()/logs/combined.log` в **printf-формате** (`2026-09-13 10:00:00 [INFO]: …`), без ротации (`maxsize` не задан). Это ломает оба режима чтения логов в `logMonitor.ts`.
- `src/utils/logger.ts:64-165` — `TelegramLogTransport`: каждый `logger.error(...)` уходит админу в Telegram (с троттлингом по отпечатку). Любой `logger.error` вне `step.run` повторяется при каждом replay тела функции.
- `src/inngest_app/registerFunctions.ts:7-11` — две analytics-функции созданы на клиенте `inngestClient.ts` (`id: 'vibee'`), остальные — на `client.ts` (`id: 'telegram-bot-client'`); serve использует `inngestClient`. Комментарий в файле называет это рабочим паттерном; проверить в проде не могу.
- Юнит-тесты: `src/inngest_app/test/unit/content-functions.test.ts:95` и `monitoring-test-functions.test.ts:163,330` — `describe.skip`, к тому же мокают несуществующие модули (`core/instagram-scraper`, `core/ai-service`) и проверяют другие ID шагов. Фактически из группы покрыт только хелпер `renderErrorText` (`src/__tests__/inngest/nonRetriableGuards.test.ts:108-130`).

---

## instagram-reels-analyze — src/inngest_app/functions/content/analyzeCompetitorReels.ts
Назначение: по `username` забрать рилсы конкурента через RapidAPI (платный), отфильтровать по дате, посчитать метрики, «сохранить» в `reels_analysis`.

Сильное: zod-валидация и проверка env в первом шаге с `NonRetriableError` (`:231-253`); safe-mode ранний выход до платного шага (`:256-260`); `concurrency: 2` (`:218`); `onFailure` → админ (`:220`); внутренний retry с экспоненциальной паузой (`:120-134`); оба имени события (канон + legacy) (`:223`).

Слабое:
- [P0] Результат платного вызова RapidAPI никуда не сохраняется: `db.saveReelsAnalysis` — заглушка (`src/core/instagram/index.ts:13-18`), но функция возвращает `reelsSaved: N` и `success: true` (`:394-404, :428-434`). Деньги за API потрачены, данные потеряны, отчёт лживый. Манифест `side_effects: db-write` не соответствует коду.
- [P1] Платный вызов повторяется без разбора причин: внутренний цикл 3 попытки (`:120-199`) × Inngest retries по умолчанию (в конфиге `retries` не задан, `:214-221`) = до 12 вызовов на одно событие. Ошибка уровня API (`typeof response.data.data === 'string'`, напр. «user not found») возвращает `success:false` → шаг бросает обычный `Error` (`:285-287`) и тоже ретраится. Нет `RetryAfterError` для 429 и `NonRetriableError` для 4xx.
- [P1] Полный массив рилсов (до 50 объектов RapidAPI с вложенными медиа-структурами) хранится как результат **трёх** шагов подряд: `call-instagram-reels-api` (`:290`), `filter-reels-by-date` (`:319-323`), `calculate-metrics` (`:359-365`). Тройное копирование тяжёлого payload в состояние Inngest.
- [P2] `send-telegram-notification` — TODO с фиктивным `{ sent: true, messageId: 'mock-message-id' }` (`:419-423`); наружу уходит «уведомление отправлено».
- [P2] `setTimeout(3000)` внутри шага «против rate limit» (`:277`) — задержка внутри шага вместо `step.sleep`, при retry шага повторяется.
- [P2] Логи через `console.log` с префиксом, не через `logger`; `runId` только в первой строке (`:40-47, :225-228`); в handler `logger` деструктурирован и не используется (`:224`); `AnalyzeReelsEventPayload` импортирован и не используется (`:16-19`).
- [P2] `triggerAnalyzeCompetitorReels` шлёт legacy-событие `instagram/analyze-reels`, а не канон (`:478-481`).

Предложение:
1. Либо реализовать `InstagramContentAgentDB.saveReelsAnalysis` (upsert по `reel_id`+`project_id`), либо снять функцию с регистрации до реализации — сейчас это платный no-op.
2. В `getUserReels` различать статус: 429 → `RetryAfterError` с `Retry-After`, 4xx/«API error: …» → `NonRetriableError`; убрать внутренний цикл (пусть ретраит Inngest) и задать `retries: 2`.
3. Оставлять в результате шага только нужные поля (`id, shortcode, caption, play_count, like_count, comment_count, taken_at_timestamp`) и не возвращать массив повторно из `filter`/`calculate` — слить эти два шага в чистую функцию вне `step.run`.

Не проверено: реальная стоимость и лимиты RapidAPI-плана; реальный формат ответа `/v1/user_reels`.

---

## instagram-competitors-find — src/inngest_app/functions/content/findCompetitors.ts
Назначение: по `username_or_id` получить похожих авторов через RapidAPI `similar_users_v2`, отфильтровать по подписчикам, «сохранить» в `competitors`.

Сильное: то же, что у `instagram-reels-analyze`: zod + env-guard с `NonRetriableError` (`:157-179`), safe-mode до платного шага (`:182-186`), `concurrency: 2` (`:141`), `onFailure` (`:143`).

Слабое:
- [P0] `db.saveCompetitors` — заглушка (`src/core/instagram/index.ts:20-25`); функция отчитывается `competitorsSaved` (`:270-280, :309`) при нулевой реальной записи. Платный вызов без результата.
- [P1] До 12 платных вызовов при стойкой ошибке (внутренний retry `:61-131` × Inngest retries по умолчанию `:136-144`), без `RetryAfterError`/`NonRetriableError` по коду ответа; в отличие от reels-версии здесь даже не проверяется «строковая» ошибка в `data` — любой ответ считается успехом (`:103-107`).
- [P1] Полный список пользователей хранится результатом двух шагов: `call-instagram-api` (`:214`) и `filter-by-followers` (`:221-225, :238-242`); при `min_followers` не заданном второй шаг просто копирует массив.
- [P2] `send-telegram-notification` — мок (`:294-298`).
- [P2] `setTimeout(2000)` внутри шага (`:201`).
- [P2] `console.*` вместо `logger`; неиспользуемые импорты (`:14-16`) и `logger` в контексте (`:150`); `triggerFindCompetitors` шлёт legacy-имя (`:342-345`).

Предложение:
1. Реализовать `saveCompetitors` (upsert по `query_username`+`comp_username`+`project_id`) или снять функцию.
2. Классифицировать ошибки API (429 → `RetryAfterError`, 4xx → `NonRetriableError`), убрать внутренний цикл, `retries: 2`.
3. Слить `filter-by-followers` в чистую функцию; из `call-instagram-api` возвращать только `{username, followers_count, category, biography, full_name, profile_url, is_verified}`.

Не проверено: формат ответа `similar_users_v2` (есть ли строковые ошибки в `data`).

---

## instagram-top-content-extract — src/inngest_app/functions/content/extractTopContent.ts
Назначение: выбрать из `reels_analysis` топ-рилсы по просмотрам за `days_back`, посчитать engagement и собрать текстовый отчёт.

Сильное: `parseEventData` → `NonRetriableError` на схеме (`:47-51`); только чтение БД — платных/исходящих эффектов нет, safe-mode не нужен; результат ограничен `limit`.

Слабое:
- [P1] Ошибка `supabase` в `query-top-reels` бросается обычным `Error` (`:69-71`) → retries по умолчанию; для транзиентных ошибок БД это оправдано, но нет `retries` в конфиге и `onFailure` — падение видно только в дашборде (манифест `on_failure: log`).
- [P2] Шаги `process-reels` (`:77-86`) и `format-report` (`:89-91`) — чистые вычисления над уже полученными данными; каждый — лишний round-trip и повторное хранение массива рилсов в состоянии.
- [P2] `days_back` и `limit` без верхней границы (`:10-11`) → `.limit(input.limit)` может выгрузить всю таблицу в результат шага.
- [P2] Отчёт всегда озаглавлен «ТОП-10» независимо от `limit` (`:118`); при `caption === null` печатается `undefined...` (`:122`).
- [P2] Функция читает таблицу, в которую `instagram-reels-analyze` фактически не пишет (заглушка) — при текущем коде отчёт всегда пуст.
- [P2] Манифест `side_effects: ['db-write']` — в коде только `select` (`:55-67`); фактически `db-read`.

Предложение:
1. Убрать `process-reels`/`format-report` из `step.run` (оставить одним шагом чтение), добавить `.max(365)` / `.max(100)` в схему.
2. Добавить `onFailure: createInngestFailureHandler(...)` и `retries: 2`.
3. Исправить заголовок и `caption ?? ''`.

Не проверено: используется ли отчёт где-то далее (кто читает результат функции).

---

## content-scripts-generate — src/inngest_app/functions/content/generateContentScripts.ts
Назначение: по `reel_id` достать рилс, «извлечь аудио», «транскрибировать» через Whisper, сгенерировать 3 сценария GPT-4, сохранить в `content_scripts`.

Сильное: `parseEventData` (`:61-65`), safe-mode до шагов (`:68-73`), `onFailure` (`:52`), шаги линейны и по смыслу.

Слабое:
- [P1] Вся «AI-часть» — заглушки: `extractAudioFromInstagramUrl` возвращает `${igUrl}/audio.mp3` (`:154-163`), `transcribeAudio` — константную строку (`:165-185`), `generateAlternativeScripts` — шаблонные строки, промпт собирается и не используется (`:187-230`). При этом результат **реально записывается** в прод-таблицу `content_scripts` (`:232-246`) и возвращается `success: true` (`:134-149`). В БД попадает фиктивный контент под видом настоящего.
- [P1] `openai_api_key` принимается в payload события (`:13, :98, :107`) — секрет пользователя хранится в событии Inngest и попадает в `eventData` лога onFailure (`client.ts:181-183`).
- [P1] «Reel not found» бросается обычным `Error` (`:84-86`) → до 4 попыток (retries не задан) для условия, которое не лечится ретраем; аналогично «OpenAI API key is required» (`:99-101, :108-110`).
- [P2] `save-scripts` — plain insert без ключа идемпотентности (`:235-239`): при retry шага после успешного insert, но потерянного ответа, будет дубль.
- [P2] Нет `concurrency`; при реальной реализации — платные Whisper+GPT-4 без ограничения параллелизма.
- [P2] Манифест `side_effects: paid-api` — в коде платного вызова нет (`new OpenAI` создаётся и не используется, `:170-172, :193-195`).

Предложение:
1. До реализации транскрипции/генерации не регистрировать функцию или явно помечать сохранённые строки `is_mock: true` — иначе БД засоряется фейком.
2. `Reel not found` и отсутствие ключа → `NonRetriableError`; убрать `openai_api_key` из схемы (ключ только из env).
3. При реализации: `retries: 2`, `concurrency: { key: 'event.data.project_id', limit: 1 }`, `insert` с `onConflict(reel_id, project_id)`.

Не проверено: есть ли отправитель события с `openai_api_key` (grep не нашёл в `src` вне тестов/фикстур).

---

## content-detailed-script-generate — src/inngest_app/functions/content/generateDetailedScript.ts
Назначение: создать запись `detailed_scripts`, сгенерировать N сцен (пресет CREATION либо GPT-4 JSON), сохранить сцены и статус `COMPLETED`.

Сильное: `parseEventData` (`:209-213`), safe-mode до записи в БД и платного вызова (`:216-220`), `concurrency: [{limit: 3}]` (`:198`), `onFailure` (`:200`), пресет без LLM для `theme=CREATION` (`:267-321`), fallback на парсинг (`:398-434`).

Слабое:
- [P1] Деньги: `gpt-4` без `response_format`, без `max_tokens`, без таймаута клиента (`:344-354`); ответ парсится `JSON.parse` «как есть» (`:357-359`) — Markdown-обёртка ```json или объект вместо массива уводят в fallback **молча**, при этом запись помечается `COMPLETED` (`:447-449`). Платный вызов сделан, пользователь получает шаблонные сцены без сигнала об этом.
- [P1] Ретраи по умолчанию (retries не задан, `:193-201`) на шаге `generate-detailed-scenes` → до 4 платных вызовов GPT-4 при 401/429/quota; нет `RetryAfterError`/`NonRetriableError`.
- [P1] Запись создаётся до генерации со `status: 'PROCESSING'` (`:226-252`); при исчерпании ретраев `onFailure` (`client.ts:160-223`) статус не меняет → «вечный PROCESSING» без компенсирующего шага.
- [P2] `requester_telegram_id` обязателен (`:21`), сохраняется (`:231`), но пользователю ничего не отправляется — результат доступен только по возврату функции.
- [P2] Тема `CREATION` содержит 4 сцены (`:100-188`); при `scene_count > 4` тихо вернётся 4 (`:268-271`) при `scene_count` в записи = запрошенному.
- [P2] `project_id: z.number()` (`:20`) против `z.string()` в `generateScenarioClipsSchema` (`src/interfaces/scenario-clips.interface.ts:73`) — несовместимые контракты у соседних функций.
- [P2] `concurrency` без ключа — глобальный лимит 3, один пользователь может занять все слоты.

Предложение:
1. `response_format: { type: 'json_object' }`, `max_tokens`, `timeout` в `new OpenAI({...})`; валидировать ответ zod-схемой сцены; при fallback помечать `status: 'COMPLETED_FALLBACK'` или `metadata.source='fallback'`.
2. `retries: 2`; в шаге — 429 → `RetryAfterError`, 401/400/insufficient_quota → `NonRetriableError`.
3. В `onFailure` (или обёртке) переводить запись `detailed_scripts` в `FAILED` по `event.data`+`runId`; для этого возвращать `scriptRecord.id` раньше или писать `run_id` в запись.

Не проверено: схема таблицы `detailed_scripts` (есть ли уникальность/индексы).

---

## content-scenario-clips-generate — src/inngest_app/functions/content/generateScenarioClips.ts
Назначение: создать запись `scenario_clips`, сгенерировать `scene_count × variants_per_scene` текстовых сценариев GPT-4, собрать HTML+XLSX+ZIP в `./output`, обновить запись.

Сильное: `parseEventData` (`:238-242`), safe-mode до БД и LLM (`:245-249`), `onFailure` (`:229`), `max_tokens: 800` (`:402`), защита `output.on('error')` в архиваторе с внятным комментарием (`:1135-1142`), архивирование в отдельном шаге с мягкой деградацией (`:563-569`).

Слабое:
- [P0] Деньги: до 100 (20×5, `interface.ts:77-78`) **последовательных** платных вызовов `gpt-4` внутри **одного** шага `generate-detailed-scenes` (`:338-467`). Шаг не идемпотентен: любой сбой/таймаут шага после N-го вызова → retry шага с нуля; retries по умолчанию → до 4 × 100 вызовов на одно событие. При этом отказ каждого отдельного вызова ловится и заменяется шаблоном (`:428-458`) — падение ключа/квоты даёт 100 «fallback»-сценариев и `COMPLETED`.
- [P1] Нет `concurrency`/`rateLimit`/`throttle` (`:224-230`) — самая дорогая функция группы без ограничений; два события от одного пользователя дают 200 параллельных вызовов.
- [P1] Артефакты пишутся на локальный диск `./output` (`:508, :976-980, :1096-1100, :1115-1116`), пути сохраняются в БД (`:582-590`); пользователю ничего не отправляется (ни `sendDocument`, ни событие). На эфемерном хосте архив исчезает при редеплое — «результат» недостижим.
- [P1] Запись `PROCESSING` до генерации (`:256-293`); при провале после ретраев остаётся навсегда (см. detailed-script). `update-scenario-record` глотает ошибку БД и возвращает `success: true` (`:599-609`).
- [P2] Результат шага `generate-detailed-scenes` — до 100 текстов по 150–300 слов + метаданные (`:497`), затем то же в `generated_scenes` (`:581`) и в возврате функции (`:634`). Порядка сотен КБ на состояние одного run.
- [P2] `total_cost_stars` рассчитывается (`:262-264`) и пишется в запись, но никакого списания баланса нет — «стоимость» декоративная; манифест не помечает `charges-balance`, что корректно, но поле в БД вводит в заблуждение.
- [P2] `Date.now()` для замера (`:357, :408`) и имён файлов (`:976, :1096, :1115`) — внутри шагов, корректно; `processingTime` (`:577-578`) считается внутри шага — тоже корректно. Отмечено как проверенное, не как проблема.

Предложение:
1. Разбить генерацию: один `step.run(\`scene-${sceneIndex+1}-variant-${variantIndex+1}\`)` на вызов (ключ стабилен — индексы фиксированы входом), либо батч по сцене; так retry повторяет только упавший вызов. Добавить `retries: 1`, `concurrency: { key: 'event.data.requester_telegram_id', limit: 1 }`, `throttle` по функции.
2. Не подменять ошибку LLM шаблоном молча: 429 → `RetryAfterError`, 401/квота → `NonRetriableError`; fallback только с явным `status: 'PARTIAL'`.
3. Загружать ZIP в хранилище (Supabase Storage) и отправлять пользователю `sendDocument` отдельным шагом с `safeRecipient`; в `onFailure`/финальном шаге переводить запись в `FAILED`.

Не проверено: содержимое `TextScenarioReportGenerator` (`:660-1105`) на HTML-инъекции; фактическая политика хранения `./output` на хосте.

---

## monitoring-error-report — src/inngest_app/functions/monitoring/criticalErrorMonitor.ts
Назначение: по событию `monitoring/error.report` проанализировать ошибку LLM (DeepSeek/GPT), отформатировать и отправить админу.

Сильное: `retries: 1` (`:220`); `renderErrorText`/`renderErrorStack` покрыты тестом (`nonRetriableGuards.test.ts:108-130`); `response_format: json_object`, `max_tokens: 800`, `temperature: 0.3` (`:121-123`); fallback-анализ при сбое LLM (`:127-138`); safe-mode закрывает и LLM, и отправку (`:253-265, :281`); `onFailure` (`:222`).

Слабое:
- [P1] HTML `parse_mode` без экранирования: `errorContext.error` в `<code>` (`:159`) и стек в `<pre>` (`:169`), а также LLM-текст `analysis.analysis/solution` (`:164-166`). Любой `<` в тексте ошибки (типичный `Expected <T>`, HTML-ответы 502) → Telegram 400 «can't parse entities» → `send-notification` бросает (`:208-211`) → retry с тем же текстом → падение → onFailure. Монитор ошибок падает на ошибках.
- [P2] `logger.error('Critical error detected:', …)` вне `step.run` (`:248`) — выполняется при каждом replay тела (≈5 раз на run) и через `TelegramLogTransport` сам шлёт админу; спасает только троттлинг по отпечатку (`logger.ts:139-151`). Двойной канал доставки одного инцидента.
- [P2] `GROUP_CHAT_ID === ADMIN_TELEGRAM_ID` (`:47-48`) → при `urgency: 'immediate'` два сообщения в один чат (`:193-205`); хардкод `'144022504'` как дефолт.
- [P2] Нет схемы события (`guard: none`): `event.data.error` при `data === undefined` → TypeError вне шага (`:227-237`) → retry бессмысленного условия.
- [P2] `urgencyEmoji[analysis.urgency]` для значения вне enum от LLM → `undefined` в тексте (`:151-157`); `JSON.parse` без валидации структуры (`:126`).
- [P2] `log-for-analysis` — шаг ради одной строки лога (`:286-292`); в `src` нет отправителей `monitoring/error.report`/`app/error.critical` кроме маппинга в `mcp-server.ts:473` — функция практически мёртвая.
- [P2] Нет таймаута у OpenAI-клиента (`:58-63`) — дефолт SDK 10 мин на шаг.

Предложение:
1. Экранировать `<>&` во всех пользовательских/LLM-фрагментах перед HTML (общий `escapeHtml`), либо `parse_mode` не использовать.
2. zod-схема `{error, stack?, endpoint?, userId?, timestamp?, severity?}` через `parseEventData`; перенести `logger.error` внутрь первого шага или заменить на `logger.warn`.
3. Задать `timeout` у OpenAI-клиента и валидировать `urgency` (`['immediate','high','normal'].includes(...)`).

Не проверено: используется ли событие из других репозиториев (ai-server).

---

## monitoring-health-check — src/inngest_app/functions/monitoring/criticalErrorMonitor.ts (`:305-401`)
Назначение: cron `*/30 * * * *` — `GET /health` основного API и Inngest, при проблемах сообщение админу.

Сильное: два лёгких `fetch` раз в 30 мин — нагрузка пренебрежимо мала; ошибки `fetch` перехвачены внутри шагов, результаты детерминированно агрегируются из мемоизированных шагов (`:317-371`); отправка только при проблеме и в отдельном шаге (`:374-391`); поправка `BASE_WEBHOOK_URL` с объяснением прошлой ложной тревоги (`:322-331`).

Слабое:
- [P1] Нет дедупликации/подавления: пока сервис нездоров, сообщение уходит каждые 30 минут (до 48/сутки) без «всё ещё down с HH:MM» и без «восстановлено» (`:374-391`). Cron-функция без `rateLimit`/`debounce` и без хранения предыдущего состояния.
- [P2] Проверка тавтологична: `/health` собственного процесса вызывается из этого же процесса, а Inngest-cron не сработает, если Inngest недоступен. Сигнал «Main API down» возможен только при живом процессе с падающим `/health`.
- [P2] `fetch` без таймаута (`:326-331, :352-354`) — на зависшем сокете шаг висит до дефолта undici; `retries: 2` тогда утраивает ожидание.
- [P2] `retries: 2` при `on_failure: log` — единственное, что может упасть, это `getMonitoringBot()` без токена (`monitoringBot.ts:63-75`) — не лечится ретраем.
- [P2] Одновременно с `training-stuck-check` (`checkStuckTrainings.ts:79`, тот же `*/30`) — совпадение по минутам, но обе лёгкие; суммарная нагрузка не выглядит проблемой по коду.

Предложение:
1. Хранить последний статус (таблица/kv или `step.run` с чтением предыдущего run через GraphQL-статус) и слать только переходы healthy↔unhealthy плюс напоминание не чаще раза в N часов.
2. `fetch(url, { signal: AbortSignal.timeout(5000) })`; `retries: 0`.
3. Проверять внешний URL (через `BASE_WEBHOOK_URL` — уже так) и опционально БД (`select 1`), чтобы проверка имела смысл.

Не проверено: значение `BASE_WEBHOOK_URL`/`INNGEST_BASE_URL` в проде.

---

## monitoring-logs-analyze — src/inngest_app/functions/monitoring/logMonitor.ts (`:564-600`)
Назначение: cron `0 10 * * *` — прочитать `combined.log` за 24 ч, проанализировать LLM, иначе — сводка Inngest-run'ов через GraphQL; отчёт админу.

Сильное: отсутствие файла обработано (`existsSync`, `:78-81`) и заменено содержательным fallback по GraphQL с 5-с таймаутом (`:375-476`, `inngestGraphql.ts:140,154`); общий pipeline с trigger-функцией (`:494-561`); safe-mode для LLM и отправки (`:522-528, :545-551`); `response_format: json_object`, `max_tokens: 2000`, обрезка до 50 КБ (`:87, :180-182`); fallback `basicLogAnalysis` при сбое LLM (`:187-192`); `Math.random` только внутри шага (`:327`).

Слабое:
- [P1] Ветка чтения файла мёртвая дважды: (а) путь `LOG_DIR || '/tmp/logs'` (`:69, :75`) не совпадает с местом записи логгера `process.cwd()/logs` (`logger.ts:171`); (б) даже при совпадении `filterLast24Hours` ищет JSON-ключ `"timestamp":"…"` (`:103`), а логгер пишет printf-строки `YYYY-MM-DD HH:mm:ss [LEVEL]: …` (`logger.ts:184-190`) → фильтр всегда возвращает `''`, `basicLogAnalysis` ищет `"level":"error"` (`:198-200`) — тоже никогда. Итог: LLM-анализ реальных логов не выполняется никогда; всегда GraphQL-fallback (что скрывает проблему хорошим отчётом).
- [P1] `readFileSync` всего `combined.log` в память (`:85`) при отсутствии ротации у `transports.File` (`logger.ts:215-217`) — при исправлении пути ежедневный пик памяти пропорционален размеру файла за всё время.
- [P1] Ответ LLM приводится `as LogAnalysisResult` без валидации (`:185-186`); `generateTelegramMessage` обращается к `analysis.errors.length`, `analysis.statistics`, `analysis.recommendations.length` (`:260, :278, :301`) — пропущенное поле → TypeError в `generate-message` → 2 ретрая → onFailure.
- [P2] HTML без экранирования LLM-текста (`:254-337`) → возможный 400 от Telegram; `message.includes('🚨')` как признак критичности (`:352`) при `GROUP_CHAT_ID === ADMIN_TELEGRAM_ID` (`:17-18`) → дубль в тот же чат.
- [P2] Нет таймаута у OpenAI-клиента (`:28-33`); `gpt-4-turbo-preview` — устаревший alias.
- [P2] Совпадает по времени с `analytics-skills-detect` (`0 10 * * *`).

Предложение:
1. Читать `LOG_DIR` из одного места (экспорт из `logger.ts`) и парсить printf-формат (регэксп `^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) \[(\w+)\]:`), либо переключить файловый транспорт на `format.json` + `maxsize/maxFiles`.
2. Читать хвост файла потоково (последние N МБ), не весь файл.
3. zod-схема `LogAnalysisResult` с дефолтами `[]`/`{}` после `JSON.parse`; `escapeHtml` для всех вставок.

Не проверено: задан ли `LOG_DIR` в проде; формат `combined.log` на хосте (по коду — printf).

---

## monitoring-logs-trigger — src/inngest_app/functions/monitoring/logMonitor.ts (`:603-631`)
Назначение: ручной запуск того же pipeline по событию `monitoring/logs.trigger`.

Сильное: переиспользует `runLogMonitorPipeline` (`:615-618`) — все safe-mode-гарантии наследуются; `retries: 1` (`:608`); `onFailure` (`:609`).

Слабое:
- Наследует все P1/P2 из `monitoring-logs-analyze` (мёртвая файловая ветка, невалидированный LLM-ответ, HTML без экранирования).
- [P2] Нет схемы события; `event.data.userId` читается через `as any` (`:627`); нет `rateLimit` — ручное событие можно послать N раз и получить N платных анализов + N отчётов (в safe-mode — ноль, но без `e2e_test` — все).
- [P2] Одинаковые ID шагов с cron-версией не проблема (разные функции), но манифест перечисляет и `summarize-inngest-runs`, и `analyze-logs`, хотя выполняется ровно один из них (`:511-532`) — стоит пометить как взаимоисключающие.

Предложение:
1. `rateLimit: { limit: 1, period: '10m' }` или `debounce` на функцию.
2. Минимальная zod-схема `{ userId?: string }`.

Не проверено: откуда посылается событие (бот-команда/MCP).

---

## analytics-sales-advise — src/inngest_app/functions/analytics/dailySalesAdvisor.ts
Назначение: cron `0 9 * * *` — по `avatars` собрать владельцев ботов, выгрузить `payments_v2` за 7/1/2 дня, каждому владельцу отправить отчёт с рекомендациями.

Сильное: динамические ID `report-${ownerId}` по стабильному ключу `telegram_id` (`:90-91`) — порядок Map не влияет; отправка внутри шага → при retry (`retries: 1`, `:60`) уже отправленные отчёты не дублируются; `safeRecipient` с явным комментарием о прошлом инциденте «13 владельцам» (`:245-256`); разбиение на части ≤4000 (`:20`); `onFailure` (`:62`); пагинация выгрузки (`:30-48`).

Слабое:
- [P1] Ошибка расчёта «вчера»: `!payments1d.includes(p)` (`:113`) сравнивает по ссылке объекты из **двух разных** результатов шагов (десериализованы независимо) → всегда `true` → `inc_prev` = доход за 48 ч, а не за «вчера». `trend` (`:150-154`) и рекомендация «Выручка падает» (`:221-225`) систематически искажены; владельцы получают неверные цифры.
- [P1] Размер результата шага: `load-payments-7d` возвращает **все** строки `payments_v2` за 7 дней по всем ботам (`:80-82`), плюс `1d` и `2d` — те же данные ещё дважды (`:83-88`). При росте платежей это десятки тысяч строк в состоянии Inngest (лимит на результат шага) и утечка данных всех владельцев в один run.
- [P2] `getRecentPayments` пагинирует `.range()` без `.order()` (`:35-41`) — без стабильной сортировки страницы могут дублировать/пропускать строки.
- [P2] `sendTelegram` глотает любые ошибки `.catch(() => {})` (`:26`) и после этого пишется «Report sent» (`:258-263`) — 403 «bot was blocked»/владелец не стартовал `BOT_TOKEN_1` невидимы. Отчёт всем владельцам уходит от бота №1 (`:18`), а не от их собственного бота.
- [P2] `avatars` с `telegram_id = null` дадут шаг `report-null` (`:75`); нет фильтра.
- [P2] Метрики смешаны: `payingUsersWeek` собран из `inc1d` (`:139-141`), `avgCheck` = доход 24 ч / плательщики 24 ч, «Конверсия» = плательщики 1 д / уникальные 7 д (`:155-160`) — подписи «неделя» не соответствуют.
- [P2] `USD_RUB = 91` захардкожен (`:8`); функция на клиенте `inngestClient` (`:1`), тогда как `createInngestFailureHandler` — из `client.ts` (`:2`).

Предложение:
1. Заменить `includes(p)` на фильтр по времени: `new Date(p.created_at) < since1d` (или загрузить один раз 7 дней и резать по датам в памяти) — убрать шаги `1d`/`2d` вовсе.
2. Агрегировать внутри шага и возвращать компактную структуру `{ [bot_name]: { rev1d, revPrev, cost7d, svcUsage, users } }`, а не сырые строки; либо `select` с агрегатами/RPC.
3. Возвращать из `sendTelegram` статус ответа и логировать неуспех (`ok:false`, `description`); добавить `.order('created_at')` в пагинацию.

Не проверено: объём `payments_v2` за 7 дней в проде; лимит размера результата шага в используемом плане Inngest.

---

## analytics-skills-detect — src/inngest_app/functions/analytics/skillDetector.ts
Назначение: cron `0 10 * * *` — по `bot_skills_log` найти повторяющиеся паттерны (≥10 успешных генераций) и создать `bot_skills`, уведомить админа.

Сильное: `detect-${serviceType}` по стабильному ключу (`:49-50`); дедуп по `service_type::model::prefix` с согласованным `substring(0,50)` (`:45`, `skillManager.ts:45`); `totalCreated` агрегируется детерминированно из мемоизированных шагов (`:75`); уведомление только при `totalCreated > 0` в отдельном шаге (`:78-89`); `retries: 1`.

Слабое:
- [P1] Нет safe-mode: функция пишет в `bot_skills` и шлёт админу вне зависимости от `e2e_test`/`INNGEST_SAFE_MODE` (`:30-37`), при этом манифест ожидает `probe_expect: COMPLETED` — проба создаёт реальные скиллы. Также нет `onFailure` (`on_failure: log`).
- [P2] `detectSkillCandidate` берёт 5000 последних строк без окна по дате (`skillManager.ts:64-70`) — один и тот же набор кандидатов ежедневно; деактивированный скилл (`is_active=false`) исчезает из `listSkills` (`skillManager.ts:145`) и будет пересоздан на следующий день.
- [P2] Все ошибки БД проглочены в `skillManager` (`:96-100, :133-136, :151-152`) → функция всегда `success: true`, даже если ни один запрос не прошёл.
- [P2] `sendTelegram` глотает ошибки (`:27`); `ADMIN_TELEGRAM_ID` парсится через `split(',')[0]` (`:80`) — в `criticalErrorMonitor.ts:47` та же переменная используется целиком: несогласованность формата.
- [P2] Совпадает по времени с `monitoring-logs-analyze` (`0 10 * * *`).

Предложение:
1. Добавить `isSafeMode(event)` → пропуск `createSkill` (возвращать `skippedInSafeMode`) и уведомления; добавить `onFailure`.
2. Окно по дате в `detectSkillCandidate` (напр. 30 дней) и учёт неактивных скиллов в дедупе (`listSkills({ includeInactive: true })`).
3. Возвращать из шагов счётчики ошибок из `skillManager`, чтобы «0 создано» отличалось от «БД недоступна».

Не проверено: объём `bot_skills_log`; есть ли уникальный индекс на `bot_skills(service_type, model, prompt_template)`.

---

## Сводная таблица

| id | P0 | P1 | P2 | Главное предложение |
|---|---|---|---|---|
| instagram-reels-analyze | 1 | 2 | 4 | Реализовать `saveReelsAnalysis` (сейчас заглушка — платный no-op) или снять с регистрации; классифицировать ошибки RapidAPI (`RetryAfterError`/`NonRetriableError`), убрать внутренний retry-цикл |
| instagram-competitors-find | 1 | 2 | 3 | То же: реализовать `saveCompetitors` или снять; классификация ошибок; не копировать полный массив в двух шагах |
| instagram-top-content-extract | 0 | 1 | 6 | Убрать чистые вычисления из `step.run`, ограничить `limit`/`days_back`, добавить `onFailure` |
| content-scripts-generate | 0 | 3 | 3 | Не писать mock-сценарии в прод-таблицу; `NonRetriableError` для «Reel not found»; убрать `openai_api_key` из payload |
| content-detailed-script-generate | 0 | 3 | 4 | `json_object` + валидация ответа, явный статус fallback; `retries: 2` и классификация 429/401; `FAILED` при провале вместо вечного `PROCESSING` |
| content-scenario-clips-generate | 1 | 3 | 2 | Разбить 100 LLM-вызовов на отдельные шаги, `concurrency` по пользователю, `retries: 1`; доставлять архив пользователю, а не в `./output` |
| monitoring-error-report | 0 | 1 | 6 | Экранировать HTML во всём тексте (ошибка/стек/LLM); zod-схема события; `logger.error` внутрь шага |
| monitoring-health-check | 0 | 1 | 4 | Слать только переходы состояния (дедуп), `AbortSignal.timeout(5000)`, `retries: 0` |
| monitoring-logs-analyze | 0 | 3 | 3 | Согласовать путь и формат логов с `logger.ts` (сейчас файловая ветка мёртвая); читать хвост потоково; валидировать ответ LLM |
| monitoring-logs-trigger | 0 | 0 (наследует 3) | 2 | `rateLimit`/`debounce` на ручной триггер; мини-схема события |
| analytics-sales-advise | 0 | 2 | 5 | Заменить `includes(p)` на фильтр по дате; возвращать агрегаты вместо сырых строк `payments_v2`; логировать ответ Telegram |
| analytics-skills-detect | 0 | 1 | 4 | Добавить safe-mode (пропуск записи/уведомления) и `onFailure`; окно по дате в детекторе |
| **Итого** | **3** | **22** | **46** | |
