# Ревью Inngest-функций — группа A (генерация)

Дата: 2026-09-13. Режим: только чтение кода. Формат — по `docs/audit/review/CHECKLIST.md`.
Утверждения ниже относятся к коду в репозитории, не к поведению в проде.

Общий контекст, который повторяется у всех функций:

- `onFailure` везде создаётся через `createInngestFailureHandler` (`src/inngest_app/client.ts`): только лог + Telegram админу. Ни в одном `onFailure` нет возврата средств.
- `processBalanceOperation` (`src/price/helpers/processBalanceOperation.ts:135`) при нехватке средств вызывает `ctx.telegram.sendMessage`; из Inngest `ctx` не передаётся → `TypeError`, перехваченный на строке 205, возвращается как `success:false` с сырым текстом ошибки. Списание идёт через `updateUserBalance` (строки 169–181) без ключа идемпотентности: `inv_id` по умолчанию `sys-${Date.now()}-${telegram_id}` (`src/core/supabase/updateUserBalance.ts`), то есть повторное исполнение шага = второе списание.
- Safe mode: `isSafeMode(event)` = `INNGEST_SAFE_MODE` или `data.e2e_test === true` (`src/inngest_app/safeMode.ts`).

---

## neuro-image-generate — `src/inngest_app/functions/generation/neuroImageGeneration.ts`

Назначение: списать звёзды и сгенерировать N нейро-изображений через Replicate, отправить их пользователю. По комментарию в шапке (строки 27–45) у функции нет отправителя в боевом коде; живой путь — `neuroPhotoWizard → generateNeuroPhotoHybrid`.

Сильное: `check-user` бросает `NonRetriableError` (98); safe mode обрывает ДО списания (164–171); per-image шаги с индексными id `generate-image-${i}` / `notify-image-${i}` (239, 329); `retries: 3`, `onFailure` объявлен; есть тест `chargedGenerationFailureIsHonest.test.ts`, фиксирующий честное сообщение о списании, и `neuroImageDoubleCharge.test.ts`, ловящий второе списание.

Слабое:
- [P0] Списание до генерации без возврата: `process-payment` (173–224) снимает `totalCost` через `processBalanceOperation`; при падении генерации catch (400–456) лишь пишет пользователю, что звёзды списаны (418). Деньги ушли, результата нет, компенсации в коде нет.
- [P0] Списание не идемпотентно: `processBalanceOperation` не получает `inv_id`/`operation_id` → повтор шага `process-payment` (сеть/таймаут после успешного UPDATE) = двойное списание (`processBalanceOperation.ts:169–181`, `updateUserBalance.ts` default `inv_id`).
- [P1] В одном шаге `generate-image-${i}` (239–327) объединены `sendMessage` + `replicate.run` (блокирующий вызов, платный) + `saveFileLocally` + `savePrompt` + `pulse`. Ретрай шага повторяет оплаченный запрос к Replicate и дублирует сообщение.
- [P1] Ошибка `processBalanceOperation` пересылается пользователю как есть (194) — при вызове из Inngest это может быть текст `TypeError` (см. общий контекст).
- [P1] Нет `concurrency`/`idempotency` по `telegram_id`; нет zod — `event.data` деструктурируется напрямую (58–67).
- [P2] `get-bot` (75) возвращает объект бота из шага (сериализация экземпляра), `console.log('botData')` (83); `check-user` возвращает полный объект пользователя.
- [P2] `finalBalance` считается вычитанием (348), а не читается из БД.
- [P2] Дубликат файла `src/inngest_app/functions/neuroImageGeneration.ts`; функция без продюсера — кандидат в мёртвый код.

Предложение: (1) либо удалить функцию и дубликат, либо перевести на «резерв → генерация → фиксация/возврат» с `inv_id = event.id`; (2) передавать `operation_id`/`inv_id` в `processBalanceOperation`; (3) разбить `generate-image-${i}` на `replicate-${i}` / `save-${i}` / `send-${i}`.

Не проверено: семантика счётчика `attempt` при step-level retry (не запускал); реальное отсутствие продюсера в других сервисах.

---

## reels-ai-generate — `src/inngest_app/functions/existing/generateAIReelsFunction.ts`

Назначение: по событию `ai-reels/generate` собрать рилс (lip-sync + WAN 2.5 видео + ffmpeg-склейка) и передать на доставку через POST в `ai-reels-callback` route.

Сильное: `validate-input` (65–101) с `NonRetriableError` и фиксацией safe mode в результате шага; `notify-telegram` (284–319) бросает на не-2xx — закреплено тестом `aiReelsDeliveryWebhookThrows.test.ts`; `nonRetriableGuards.test.ts` покрывает guard.

Слабое:
- [P0] `rateLimit { limit: 5, period: '1m', key: 'event.data.telegramId' }` (46–59) — rateLimit в Inngest **отбрасывает** лишние события, а не ставит в очередь. Пользователь уже списан в `src/scenes/lipSyncWizard/ai-reels-inngest-wizard.ts:343–385` (`updateUserBalance` → `sendAIReelsEvent`) → 6-е событие за минуту = деньги списаны, работа не начата. Нужен `throttle` или `concurrency`.
- [P1] `generate-lipsync-video` (135–170) и `generate-wan25-video` (173–217): создание платной задачи и опрос `waitForWAN25Task(taskId, 120000)` (`wan25-helpers.ts:98–197`, `setTimeout`-поллинг внутри шага) в одном шаге → ретрай пересоздаёт платную задачу. Разделить: `create-task` → `step.sleep`/`waitForEvent` → `poll`.
- [P1] Нет возврата при неуспехе (catch 335–362), POST error-webhook выполняется вне шага (не durable); `errorResult` без `telegramId` (342–345) — route не сможет уведомить.
- [P1] Нет `concurrency` по пользователю; нет zod (валидация ручная).
- [P2] Комментарий в wizard говорит, что сцена не зарегистрирована — статус продюсера неясен.

Предложение: (1) заменить `rateLimit` на `throttle`/`concurrency`; (2) разделить создание задачи и ожидание, ожидание через `step.sleep` в цикле или `waitForEvent`; (3) в catch — durable шаг `report-failure` с `telegramId`, и решение о возврате/компенсации.

Не проверено: фактическая регистрация `ai-reels-inngest-wizard` в stage.

---

## reels-ai-callback — `src/inngest_app/functions/ai-reels-callback.ts`

Назначение: по событию `ai-reels/callback` отправить пользователю готовое видео (или сообщение об ошибке).

Сильное: guard `NonRetriableError` на невалидный payload (194–203); `safeRecipient` (206); отправка видео вынесена в шаг `send-completed-video` (224); есть тест-шов `aiReelsCallbackOnFailure.test.ts`.

Слабое:
- [P1] Двойная доставка: комментарии (69, 94) ссылаются на дедуп #1242, но дедуп (`createVideoDeliveryClaimer`) живёт только в Express-route `ai-reels-callback.routes.ts:220–229`; в самой функции его нет. Любой повтор события = повторная отправка видео.
- [P1] Нет проверки токена callback (route имеет `verifyCallbackToken`, строка 128; функция — нет). В боевом коде продюсеров события не найдено (только mcp-server/e2e) → функция фактически мёртвый путь, но открытый.
- [P1] `TELEGRAM_BOT_TOKEN` читается на уровне модуля (40–42), `payload.bot_name` игнорируется → мультитенантный бот отправит от одного и того же бота (в route это уже починено, см. `aiReelsCallbackForwardsBot.test.ts`).
- [P2] Ветка failed (141–151) советует «попробуйте ещё раз» без слова о списании/возврате.
- [P2] `onFailure` создан с именем `'AI Reels Callback'`, а не каноническим id (170).
- [P2] `job_id` парсится regex `telegram-(\d+)-` — хрупко.

Предложение: (1) либо удалить функцию и оставить route, либо переиспользовать `createVideoDeliveryClaimer` внутри шага; (2) брать бота через `getBotByNameAdapter(payload.bot_name)`; (3) `onFailure: createInngestFailureHandler('reels-ai-callback')`.

Не проверено: есть ли внешние продюсеры события за пределами репозитория.

---

## reels-loop-generate — `src/inngest_app/functions/existing/generateAdvancedLoopingVideoFunction.ts`

Назначение: сгенерировать N морфинг-клипов через Replicate, скачать, склеить ffmpeg в зациклённое видео, отправить.

Сильное: guard `NonRetriableError` (130–137); `concurrency.limit: 1` есть; шаги разделены по этапам.

Слабое:
- [P0] `download-video-clips` (201–213) вызывает `downloadFile(url)` из `@/helpers`, который возвращает `Buffer` (`src/helpers/downloadFile.ts:6`) и ничего не пишет в `videoPath` → последующая склейка всегда не находит файлы. Оплаченные клипы Replicate теряются детерминированно.
- [P0] `generate-morphing-clips` (163–195): все N платных предсказаний в одном шаге, `waitForPrediction` — `do…while` с `setTimeout` без таймаута (41–76). Ретрай шага = повторная оплата всех N; зависание — бесконечное.
- [P1] Собственный клиент `new Inngest({ id: 'bot-farm-kling-morph-v7', eventKey })` (13–17) вместо общего из `client.ts`; функция при этом регистрируется в общем приложении (`registerFunctions.ts:80/151`).
- [P1] `bot_token` передаётся в payload события (100, 234) — секрет в журнале событий.
- [P1] Вне шагов: `Date.now()` для `filePrefix` (150) и `fs.mkdir` (152) — недетерминизм при replay; cleanup (278–286) работает с пересчитанным префиксом.
- [P1] `concurrency` глобальный (88–90), а не по пользователю.
- [P2] `send-to-pulse` хардкодит `localhost` и `'ai_koshey_bot'` (250–263); проверка `REPLICATE_API_TOKEN` бросает обычный `Error` (109–114) — будет ретраиться; продюсеров события не найдено.

Предложение: (1) `fs.writeFile(videoPath, await downloadFile(url))` или использовать файловый downloader; (2) по шагу на клип: `create-${i}` → ожидание через `step.sleep` → `fetch-${i}`; (3) перейти на общий `inngest`, убрать `bot_token` из события, `filePrefix` — из `event.id`.

Не проверено: используется ли функция вообще (продюсер не найден в `src`).

---

## morph-images-generate — `src/inngest_app/functions/training/morphImages.ts`

Назначение: из ZIP-набора изображений собрать серию Kling-морфингов, склеить и доставить видео.

Сильное: `check-user-exists` / `check-balance` до платных операций (73–94); `retries: 3`; поэтапные шаги; тест `pathSegmentGuard.test.ts` косвенно покрывает пути.

Слабое:
- [P0] Доставка сломана: `concatenate-all-videos` возвращает локальный путь как `video_url` (443); `deliver-result` передаёт его в `bot.telegram.sendVideo` как строку (506) → трактуется как URL/file_id и падает; fallback (543–547) отправляет пользователю локальный путь ФС «как ссылку». Платные Kling-генерации не доходят до пользователя.
- [P0] `process-all-pairs` (178–269): все пары последовательно в одном шаге через `createKlingMorphingVideo` (`src/core/kling/index.ts:56–160`, `replicate.run` + fallback по моделям) → ретрай шага = повторная оплата всех пар.
- [P1] Манифест объявляет `charges-balance`, но функция только проверяет баланс (77–94, хардкод 50 звёзд) и никогда не списывает. Либо расхождение манифеста, либо бесплатная работа за деньги владельца.
- [P1] `fs.existsSync(extraction_path)` вне шага бросает обычный `Error` (150–159) → ретраи бессмысленны; `extraction_path` из события предполагает общую ФС с продюсером.
- [P1] `cleanup-temp-files` (459) выполняется ДО `deliver-result`; финальная временная директория не очищается.
- [P2] `check-user-exists` возвращает полный объект пользователя (73); дубликат `src/inngest_app/functions/morphImages.ts` закомментирован в `functions/index.ts:33,84`; продюсеров события не найдено.

Предложение: (1) `sendVideo(chat, { source: localPath })` или загрузка в S3 + URL; cleanup после доставки; (2) шаг на пару `morph-pair-${i}`; (3) согласовать манифест и код по списанию.

Не проверено: как формируется `extraction_path` у продюсера.

---

## render-job-run — `src/inngest_app/functions/render/render.ts`

Назначение: по событию `render` подключиться по SSH к nexrender-серверу, отрендерить AE-шаблон, выложить результат и дёрнуть callback.

Сильное: zod-валидация с `NonRetriableError` (51; `schemas.ts:163–175`); таймаут рендера 10 мин (`helpers/renderSteps.ts:229`) и `NonRetriableError` на ошибке рендера (233–241); `retries: 3`.

Слабое:
- [P0] `sendCallback` глотает ошибки (`renderSteps.ts:328–350`) → шаг `callback` никогда не падает, try/catch в `render.ts:93–101` мёртв; потеря callback = «оплачено, не доставлено» без сигнала.
- [P1] `createJobFolder` делает `mkdir` без `-p` (`renderSteps.ts:99,104`) — ретрай шага упадёт на «exists».
- [P1] Нет `concurrency` при единственном SSH-хосте; `server_url/port/user` берутся из события (доверие к payload).
- [P1] Нет `timeouts`/`cancelOn` на уровне функции.
- [P2] По комментарию в `steps.ts:1530–1560` путь nexrender списан (нет таблицы `render_servers`, нет SSH-переменных) — функция вероятно мёртвая; продюсер события `render` только в тестах.

Предложение: (1) `sendCallback` должен бросать (шаг ретраит сам); (2) `mkdir -p`; (3) `concurrency.limit: 1` с ключом по серверу или удалить путь целиком.

Не проверено: живой SSH-хост.

---

## render-avatar-video-run — `src/inngest_app/functions/render/renderAvatarVideo.ts`

Назначение: озвучка ElevenLabs → аватар Hedra/HeyGen → транскрипция → B-roll (KIE) → триггер рендера.

Сильное: zod (187); `create-job` с `Date.now/Math.random` внутри шага (204); `retries: 3`; `onFailure`.

Слабое:
- [P0] Пайплайн собран на заглушках: `@/services/hedra|heygen|elevenLabs|kieAI` резолвятся в `src/services/hedra.ts`, `heygen.ts`, `elevenLabs.ts`, `kieAI.ts` (stub). `generateSpeech` отдаёт 4-байтовый буфер (39–40), который загружается в **реальный** S3 (236–243); `transcribeAudioFromUrl` всегда бросает обычный `Error` → `generate-transcription` (350) ретраится 3 раза и функция всегда падает; `trigger-render` — заглушка с закомментированным POST (469–483). Манифест декларирует `paid-api, external-webhook`. Рядом лежат `src/services/hedra/index.ts` и т.п., бросающие «not implemented» — двусмысленность модулей. `tsc --noEmit` проходит, тест `no-fabricated-returns.test.ts` косвенно упоминает файл.
- [P1] Секреты в событии: `eleven_labs_api_key`, `kie_api_key`, `avatar_settings.api_key` (219, 256, 378).
- [P1] `generate-brolls-parallel` — N платных задач в одном шаге (371–397); `wait-brolls-completion` глотает ошибки по задачам (428–433) → частичный результат без сигнала.
- [P2] Нет `concurrency`/`timeouts`.

Предложение: (1) пометить функцию как нерабочую (не регистрировать) или довести сервисы; убрать двойные модули; (2) ключи — в env/секрет-хранилище, а не в payload; (3) по шагу на b-roll.

Не проверено: какой из двух модулей резолвится в рантайме при `tsconfig paths` (по коду — файлы `.ts` рядом с директориями).

---

## render-riddle-run — `src/inngest_app/functions/render/renderRiddle.ts`

Назначение: 10-шаговый пайплайн «загадка»: озвучка/аватар → транскрипция → B-roll → подстановка в шаблон → триггер рендера.

Сильное: zod (73) и safe mode (76) в начале; `preflight-render-capacity` (99–146) проверяет доступность Remotion и бросает `NonRetriableError` ДО платных шагов — хороший образец; параллельные шаги с индексными id `generate-broll-${index}` / `wait-broll-${index}` (321–348), закреплено ратчетом `inngestStepIdStaticInLoop.test.ts`; `createJob`/`loadTemplateJson` бросают `NonRetriableError`.

Слабое:
- [P0] Последний шаг `trigger-render` → `triggerRender` (`steps.ts:1464–1597`) отправляет событие `render/execute`, у которого нет подписчика (документировано в коде, 1526–1560), причём перед этим ищет сервер в таблице `render_servers`, которой по тому же комментарию нет → `throw new Error('No available render servers')` (1503) — обычная ошибка, ретраи 3 раза, потом падение. Итог: озвучка, аватар, транскрипция и N B-roll оплачены, видео не будет. Preflight проверяет Remotion, а триггер идёт в nexrender — две половины не соединены.
- [P1] `wait-broll-${index}` → `waitForBrollResult` (`steps.ts:1355–1416`): `while (true)` с `setTimeout(5000)` без верхней границы внутри шага. Использовать `step.sleep` + лимит итераций или `waitForEvent`.
- [P1] `inngest.send` внутри `step.run` (`steps.ts:1568`) вместо `step.sendEvent` — при ретрае шага событие уйдёт повторно.
- [P1] Hedra-ветка идёт через `HedraService` из `@/services/hedra` (`steps.ts:39`) — тот же stub, что в render-avatar-video (см. выше); HeyGen — через `heygenService` (реальный).
- [P1] Секреты в событии: `eleven_labs_api_key`, `heygen_api_key`, `kie_api_key`, `avatar_settings.api_key`; `user_id` берётся из `process.env.DEFAULT_ADMIN_ID` вне шага (84).
- [P2] `createJob` оборачивает любую ошибку (включая сетевую) в `NonRetriableError` (`steps.ts:457`); `triggerRenderRiddle` (515–524) отправляет с `id: render-riddle/${uuid()}` — идемпотентность фиктивная.

Предложение: (1) до починки — не регистрировать или поставить `throw new NonRetriableError` сразу после preflight; целевой путь: `triggerRender` → POST в Remotion `/render` (или `step.sendEvent` на реально существующую функцию); (2) поллинг через `step.sleep` с лимитом; (3) `step.sendEvent` вместо `inngest.send` внутри шага.

Не проверено: наличие таблицы `render_servers` в БД (только по комментарию в коде).

---

## welcome-avatar-generate — `src/inngest_app/functions/welcomeAvatarGeneration.ts`

Назначение: бесплатный приветственный нейро-портрет новому пользователю (SeeDream 4.5, `is_welcome_gift: true`).

Сильное: `NonRetriableError` на отсутствие идентификаторов (139–145); бот берётся внутри шагов (155, 229, 313), не сериализуется; safe mode останавливает до платного шага (181–188); `reserve-gift-slot` в шаге — ретрай не съедает второй слот (210–212), покрыто `welcome-gift-budget.test.ts`; `select-hero` детерминирован через шаг; ветвление по `giftSlot.granted` детерминировано (225); `retries: 2`, `onFailure`, `concurrency` по `telegram_id`.

Слабое:
- [P1] Нет идемпотентности подарка на пользователя: продюсер `createUserScene.ts:200` шлёт событие без `id`, функция без `idempotency`. Повторный вход в сцену / повтор события = второй бесплатный платный запрос к SeeDream. `reserveWelcomeGiftSlot` — per-process breaker (`welcomeGiftBudget.ts:18–20`, ×replicas), не защита от дубля по пользователю.
- [P1] `concurrency { limit: 5, key: telegram_id }` — по одному пользователю параллельно 5 подарков не нужно; глобального лимита на платный API нет.
- [P2] `generate-image` (227–307) объединяет статус-сообщение, платную генерацию и `replyWithPhoto` — ошибки глотаются в `success:false` (намеренно, но исключает ретрай при временном сбое сети).
- [P2] Нет zod — cast `event.data as WelcomeAvatarEventData` (136).

Предложение: (1) `idempotency: 'event.data.telegram_id'` в конфиге + флаг `welcome_gift_sent` в БД; (2) `concurrency.limit: 1` по пользователю и отдельный глобальный лимит; (3) zod-схема события.

Не проверено: гарантирует ли `createUserScene` однократный вызов на пользователя.

---

## Сводная таблица

| id | P0 | P1 | P2 | Главное предложение |
|---|---|---|---|---|
| neuro-image-generate | 2 | 3 | 3 | Удалить как мёртвую (нет продюсера) или перевести на резерв→генерация→фиксация с `inv_id = event.id` |
| reels-ai-generate | 1 | 3 | 1 | `rateLimit` → `throttle`/`concurrency`; разделить создание платной задачи и ожидание |
| reels-ai-callback | 0 | 3 | 3 | Удалить дубликат route или добавить `createVideoDeliveryClaimer` и бота по `bot_name` |
| reels-loop-generate | 2 | 4 | 1 | Записывать `Buffer` в `videoPath`; шаг на клип; общий клиент, без `bot_token` в событии |
| morph-images-generate | 2 | 3 | 1 | `sendVideo({ source })`/S3 + cleanup после доставки; шаг на пару; согласовать манифест по списанию |
| render-job-run | 1 | 3 | 1 | `sendCallback` должен бросать; `mkdir -p`; `concurrency` по серверу или снять путь |
| render-avatar-video-run | 1 | 2 | 1 | Не регистрировать до замены stub-сервисов; ключи из env |
| render-riddle-run | 1 | 4 | 1 | Соединить `trigger-render` с Remotion `/render` (или `step.sendEvent` на существующую функцию); `step.sleep` в поллинге |
| welcome-avatar-generate | 0 | 2 | 2 | `idempotency: 'event.data.telegram_id'` + флаг в БД; `concurrency.limit: 1` |
| **Итого** | **10** | **27** | **14** | |
