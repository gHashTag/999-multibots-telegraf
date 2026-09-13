# Ревью Inngest-функций — группа B: обучение моделей, платежи, рассылка, webhook-guard (2026-09-13)

Формат — по `docs/audit/review/CHECKLIST.md`. Только чтение кода; о поведении в проде не утверждается —
только о том, что делает код. Ссылки `путь:строка` даны от корня репозитория.

Общий контекст, который повторяется ниже и не переписывается семь раз:

- `createInngestFailureHandler` (`src/inngest_app/client.ts:160-223`) пишет `logger.error`, дублирует в
  `console.error` и шлёт админу сообщение через сырой `fetch` к Bot API с `parse_mode: 'Markdown'`, при этом
  текст ошибки не экранируется (`client.ts:199-204`) — символы `_`, `*`, `` ` `` в тексте ошибки могут сломать
  разметку и сообщение не дойдёт (fetch не проверяет `response.ok`, `client.ts:206-214`). Проба (`e2e_test`)
  глушится через `isProbeFailureEvent` (`client.ts:165`). Это общее для всех семи функций, дальше не
  повторяю.
- `isSafeMode` (`src/inngest_app/safeMode.ts:40-48`) читает `process.env.INNGEST_SAFE_MODE` и `data.e2e_test`.
  Вызывается **вне** `step.run` во всех функциях группы — это чтение env при каждом replay; ветвление
  стабильно, пока env не меняется между запросами одного run.
- Баланс считается как сумма `COMPLETED`-строк `payments_v2` (см. `src/core/supabase/updateUserBalance.ts:479-483`);
  «списать» = вставить `MONEY_OUTCOME`, «вернуть» = вставить `MONEY_INCOME`. Идемпотентность записи по
  `inv_id` есть только у ветки `metadata.inv_id` (`updateUserBalance.ts:441-489`); все прочие вставки получают
  `inv_id = sys-${Date.now()}-…` (`updateUserBalance.ts:~523`) и при повторе создают вторую строку.

---

## training-model-start — src/inngest_app/functions/existing/generateModelTrainingFunction.ts

Назначение: по событию `training/model.start` (legacy `model/training.start`, шлёт `uploadTrainFluxModelScene`,
`src/scenes/uploadTrainFluxModelScene/index.ts:171-183`) создать модель и тренировку Flux-LoRA на Replicate
(`ostris/flux-dev-lora-trainer`), записать строку `model_trainings`, уведомить пользователя. Завершение
приходит webhook'ом → `training-model-complete`.

Сильное:
- Правильный порядок «сначала строка в БД, потом платный API»: `save-pending-record` (`:227-268`) до
  `create-replicate-training` (`:272-337`); падение вставки останавливает запуск (`:247-257`).
- Guard на `steps` — `NonRetriableError` до первого шага (`:66-72`), `retries: 0` (`:50`) делает бросок
  терминальным; есть тест `trainingServedStepsGuard.test.ts`.
- Дедуп по `telegram_id + model_name + status in (PENDING, starting, processing)` (`:107-119`), покрыт
  `trainingDedupIncludesPending.test.ts`.
- `concurrency: { limit: 2 }` (`:45-49`) — глобальный потолок параллельных тренировок.
- Шаги возвращают маленькие объекты (`{ validated }`, `{ record_id }`, `{ training_id, status, destination }`),
  комментарии прямо говорят, зачем (`:80`, `:160`).
- Safe mode перекрывает оба платных шага (`:150-157`).

Слабое:
- [P0] **Функция не списывает деньги и не возвращает их.** В файле нет ни `updateUserBalance`, ни
  `processBalanceOperation`; отправляющая сцена тоже не списывает (в `uploadTrainFluxModelScene/index.ts`
  импорты `:11-21`, ни одного денежного вызова), `handleTrainingCost` только сравнивает баланс с ценой
  (`src/price/helpers/handleTrainingCost.ts:31-57`). Манифест же заявляет `charges-balance`
  (`functions.manifest.json`, запись `training-model-start`). Денежные шаги `charge-user-balance` /
  `refund-user-balance` живут в незарегистрированной копии `src/inngest_app/functions/training/generateModelTraining.ts:685-911`.
  Это уже зафиксировано в `docs/audit/training-charge-gone.md` и `docs/OWNER-DECISIONS.md:329-333`; здесь
  фиксирую как расхождение код ↔ манифест: манифест описывает функцию, которой нет.
- [P1] `check-duplicates` бросает обычный `Error` (`:125`) — при `retries: 0` это не порождает retry, но
  семантически это бизнес-отказ; при любом будущем `retries > 0` пойдут бессмысленные повторы. То же для
  `validate-credentials` (`:93`) — отсутствие env не лечится retry.
- [P1] `create-replicate-model` (`:161-222`) недетерминирован: `uniqueModelName = ${sanitized}-${Date.now()}`
  (`:170`). Внутри одного шага это допустимо (результат мемоизируется), но при retry **шага** (падение после
  `models.create`, например на `setTimeout` `:209` или при сетевом сбое ответа) создаётся вторая модель с новым
  именем — на Replicate остаётся сирота. Не деньги (модель бесплатна), но мусор в аккаунте.
- [P1] `await new Promise(r => setTimeout(r, 5000))` внутри шага (`:209`) — 5 с блокировки воркера вместо
  `step.sleep`. При `concurrency: 2` это заметно.
- [P1] `save-pending-record` пишет `replicate_training_id: pending-${Date.now()}` (`:233`). Если функция упадёт
  между `save-pending-record` и `update-training-record` (например, на `create-replicate-training`), строка
  остаётся `PENDING` с фейковым ID навсегда: `training-stuck-check` её явно пропускает
  (`checkStuckTrainings.ts:96` `.not('replicate_training_id','like','pending-%')`), а дедуп `check-duplicates`
  считает её активной (`:117`) — пользователь **не сможет запустить повторную тренировку с тем же именем**
  до ручной правки БД. Нет compensating-шага, переводящего `PENDING` в `FAILED` при падении.
- [P1] `retries: 0` при платном `replicate.trainings.create` (`:298`): сетевой таймаут после того, как Replicate
  принял тренировку, оставляет строку `PENDING` (см. выше) и тренировку без записи → webhook придёт с
  неизвестным `training_id`, `training-model-complete` вернёт `skipped` (`handleModelTrainingCompleted.ts:111-128`),
  пользователь не узнает о результате.
- [P2] `concurrency` без `key` — лимит общий, а не per-user; для защиты от дублей одного пользователя
  используется только DB-дедуп.
- [P2] Нет zod-схемы события; `eventData` — `as`-каст (`:57`). `is_ru`, `gender` не проверяются.
- [P2] `startTime` вне шагов (`:58`) — `elapsed` в логах/результате бессмыслен при replay (считается от
  последнего запроса).
- [P2] Нет `timeouts`/`cancelOn`.
- [P2] Логи: `telegram_id` есть, `runId`/`bot_name` — нет.

Предложение:
1. Решить судьбу денег в этом обработчике (см. секцию «Дубль v1/v2» ниже): перенести из
   `training/generateModelTraining.ts:643-740` шаги `balance-check` + `charge-user-balance` **перед**
   `create-replicate-training` и `refund-user-balance` в `catch`, затем удалить копию.
2. Обернуть тело после `save-pending-record` в `try/catch`, в `catch` — шаг `mark-pending-failed`
   (`update model_trainings set status='FAILED' where id=record_id`), чтобы дедуп и watchdog не залипали.
3. `check-duplicates`/`validate-credentials` → `NonRetriableError`; `setTimeout(5000)` → `step.sleep('wait-model-init','5s')`.

Не проверено: поведение Replicate SDK при 4xx на `trainings.create` (какая ошибка, есть ли `response.status`).

---

## training-model-v2-start — src/inngest_app/functions/training/modelTrainingV2.ts

Назначение: по `training/model-v2.start` списать звёзды, скачать ZIP, закодировать в base64 и отправить
finetune-запрос в BFL (`api.us1.bfl.ai/v1/finetune`), записать `model_trainings` (`api: 'bfl'`), уведомить.
При ошибке — возврат.

Сильное:
- Возврат оформлен как мемоизированный шаг `refund-balance` (`:439-485`), передаётся **сумма операции**, а не
  новый баланс (`:449-464`); результат возврата не выбрасывается, а попадает в текст пользователю (`:504-512`).
- Двойное списание в `deduct-balance` убрано (`:397-406`), оставлен только текст.
- Таймауты на скачивание ZIP (`:38-41`, 180 с) и на запрос в BFL (`:289`) — с объяснением, что без них
  возврат недостижим.
- `NonRetriableError` на «нет пользователя» (`:91`) и «нет денег» (`:210`).

Слабое:
- [P0] **Шаг `get-bot` возвращает экземпляр `Telegraf`** (`:125-132`, `return getBotByName(bot_name)`).
  Результат шага сериализуется в JSON и хранится у Inngest: методы теряются, а поле `telegram.token`
  (Telegraf хранит токен в `Telegram`-инстансе) **уходит в стор Inngest в открытом виде**. На replay `bot` —
  плоский объект без `telegram.sendMessage`, поэтому все последующие `bot.telegram.sendMessage(...)`
  (`:197`, `:375`, `:422`, `:514`) в отдельных запросах — `TypeError`. В `notify-user` (`:368-386`) этот
  `TypeError` попадает в `catch` → `refund-balance` **после того, как BFL-тренировка уже создана и оплачена
  владельцем** (`create-training` `:245-336`) → пользователю возвращают деньги за запущенную тренировку.
- [P0] Порядок «платный API → запись в БД»: `create-training` (`:245`) **до** `save-training-to-db` (`:339`).
  Падение вставки → возврат денег пользователю, а finetune у BFL идёт, и записи о нём нет. Это ровно тот
  класс, что в v1 починен `save-pending-record`.
- [P0] **Тренировка v2 не имеет пути завершения.** В `src` нет обработчика webhook'а BFL (`rg -i bfl src`
  даёт только этот файл, `imageModelPrices`, `getLatestUserModelForHaim`), `training-stuck-check` проверяет
  только Replicate (`checkStuckTrainings.ts:159`) и для `finetune_id` получит 404 → пометит строку `failed`
  (`:211-248`) без сообщения пользователю и без возврата. Итог по коду: деньги списаны (`check-balance`),
  BFL-запрос отправлен, дальше — тишина.
- [P1] `check-balance` (`:149-224`) — **это списание**, а не проверка: `processBalanceOperation`
  (`src/price/helpers/processBalanceOperation.ts:168-179`) вставляет `MONEY_OUTCOME`. Название шага вводит в
  заблуждение; при retry шага (падение после вставки, до `return`) — второе списание, ключа идемпотентности нет
  (`inv_id` не передаётся → `sys-${Date.now()}`).
- [P1] `processBalanceOperation` вызывается без `ctx` (`:179-184`): `service_type`/описание получают
  `'unknown_mode'` (`processBalanceOperation.ts:162-175`), а при нехватке средств `ctx.telegram.sendMessage`
  (`processBalanceOperation.ts:133`) бросает `TypeError` на `undefined`, который гасится внешним `catch`
  (`:205-215`) — пользователь получает `error.message` вида «Cannot read properties of undefined» через `:197`
  (если бы `bot` был живой).
- [P1] `encode-zip` возвращает **base64 всего ZIP** (`:228-242`) — мегабайты биометрических фото в step output
  Inngest (лимит размера вывода шага + хранение PII вне нашего контура). Комментарий в v1 (`:305`) прямо говорит,
  что от этого ушли.
- [P1] `retries` не задан → SDK default (3). Для функции, которая списывает и шлёт платный запрос, это должно
  быть осознанно; `catch` → `throw error` (`:537`) после `refund-balance` — если функция ещё имеет попытки,
  replay пройдёт по мемоизированным шагам и снова упадёт на том же месте, ничего не задвоив, но и не
  помогая.
- [P1] Нет `concurrency`/дедупа по `telegram_id + modelName` (в v1 есть). Два события подряд → два списания и
  две тренировки.
- [P2] Возврат в `catch` срабатывает и для падений `notify-user`/`deduct-balance` (после успешного
  `create-training`) — то есть сбой Telegram делает тренировку бесплатной.
- [P2] `logger.info('🚀 …', { data: event.data })` (`:61-64`) пишет весь payload, включая signed URL на ZIP
  с лицами (в v1 URL специально усечён, `:143`).
- [P2] `handle-error` вызывает `errorMessageAdmin` без `await` (`:528`).
- [P2] Ответ `training` целиком попадает в `message: JSON.stringify(training)` (`:433`).
- [P2] Нет zod-схемы; `event.data` деструктурируется без проверки (`:66-75`).

Предложение:
1. Снять с обслуживания: убрать из `registerFunctions.ts:108`, оставить только v1 (обоснование в секции
   «Дубль»). Если оставлять — п.2–3.
2. `get-bot` не делать шагом (или возвращать `{ ok: boolean }`), бота брать внутри каждого шага через
   `getBotByName`; `check-balance` переименовать в `charge-balance` и передавать в metadata детерминированный
   `inv_id` (например `train-${runId}`), чтобы повтор шага был идемпотентен.
3. Переставить `save-training-to-db` (как `PENDING`) **до** `create-training`, а `encode-zip` заменить на
   передачу URL/стрим без возврата base64 из шага.

Не проверено: принимает ли BFL `file_data` иначе, чем base64; фактический лимит размера step output у
текущего плана Inngest.

---

## training-model-complete — src/inngest_app/functions/existing/handleModelTrainingCompleted.ts

Назначение: по `training/model.complete` (legacy `model/training.completed`, шлют
`replicate-webhook.routes.ts:117` и `training-stuck-check`) найти строку `model_trainings` по
`replicate_training_id`, перевести в терминальный статус, записать `model_url`, уведомить пользователя.

Сильное:
- Replay-дедуп: если строка уже терминальная при чтении — выход без повторного уведомления (`:146-167`),
  покрыт `trainingCompletedReplayDedup.test.ts`.
- «Не найдено» → `return skipped`, а не throw (`:85-90`, `:111-128`) — тестовые/чужие webhook'и не крутят retry.
- `buildModelUrl` вместо ручной сборки, с подробным разбором прошлой ошибки (`:190-227`); успех без версии
  не пишет битый `model_url` и не ставит `result='SUCCESS'` (`:240-266`), тесты
  `training-completed-version-guard`, `trainingIncompleteStaysVisible`.
- Отправка в Telegram обёрнута в `try/catch` внутри шага, результат возвращается, а не бросается
  (`:440-483`); `safeRecipient` перенаправляет на админа в safe mode (`:346-349`).
- `retries: 2` оправдан: единственные транзиентные места — Supabase update и Telegram.

Слабое:
- [P1] **Нет возврата при `status: 'failed'`/`'canceled'`.** Функция пишет `FAILED`/`CANCELED` (`:174-183`,
  `:269-272`) и уведомляет, но денег не касается; манифест заявляет `charges-balance` и `paid-api` — в коде ни
  того, ни другого (`side_effects` в манифесте неверны). Пока v1 не списывает (см. выше), потери нет; как
  только списание вернут в v1 — здесь нужен `refund` для `failed`/`canceled`.
- [P1] Дедуп между «webhook пришёл дважды» работает, но **между двумя параллельными run** (Replicate
  re-POST и одновременно `training-stuck-check`) — гонка: оба читают не-терминальный статус, оба обновляют, оба
  шлют уведомление. Нужен `concurrency: { key: event.data.training_id, limit: 1 }` или
  `idempotency: 'event.data.training_id + "-" + event.data.status'` в конфиге.
- [P1] `find-training-record` возвращает `select('*')` (`:70`, `:101-106`) — всю строку, включая `zip_url`
  (signed URL на ZIP с лицами) в step output Inngest. Достаточно `id, telegram_id, bot_name, model_name,
  trigger_word, status, is_ru`.
- [P1] Для `canceled` уведомление пропускается (`:324-340`) — пользователь не узнаёт, что тренировка
  отменена; статус в БД при этом терминальный, watchdog её больше не увидит.
- [P2] Схема события — `as`-каст (`:56`); `status` не валидируется, `statusMap[...] || status.toUpperCase()`
  (`:181-182`) пропустит любое значение в БД.
- [P2] Внешний `try/catch` только логирует и перебрасывает (`:500-508`) — дублирует `onFailure`.
- [P2] `process.env.REPLICATE_USERNAME || 'ghashtag'` (`:219-220`) — захардкоженный владелец как fallback.
- [P2] `startTime`/`elapsed_ms` вне шагов (`:57`, `:495`).

Предложение:
1. В конфиг: `concurrency: [{ key: 'event.data.training_id', limit: 1 }]`.
2. Сузить `select` в `find-training-record`; для `canceled` слать уведомление (ветка `failed`).
3. Когда в v1 вернётся списание — добавить шаг `refund-on-failure` для `failed`/`canceled`
   (через `refundUser` с `hasChargeToRefund`, `src/price/helpers/refundUser.ts`).

Не проверено: может ли Replicate прислать `succeeded` после `failed` для одного `training_id` (дедуп тогда
не даст исправить статус).

---

## training-stuck-check — src/inngest_app/functions/training/checkStuckTrainings.ts

Назначение: cron `*/30 * * * *` — выбрать до 20 строк `model_trainings` в `PENDING/starting/processing`
старше 3 ч с реальным `replicate_training_id`, спросить Replicate, для терминальных прислать
`training/model.complete`; 404 → ретировать строку как `failed`.

Сильное:
- Retire по 404 с явным `RETIRED_ERROR` и `continue` (`:211-249`), не трогает пользователя и деньги;
  тесты `stuckTrainingRetire404`, `stuckTrainingAgeUnknown`.
- Safe mode: и update в БД (`:213`), и рассылка событий (`:282-291`) закрыты.
- Явная обработка `created_at = null/NaN` (`:37-52`, `:194-200`).
- `limit(20)` и `order(created_at asc)` — ограниченная порция, старые первыми.

Слабое:
- [P1] Нет `concurrency: 1`/singleton для cron. При `retries` по умолчанию (не задан → 3) и долгом
  `check-replicate-status` (до 20 последовательных запросов) два run могут перекрыться и оба отправить
  `training/model.complete` для одних и тех же строк. Дедуп в `training-model-complete` — только между
  последовательными run, не между параллельными (см. выше).
- [P1] `send-completion-events` использует `inngest.send` в цикле внутри `step.run` (`:295-311`) вместо
  `step.sendEvent('send-completion-events', [...])`. При падении на k-м событии retry шага пошлёт первые k
  повторно; `step.sendEvent` с массивом атомарен и durable.
- [P1] Ретир по 404 — это **DB write внутри «проверочного» шага** (`:214-217`): при retry шага
  `check-replicate-status` он повторится (идемпотентно по содержанию, но это побочный эффект в шаге, который
  по имени — чтение). Плюс статус пишется как `'failed'` в нижнем регистре, тогда как остальной код пишет
  `'FAILED'` (`handleModelTrainingCompleted.ts:175`); `TERMINAL_STATUSES` там сравнивает через
  `toUpperCase()` (`:147-150`), так что работает, но в БД два написания.
- [P1] `alerts` только логируются `logger.warn` (`:257-262`) — «ALERT» никуда не уходит; шапка файла
  обещает алерт админу, кода нет.
- [P2] `check-replicate-status` возвращает `output: replicateTraining.output` (`:177`) для каждой resolved
  строки — объект с `weights`/`version`, небольшой, но неограниченный по схеме.
- [P2] `find-stuck-trainings` не фильтрует `api = 'bfl'` — строки v2 с `finetune_id` в
  `replicate_training_id` (если `createModelTrainingV2` так пишет) будут ретированы как 404.
- [P2] Манифест: `side_effects: charges-balance, paid-api, messages-user` — в коде ни списаний, ни платных
  вызовов, ни сообщений пользователю (только `trainings.get` и `inngest.send`).
- [P2] `startTime` вне шага (`:81`).

Предложение:
1. `concurrency: [{ limit: 1 }]`, `retries: 1` в конфиге.
2. `send-completion-events` → один `step.sendEvent` с массивом событий.
3. Вынести ретир 404 в отдельный шаг `retire-vanished` после `check-replicate-status`, писать `'FAILED'`;
   `alerts` отправлять админу тем же путём, что `onFailure`.

Не проверено: формат `replicate.trainings.get` при 404 в текущей версии SDK (тест проверяет regex по
сообщению, `:60-66`).

---

## payment-ai-server-process — src/inngest_app/functions/payments/paymentProcessing.ts

Назначение: по `payment/ai-server.process` (`{ IncSum, inv_id }`) сопоставить рублёвую сумму с тарифом или
пакетом звёзд, найти пользователя по `inv_id` в `payments_v2`, отметить платёж `COMPLETED`, уведомить
платёжную группу.

Сильное:
- Input guard → `NonRetriableError` (`:88-97`).
- Идемпотентность записи через `metadata.inv_id`: `updateUserBalance` делает `UPDATE … SET status=COMPLETED
  WHERE inv_id=…` и `return true` (`updateUserBalance.ts:441-489`) — повтор шага не создаёт вторую строку.
- Safe mode закрывает `update-user-balance` и `send-notification` (`:179-188`).
- `amount-match`: сумма, не совпавшая ни с тарифом, ни с пакетом → `success:false` без записи (`:264-281`).

Слабое:
- [P0] **Нет проверки, что `IncSum` совпадает с суммой инвойса.** `getTelegramIdFromInvId` читает только
  `telegram_id, bot_name` (`src/core/supabase/getTelegramIdFromInvId.ts:26-30`); `updateUserBalance` с `inv_id`
  просто ставит `COMPLETED` (`updateUserBalance.ts:451-457`) — **не сравнивая `amount`/`stars` строки с
  переданными** и **не проверяя, что строка была `PENDING`** (нет CAS, в отличие от `robokassa.routes.ts:192-205`).
  Событие с любым существующим `inv_id` и любой «правильной» суммой из таблиц (`:18-25`, `:28-56`) переводит
  чужой ожидающий платёж в `COMPLETED`. Единственный отправитель события в `src` — MCP-сервер
  (`src/inngest_app/mcp-server.ts:471`); production-путь Robokassa кредитует сам (`robokassa.routes.ts`). То
  есть это **второй, слабее защищённый путь начисления** к той же таблице.
- [P1] `update-user-balance` считает «успехом» `UPDATE`, затронувший 0 строк (Supabase не возвращает ошибку) —
  дальше `send-notification` пишет в группу «получил N звёзд», хотя ничего не начислено. Спасает только
  то, что `get-user-info` упадёт раньше, если строки нет; но если строка есть и уже `COMPLETED` — повторное
  уведомление.
- [P1] `retries: 3` + `catch` с `getTelegramIdFromInvId` **вне шага** (`:285-286`) и `errorMessage`/
  `errorMessageAdmin` **вне шага** (`:287-288`) — при каждой попытке пользователь и админ получают сообщение
  об ошибке заново (до 4 раз).
- [P1] Захардкоженный chat id платёжной группы `'-4166575919'` (`:238`) и выбор токена по имени бота
  `bot_name === 'neuro_blogger_bot' ? '1' : '2'` (`:223-226`) — для любого третьего бота уведомление уйдёт от
  бота №2; `get-bot-config` при этом получает `groupId` (`:166-175`) и **не использует его**.
- [P1] `console.log('🎯 Получено событие платежа:', event)` (`:80-81`) — весь event в stdout, мимо `logger`.
- [P2] `check-subscription-plan`/`check-payment-option` — чистые вычисления над константами, обёрнуты в
  `step.run` (`:112-150`): два лишних round-trip к Inngest на каждый платёж.
- [P2] `PAYMENT_OPTIONS` содержит `{ amount: 10, stars: 6 }` (`:24`) — похоже на тестовый пакет в проде-таблице.
- [P2] Тест `src/inngest_app/test/unit/generation-payment-broadcast.test.ts:443-460` ожидает шаг
  `'check-duplicate'`, которого в функции нет — тест не соответствует коду (либо мокается так, что не
  проверяет ничего).
- [P2] Нет zod-схемы; `IncSum` приходит строкой `"1110.00"` и округляется `Math.round` (`:100`).
- [P2] `SUBSCRIPTION_PLANS`/`PAYMENT_OPTIONS` дублируют прайс из `src/price/*` — расхождение цен возможно.

Предложение:
1. В `update-user-balance` перед `updateUserBalance`: прочитать строку `payments_v2` по `inv_id`, требовать
   `status = PENDING` и `amount === roundedIncSum` (иначе `NonRetriableError`), а обновление делать с
   `.eq('status', 'PENDING')` и проверкой количества затронутых строк (как `robokassa.routes.ts:192-222`).
2. `catch` (`:282-298`): уведомления перенести в `onFailure` (он уже есть) и убрать `getTelegramIdFromInvId`
   вне шага.
3. Либо снять функцию с регистрации (production-путь её не использует), либо `groupId` из `get-bot-config`
   использовать вместо константы, а токен брать через `getBotByName`.

Не проверено: даёт ли MCP-сервер внешним клиентам право слать произвольные события (аутентификация
`mcp-server.ts`).

---

## broadcast-message-send — src/inngest_app/functions/broadcast/broadcastMessage.ts

Назначение: по `broadcast/message.send` проверить владельца бота, загрузить пользователей и разослать
текст/фото/видео/ссылку через `broadcastService.sendToAllUsers`.

Сильное:
- Валидация payload → `NonRetriableError` (`:38-61`), отказ в правах → `NonRetriableError` (`:73`).
- Safe mode перед fan-out (`:102-109`).
- В сервисе удаление пользователя только по 403 / узкому набору 400 (`broadcast.service.ts:490-497`), с
  объяснением, почему не по любому 400; тест `broadcastDeleteGuardedRetry.test.ts`.

Слабое:
- [P0] **Вся рассылка — один `step.run('send-messages')`** (`:112-124`), внутри — последовательный `for`
  по всем пользователям (`broadcast.service.ts:318`). При падении/таймауте шага (Inngest перезапускает шаг
  целиком) и `retries: 3` (`:29`) **все уже получившие сообщение получат его снова**, до 4 раз. Нет курсора,
  нет батчей, нет записи прогресса.
- [P1] **Нет rate limit под Telegram (~30 msg/s глобально, 1 msg/s в чат)**: в цикле нет `sleep`, нет
  обработки `429`/`retry_after` (`broadcast.service.ts:318-560` — ни `setTimeout`, ни `RetryAfterError`,
  ни чтения `parameters.retry_after`). Ошибка 429 просто инкрементирует `errorCount` и идёт дальше.
- [P1] `check-permissions` пропускается, если **нет `sender_telegram_id` или `bot_name`** (`:65`): событие
  без отправителя проходит без проверки. Дальше `sendToAllUsers` при отсутствии `bot_name` возвращает
  `{ successCount: 0, reason: 'invalid_bot_name' }` (`broadcast.service.ts:171-181`), функция при этом
  завершается `success: true` (`:149`) — рассылка «успешна», отправлено 0. А `fetch-users` без `bot_name`
  выбирает **всех пользователей всех ботов** (`broadcast.service.ts:95-97`).
- [P1] Пользователи загружаются **дважды**: шаг `fetch-users` (`:79-99`) и снова внутри `sendToAllUsers`
  (`broadcast.service.ts:~300`). Списки могут расходиться; `analyze-results` (`:127-147`) делит
  `successCount` на `users.length` первого списка.
- [P1] `fetch-users` возвращает весь список `{ telegram_id, bot_name }` как step output (`:98`) — для
  большой аудитории это большой JSON у Inngest, и он не используется для отправки.
- [P1] Нет `concurrency: 1` по `bot_name` и нет `idempotency` — два одинаковых события = две рассылки.
- [P1] `fetch-users` бросает обычный `Error` на «нет пользователей» (`:89`) → 3 бессмысленных retry.
- [P2] Удаление строк `users` из рассылки (`broadcast.service.ts:518-522`) — деструктивный DB write как
  побочный эффект уведомления; при повторе шага удалится то же, но это ещё одна причина не перезапускать
  шаг целиком.
- [P2] Тест `generation-payment-broadcast.test.ts:462-660` работает на моках `step.run` и не проверяет ни
  батчи, ни rate limit, ни идемпотентность.
- [P2] Логи — без `runId`; `logger.info` на **каждого** пользователя с `Object.keys(bot)`
  (`broadcast.service.ts:329-337`).

Предложение:
1. Разбить на батчи: `fetch-users` → массив id; далее `for (const [i, batch] of chunks(users, 25))`
   `await step.run(\`send-batch-${batch[0].telegram_id}\`, …)` (ключ по первому id, не по индексу) +
   `await step.sleep(\`pause-${…}\`, '1s')` между батчами — это и даёт ≤25–30 msg/s, и делает возобновление
   после падения точным до батча.
2. В сервисе на `429` — читать `error.response.parameters.retry_after` и бросать `RetryAfterError` из
   шага (или спать внутри батча).
3. В конфиг: `concurrency: [{ key: 'event.data.bot_name', limit: 1 }]`; `check-permissions` делать
   обязательным (нет `sender_telegram_id` → `NonRetriableError`).

Не проверено: размер реальной аудитории на бота (влияет на выбор размера батча).

---

## webhook-generation-validate — src/inngest_app/functions/webhookHealthGuard.ts

Назначение: по `webhook/generation.validate` (legacy `video/generation-validate-webhook`, шлёт
`KieAiProvider.ts:423,458,588`) прогнать `testAllWebhookUrls()` и бросить ошибку, если ни один callback-URL
не отвечает. Файл содержит ещё две функции (`webhook-health-check`, `periodic-webhook-health-check`), из
них зарегистрирована только эта (`registerFunctions.ts:47-55, 120`).

Сильное:
- Один шаг, маленький результат (`:190-197`), `retries: 1` (`:154`), запросы к своим URL с таймаутами 3/5 с
  (`src/utils/webhookHealthCheck.ts:118, 207`).
- Никаких платных вызовов и сообщений пользователю — safe mode не нужен.

Слабое:
- [P1] **Guard ничего не блокирует.** `KieAiProvider` делает `await inngest.send(...)` (`:423-431`, `:458-466`)
  и сразу продолжает генерацию (`:433`, `:468`); результат функции никто не читает (нет `step.invoke`, нет
  `waitForEvent`). Текст ошибки «Video generation BLOCKED for safety» (`:186`) и шапка файла (`:14`) описывают
  поведение, которого в коде нет. Единственный эффект падения — `onFailure` → сообщение админу.
- [P1] `sendCriticalAlarm` (`:28-64`) — `TODO: Отправить через Telegram бота` (`:51`), фактически только
  `logger.error`. Захардкоженный IP `188.137.250.69:3001` в тексте (`:40`).
- [P2] Нет `rateLimit`/`debounce`: `KieAiProvider` шлёт событие на **каждую** генерацию (до трёх точек
  отправки), каждая порождает run с двумя HTTP-запросами к собственным URL. При всплеске генераций это
  самопроизвольная нагрузка на свой же webhook-endpoint.
- [P2] Манифест: `side_effects: db-write` — в коде записи в БД нет; `guard: unknown` — гуарда входа нет
  (`telegramId, modelId, provider` не проверяются, `:164`).
- [P2] Два мёртвых экспорта в том же файле (`webhookHealthCheck`, `periodicWebhookHealthCheck`,
  `:69-141`, `:214-251`) с `onFailure: createInngestFailureHandler('System Webhook Health Check')` — имена
  не совпадают с `id`.
- [P2] Обычный `Error` (`:182`) при недоступности — `retries: 1` даёт один повтор, что для health-check
  приемлемо.

Предложение:
1. Либо сделать guard реальным: в `KieAiProvider` заменить `inngest.send` на прямой `await testAllWebhookUrls()`
   с отказом до платного запроса (функция Inngest тут не нужна), либо честно переименовать в мониторинг и
   убрать «BLOCKED» из текста.
2. Добавить `debounce: { period: '1m', key: 'event.data.provider' }` или `rateLimit: { limit: 1, period: '1m' }`.
3. Поправить манифест (`side_effects: []`), удалить/вынести две незарегистрированные функции.

Не проверено: `getAvailableCallbackUrl` (`KieAiProvider.ts:470`) — возможно, реальный выбор URL делается там,
и guard действительно лишний.

---

## Дубль: training-model-start vs training-model-v2-start (и третья копия)

Три файла на одну задачу:

| | `existing/generateModelTrainingFunction.ts` (v1, **live**) | `training/modelTrainingV2.ts` (v2, live) | `training/generateModelTraining.ts` (не зарегистрирована) |
|---|---|---|---|
| Провайдер | Replicate `ostris/flux-dev-lora-trainer` | BFL `/v1/finetune` | Replicate |
| Кто шлёт событие | `uploadTrainFluxModelScene` | никто в `src`, кроме MCP | никто (`model/training.start` перехватывает v1) |
| Списание | **нет** | `check-balance` (до API) | `charge-user-balance` (до API) |
| Возврат | нет | `refund-balance` в `catch` | `refund-user-balance` в `catch` |
| Запись в БД | `PENDING` **до** API, потом update | **после** API | `create-training-record` до API |
| Дедуп | по `telegram_id+model_name+status` | нет | `check-active-training` |
| ZIP | URL напрямую | base64 в step output | — |
| Завершение | webhook → `training-model-complete`, watchdog | **нет обработчика BFL** | как v1 |
| `retries` | 0 | default | ? |
| `concurrency` | 2 | нет | 2 |

Общее: та же схема события (`telegram_id, bot_name, modelName, triggerWord, zipUrl, steps, is_ru, gender`),
те же тексты уведомлений, та же таблица `model_trainings`.

Что оставить: **v1**, потому что только у него замкнут цикл (запуск → webhook → completion → watchdog), только
его вызывает продукт, и у него правильный порядок «БД → платный API». Что перенести в v1 из копии
`training/generateModelTraining.ts:643-740, 873-930`: `balance-check` + `charge-user-balance` перед
`create-replicate-training` (с детерминированным `inv_id` для идемпотентности) и `refund-user-balance` в
`catch`. После этого v2 и копию удалить; v2 сейчас — путь, где деньги списываются, а результат недостижим.

---

## Сводная таблица

| id | P0 | P1 | P2 | главное предложение |
|---|---|---|---|---|
| training-model-start | 1 | 5 | 5 | Вернуть списание/возврат из незарегистрированной копии (`training/generateModelTraining.ts:643-930`) перед `create-replicate-training`; `catch` → `PENDING`→`FAILED`, чтобы дедуп и watchdog не залипали |
| training-model-v2-start | 3 | 6 | 5 | Снять с регистрации (`registerFunctions.ts:108`): `get-bot` сериализует `Telegraf` с токеном, БД пишется после платного API, у BFL-тренировки нет обработчика завершения |
| training-model-complete | 0 | 4 | 4 | `concurrency: { key: event.data.training_id, limit: 1 }`; сузить `select('*')`; уведомлять о `canceled`; refund на `failed` после возврата списания в v1 |
| training-stuck-check | 0 | 4 | 4 | `concurrency: 1`, `retries: 1`; `inngest.send` в цикле → один `step.sendEvent`; ретир 404 — отдельным шагом, статус `FAILED` |
| payment-ai-server-process | 1 | 4 | 5 | CAS `status=PENDING` + сравнение `amount` строки с `IncSum` перед `COMPLETED`; уведомления об ошибке из `catch` (вне шагов) перенести в `onFailure` |
| broadcast-message-send | 1 | 6 | 3 | Батчи по 25 через `step.run('send-batch-<firstId>')` + `step.sleep('1s')`; `RetryAfterError` на 429; `concurrency` по `bot_name`; обязательный `check-permissions` |
| webhook-generation-validate | 0 | 2 | 4 | Guard не блокирует генерацию (`KieAiProvider.ts:423-433`) — либо вызывать `testAllWebhookUrls()` напрямую до платного запроса, либо переименовать в мониторинг и добавить `debounce` |
| **Итого** | **6** | **31** | **30** | |
