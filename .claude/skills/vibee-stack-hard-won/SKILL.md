---
name: "VIBEE stack: hard-won lessons"
description: "Read BEFORE touching the vibee editor, render server, Railway services or the Supabase→Railway migration. Encodes defects that a passing build does NOT catch, dead-code traps that made three separate fixes land in files nobody renders, and the verification rules that caught them. Use when editing apps/vibee-editor, deploying to Railway project 999, or changing anything the bot writes to the assets table."
---

# VIBEE stack: hard-won lessons

Everything here was paid for once. Do not re-derive it.

## THE RULE THAT MATTERS MOST

**A green build proves nothing. Verify on the live deploy.**

Every real defect in this stack passed `npm run build`. Every one was caught by
loading the deployed page and measuring it. If a change is not verified against
the running service, it is not done.

## Dead code that looks alive

This codebase has a repeated pattern: a component is built, committed, and wired
to nothing. Three separate fixes landed in such files before anyone noticed.

Confirmed dead or previously dead:
- `VerticalTabs`, `BottomNavigation` — exported, rendered nowhere. Superseded by
  `TelegramTabBar`.
- `components/AssetBrowser/AssetBrowser.tsx` — **not imported anywhere**.
  `Timeline` has its own inline browser instead.
- `assetBrowser.ts` exports a `CATEGORIES` array that nothing reads. `Timeline`
  declares its **own local** `CATEGORIES` at ~line 588.
- Four RPC wrappers in `getUserBalanceStatsOptimized.ts` call functions that do
  not exist in the database and have zero callers.

**Before editing a component, prove it renders:** grep for its import outside its
own folder, then confirm the element exists in the live DOM.

## Traps by area

### Railway
- `railwayConfigFile` resolves against the **repo root**; service-level
  `dockerfilePath` resolves against the **Root Directory**. Two conventions.
- A service's **first** deployment races the Root Directory setting and builds
  the repo-root Dockerfile. Push a commit to a watched path to get a correct one.
- Root `.dockerignore` patterns are context-root anchored — they do not match
  `apps/**`.
- Applying staged changes needs 2FA; the API cannot. Use the dashboard via
  BrowserOS neo.
- Serve **both** `/health` and `/healthz`: which config wins is not obvious.

### Supabase → Railway Postgres
- `SUPABASE_SERVICE_KEY` is **misnamed**: its JWT decodes to `role=anon`. The
  real one is `SUPABASE_SERVICE_ROLE_KEY`. `getSupabaseKey()` prefers the former,
  so the bot has been querying as anon.
- `DATABASE_URL` in the bot's variables is a dead local placeholder.
- PostgREST serves a full swagger at `GET /rest/v1/` with exact column types —
  authoritative, better than any inference.
- Fetch numerics as `::text`. `JSON.parse` collapses `"30.00"` to `30` and the
  scale is gone. `payments_v2.stars` is `numeric(12,2)`.
- `storage_path`, `trigger_word`, `type` are **NOT NULL** in `assets`.
- Cutover happens in **Infisical, not Railway**: `core/infisical/index.ts:172`
  overwrites `process.env` with every secret at boot.

### The editor
- `supabase-js` always appends `rest/v1` to the base URL (`SupabaseClient.js:78`).
  A bare PostgREST needs a path-stripping gateway.
- `response.statusText` is **empty on HTTP/2**, which is all Railway serves.
  Always include the status code and body in error messages.
- `--touch-target: 44px` exists in `index.css`. Nine controls set height through
  `padding` alone and measured 28px. Use explicit lists, never
  `button { min-height }` — it inflates the dense editor panels.
- Media in `public/` resolves against the **editor's own origin**
  (`MEDIA_ORIGIN`), never the render server, which has no `public/`.

### The render server
- `getPool()` throws **synchronously**. Outside a `try` it escapes an async
  handler and Node 20 kills the process — a one-request DoS.
- `type` in `assets` holds the **model name** (`veo3_fast`), not the media kind.
  Derive video/audio/image from the URL extension.
- The bot does **not** call `vibee-render` — но причина НЕ та, которую я
  записал здесь раньше. Прошлая версия этой строки утверждала, что всё дело в
  захардкоженном несуществующем хосте в `render-server-client.ts`. Это было
  неверно: функция, которая туда ходит (`sendDirectToRenderServer`), **нигде не
  вызывается**. Мёртвый код.

  Настоящая цепочка: визард → `sendRenderAvatarVideoEvent` → Inngest
  (инстанс RENDER, ключи заданы) → `renderRiddleFunction` внутри самого бота.
  Она рабочая: функция зарегистрирована, бот отдаёт `/api/inngest`, health 200.

  Обрыв — в самом конце. Последний шаг шлёт событие **`render/execute`, у
  которого нет ни одного подписчика**: строка встречается во всём `src/` ровно
  один раз (сам `send`), а из 33 подписок render-события это `render`,
  `render-riddle` и `render/avatar-video`. Пайплайн тратит деньги у четырёх
  провайдеров и возвращает `success:true`, не отрендерив ничего.

  Причина архитектурная: путь рассчитан на ферму nexrender с шаблонами After
  Effects по SSH (`.aep`, `server_url/port/user`,
  `composition_name='Instagram_Story'`), а `vibee-render` — это Remotion с
  единственной композицией `SplitTalkingHead`. Две половины не соединяли.

## Сервис может врать о самом себе

`GET /compositions` на рендер-сервере отдавал захардкоженный список из шести
шаблонов. В `render/src/Root.tsx` зарегистрирован **один** — `SplitTalkingHead`.
Пяти из шести не существовало.

Обнаружилось только когда я впервые реально дёрнул рендер:

    POST /render {"compositionId":"TextOverlay"}
      -> 202 {"success":true,"renderId":"e0db6704-..."}
    ...через 15 секунд
      -> {"status":"failed","error":"Could not find composition with ID
          TextOverlay. Available compositions: SplitTalkingHead"}

Два отдельных дефекта в одной цепочке, и оба класса «принять и упасть позже»:

1. **Список возможностей, написанный руками, расходится с кодом.** Он не может
   не разойтись — ничто их не связывает. Списки надо выводить из источника
   (`getCompositions(bundleLocation)` читает тот самый бандл, которым рендерят).
2. **Проверка на входе была только на непустую строку.** Существование
   проверял воркер — асинхронно, когда клиент уже показал человеку прогресс.
   Всё, что можно проверить в момент приёма задачи, надо проверять в момент
   приёма.

Отдельно: `defaultProps` у `SplitTalkingHead` ссылаются на `/public/b-rolls/*`
и `/public/lipsync/lipsync.mp4` — каталога `public/` в приложении рендера нет
вообще, все пять путей отдают 404. Продакшн это не задевает: бот идёт через
`/api/inngest` (`render-riddle`) и передаёт абсолютные URL в payload. Прежде чем
чинить «сломанное», проверь, ходит ли туда продакшн — иначе чинишь декорацию.

## «Сузим позже» не наступает

Я сам написал `scripts/postgrest-roles.sql` с `GRANT ALL ... TO anon` и
комментарием, что сузить это — отдельная задача. Через несколько циклов
проверка показала: `GET /rest/v1/payments_v2` без единого заголовка отдаёт 200
и `content-range 0-0/17135`, `users` отдаёт telegram_id и почты, а анонимный
OpenAPI объявляет `DELETE` и `PATCH` на 11 таблицах. `information_schema`
подтвердил напрямую: у `anon` были DELETE, INSERT, UPDATE и **TRUNCATE** на 14
таблицах.

В PostgREST `anon` — это роль запроса **без токена**, то есть любой человек в
интернете. Балансы считаются суммированием `payments_v2`; один анонимный
DELETE обнулил бы баланс каждого клиента.

Правило: привилегию, которую нельзя обосновать сейчас, не выдают «на время».
И `REVOKE` в идемпотентном скрипте пишут безусловно — иначе повторный прогон
оставит уже выданное на месте.

## Внешний catch съедает твой throw

`getUserBalance` возвращал 0 при ошибке RPC — и ещё раз 0 из внешнего `catch`.
Я добавил `throw` внутри `if (error)`, typecheck прошёл, всё выглядело
сделанным. Бросок ловился двумя кадрами ниже и снова превращался в 0.

Проверять надо не «компилируется ли», а «доходит ли эффект до вызывающего».
Дешёвый способ: удалить свою же строку и убедиться, что тест падает. Здесь —
3 из 6 падают без пробрасывания, 6 из 6 с ним. Тест, который проходит и до
правки, ничего не доказывает.

## Severity меряют по данным, а не по коду

Отчёт называл двойное списание в `modelTrainingV2` «деньгами, утекающими из
бизнеса прямо сейчас». В коде — да. По факту: все 105 платежей за тренировку
имеют `service_type = digital_avatar_body` (v1), ни одного `..._v2`; join на
пары двойных списаний даёт 0 строк; возвратов `Refund for model training` — 0.
Путь ни разу не выполнялся.

Ошибка настоящая и чинить её стоит — но называть латентный дефект активной
утечкой значит потратить чужое доверие. Перед словом «эксплуатируется» сходи
в таблицу и посчитай.

## Не доверяй собственной прошлой записи

Я записал в этот файл как факт, что рендер бота «шлёт задачи в никуда» из-за
несуществующего хоста. Следующий цикл потратил время, идя по этому следу, и
выяснил, что функция с тем хостом вообще не вызывается, а обрыв совсем в другом
месте.

Записанный неверный факт хуже отсутствия записи: он выглядит как проверенное
знание и экономит ровно ту проверку, которая бы его опровергла. Если запись
опирается на чтение кода, а не на живой запрос — так и помечай. И проверяй,
вызывается ли вообще функция, прежде чем объяснять через неё поведение
системы.

## Self-hosted Inngest на Railway: три отдельные причины 502

Сервис `inngest/inngest` крутился в петле перезапуска. Три разные ошибки
подряд, каждая видна только после починки предыдущей:

1. `signing-key must be valid hex string: invalid byte U+006D 'm'` —
   `INNGEST_SIGNING_KEY` был 32-символьной случайной строкой. Inngest требует
   именно hex. `openssl rand -hex 32`.
2. `at least one event-key is required` — `INNGEST_EVENT_KEY` не задан вовсе.
3. Деплой уже SUCCESS, но домен всё ещё 502: у домена `targetPort: null`, а
   Inngest слушает `INNGEST_PORT=8288`, которого Railway не знает. Помогает
   `PORT=8288` — прокси ищет именно его.

Вывод шире Inngest: «упало» на Railway — это часто очередь из нескольких
независимых причин. Смотри логи ПОСЛЕ каждой правки, а не после всех сразу, и
не считай зелёный статус деплоя ответом сервиса — статус был SUCCESS, пока
домен отдавал 502.

## Я написал инструмент, напечатал ответ и не прочитал его

Сверка отправляемых событий с подписками (`npm run check:events`) нашла
осиротевшее `neuro/photo.failed` — генерация падала, человек не получал ничего.
Я починил уведомление в `functions/generation/neuroImageGeneration.ts`,
typecheck прошёл, PR ушёл.

Функция не запускается. Она подписана на `neuro/photo.generate`, а это событие
встречается во всём репозитории только в двух объявлениях подписки —
отправителя нет. Живой путь другой: `neuroPhotoWizard` зовёт
`generateNeuroPhotoHybrid` напрямую, без Inngest.

Мой же скрипт напечатал `neuro/photo.generate` во второй половине вывода —
«подписка есть, но никто не шлёт». Я прочитал первую половину и правил файл,
считая его живым. Четвёртый раз в этом репозитории и первый — при наличии
инструмента, который прямо об этом сказал.

Из этого две вещи:

1. **Подписка без отправителя у ЗАРЕГИСТРИРОВАННОЙ функции важнее списка
   осиротевших событий.** Такая функция развёрнута, выглядит живой и не может
   быть запущена ничем. Скрипт теперь печатает её первой и словом
   «НЕДОСТИЖИМА». Таких — 16 из 23.
2. **Инструмент помогает, только если дочитать его вывод.** Прежде чем править
   файл с Inngest-функцией — найди отправителя её события. Одна команда grep.

Оговорка, которую скрипт печатает сам: он видит отправителей только внутри
репозитория. Вебхук или панель Inngest он не видит, поэтому его список —
кандидаты на проверку, а не приговор.

## Главное про Inngest в этом проекте: 16 из 23 функций недостижимы

Не единичный баг, а устойчивый паттерн. Inngest-функции написаны как ВТОРАЯ
реализация того, что бот уже делает прямым вызовом сервиса, и к событиям их
никогда не подключили. Функция зарегистрирована, развёрнута, выглядит рабочей —
и не запускается ничем.

Подтверждено трижды, каждый раз с живым двойником рядом:

| Inngest-функция (недостижима) | Что работает на самом деле |
|---|---|
| `neuro/photo.generate` | `generateNeuroPhotoHybrid`, прямой вызов из визарда |
| `broadcast/send-message` | `services/plan_b/broadcast.service.ts` |
| `model/training.v2.requested` | v1 `generateModelTraining` — все 105 платежей за тренировку это `digital_avatar_body`, ни одного `_v2` |

Отсюда следствия, которые уже стоили нескольких циклов:

- Правка в Inngest-функции по умолчанию НИЧЕГО не меняет. Сначала найди
  отправителя её события: `npm run check:events` или один grep по имени.
- «Функция есть и она в registerFunctions» — не доказательство, что она
  работает. Регистрация означает только, что Inngest о ней знает.
- Ошибку в поведении бота ищи в сервисах и сценах, а не в `inngest_app/`.

Оговорка: скрипт видит отправителей только внутри репозитория. Вебхук и панель
Inngest ему не видны, поэтому 16 — это кандидаты на проверку, а не
доказанный ноль.

## Мёртвый домен three-head-dragon.shop в цепочках fallback

`three-head-dragon.shop` резолвится в `188.137.250.69` — СТАРЫЙ сервер, с
которого проект переехал на Railway. Он не отвечает: HTTP 000 по https, по
http, по голому IP и по самому пути коллбэка.

Домен стоит последним элементом в десятках цепочек вида
`process.env.X || 'https://three-head-dragon.shop'`. Опасность не в самом
fallback, а в повторяющейся ошибке: **нужная переменная в проде задана, но её
забыли внести именно в ЭТУ цепочку.** Найдено трижды подряд:

| Цепочка | Что было не так |
|---|---|
| `BASE_PAYMENT_URL` | `BASE_WEBHOOK_URL` задана, но её не было в цепочке → ResultURL Robokassa (серверное подтверждение оплаты) уезжал на мёртвый хост |
| `botBaseUrl` в `inngest-provider.ts` | `BOT_INNGEST_BASE_URL` задана, в цепочке только `INNGEST_BASE_URL`, которой нет |
| `webhookUrl` в AI Reels, `urls.get/cancel` в lipsync | Зашито вообще без альтернативы |

Правило: увидел `env.X || 'literal-домен'` — проверь, какие переменные РЕАЛЬНО
заданы в Railway, а не какие выглядят правильными в коде. Одна команда:
`railway variables -s <сервис> --kv | grep URL`.

Трекер: `npm run check:dead-domain`. Он намеренно НЕ роняет сборку — деление
«зашито / fallback» грубое и даёт ложные срабатывания на тексте предупреждений
и многострочных цепочках. Ворота можно включить, когда список опустеет.

## grep по выводу tsc молча врёт

`npx tsc --noEmit ... 2>&1 | grep -c "error TS"` вернул **0** на прогоне, где
была настоящая ошибка. Причина: tsc раскрашивает вывод, между словом `error` и
кодом `TS2688` стоят ANSI-последовательности, и литерал `error TS` не совпадает.

Я на этом основании заявил себе «в тестах 0 ошибок типов». Настоящее число —
1230. Всегда `--pretty false` (или `NO_COLOR=1`), когда считаешь ошибки грепом.

Тот же класс: `grep -c` на пустом выводе даёт `0`, что неотличимо от «проверка
прошла». Смотри код возврата, а не только число.

## Тесты в этом проекте не проверялись НИЧЕМ

`tsconfig.json` исключает все тестовые пути (строки 70-76): `__tests__`,
`**/*.test.ts`, `src/tests`, `src/helpers/test`. Поэтому `npm run typecheck` с
его «0 ошибок» не говорит о тестах ровно ничего.

Что там на самом деле (`npm run typecheck:tests`, конфиг `tsconfig.test.json`):
1230 ошибок типов. Из них 30 — TS2305, импорт символа, которого в модуле нет.
Такой тест не проходил ни разу с момента написания, и никакой командой в
репозитории это нельзя было увидеть.

Плюс к этому: из 182 файлов тестов 21 запускался НЕ ТЕМ раннером — 11 импортов
из `bun:test` под vitest и 10 Playwright-спек из `apps/`, которые корневой
прогон подхватывал. Они падали на загрузке модуля, ни один assert не
исполнялся. При 99 красных файлах из 182 отличить новую поломку от постоянного
шума было нельзя, то есть прогон не нёс сигнала вообще.

Правило: прежде чем верить зелёному `typecheck` или списку падений — проверь,
что именно входит в прогон. `tsc --listFiles | grep -c test` и
`exclude` в конфиге отвечают на это за секунду.

## Прослеживай значение до конца, а не до второй строки

Я написал в PR, что `botBaseUrl` — «используется клиентом двумя строками ниже,
так что правка не декоративна». Неверно. `new Inngest({ name, eventKey })`
не получает `baseUrl` вовсе; поле кладётся в объект конфигурации и встречается
дальше только в трёх logger-вызовах. Отправка идёт через `config.client.send()`,
а общий клиент создан без `baseUrl`, поэтому SDK берёт своё умолчание
`https://inn.gs/` (`node_modules/inngest/helpers/consts.js:180`).

Я увидел `baseUrl: botBaseUrl` в литерале объекта и решил, что это аргумент
SDK. Разница между «положено в мой объект» и «передано в чужую библиотеку» —
как раз то, что делает правку настоящей или косметической. Дочитывай до вызова.

## Мёртвый домен: закрыто, с воротами

`three-head-dragon.shop` (188.137.250.69) убран из кода полностью — 19 мест.
`npm run check:dead-domain` теперь ПАДАЕТ при его возврате (проверено в обе
стороны: вернул в один файл — выход 1, откатил — 0). Намеренные упоминания
помечаются `// dead-domain-ok: причина` на строке выше; такое ровно одно —
детектор в `diagnostic.routes.ts`, который предупреждает, что webhook указывает
на мёртвый хост.

В самой Railway три переменные были ЗАДАНЫ на мёртвый домен: `ORIGIN`,
`SERVER_API_URL`, `WEBHOOK_DOMAIN`. Переставлены на Railway-домен, а не удалены:
удаление перевернуло бы ветки `if (!webhookDomain)`. И это обезвредило ловушку —
`SERVER_API_URL` не читается ничем, поэтому «очевидное исправление опечатки» в
`API_SERVER_URL` поставило бы мёртвый хост ПЕРВЫМ в платёжной цепочке Robokassa,
впереди рабочей `BASE_WEBHOOK_URL`.

Главный вывод: пустая строка в конце цепочки лучше мёртвого литерала. Мёртвый
хост превращает «ничего не настроено» в «настроено на сервер, которого нет», и
отказ становится молчаливым.

## Чего я про TS2709 так и не выяснил

576 из 1230 ошибок в тестах — `Cannot use namespace 'Mock' as a type`. Две мои
гипотезы опровергнуты собственными замерами:

1. «Нужен `import type` вместо значения» — скрипт переписал 54 файла, ошибок
   осталось ровно 1230, TS2709 те же 576. Откатил.
2. «Это артефакт моего `typeRoots`» — без него те же 576.

Установлено: `vitest` действительно реэкспортирует `Mock` из `@vitest/spy`
(`node_modules/vitest/dist/index.d.ts:17`), а сам `Mock` — интерфейс
(`@vitest/spy/dist/index.d.ts:308`). То есть импорт корректен, но TS всё равно
резолвит namespace.

Причина НЕ найдена. Круг сужен, ТРИ гипотезы опровергнуты замерами — не
повторяй их:

1. «нужен `import type`» — 54 файла переписаны, счёт остался ровно 1230/576.
2. «артефакт `typeRoots`» — без него те же 576.
3. «легаси `moduleResolution: node`» — с `bundler` + `module: esnext` те же 576.

Установлено дополнительно:
- `@vitest/spy` 3.2.4 УСТАНОВЛЕН и присутствует в программе (`--explainFiles`
  даёт 5 упоминаний), `vitest/dist/index.d.ts:17` его реэкспортирует;
- все 54 падающих файла импортируют `Mock` из `'vitest'` — пропущенных импортов
  нет ни одного;
- в программе 176 файлов `undici-types` (через `@types/node`), объявляющих
  глобальные `Mock*`-сущности.

Счёт 1230/576 не меняется НИ ПРИ КАКОЙ конфигурации, которую я пробовал. Это
само по себе подсказка: причина, похоже, не в настройках компилятора. Следующий
заход — сузить до одного файла и одной строки (`tsc` на единственном тесте) и
смотреть, чем именно TS считает `Mock` в этой позиции.

## Коллбэк рендера не знал, каким ботом отдавать видео

`sendCallback` (`functions/render/helpers/renderSteps.ts:315`) шлёт ровно
`{ download_url }` — ни `bot_name`, ни `telegram_id`, ни metadata. А `render.ts`
и сам знает только `job_id` и `callback_url`, так что послать больше нечего.

Поэтому в обработчике `payload.bot_name || payload.metadata?.bot_name` был
undefined ВСЕГДА, и выбор бота падал на захардкоженную карту из пяти
владельцев. Остальным видео уходило через `defaultBot` — то есть не из того
бота, в котором его заказали.

Решение — не тащить значение через чужой payload, а положить его В САМ URL:
`?bot=<name>` собирается в `createRenderAvatarPayload`, где бот известен
достоверно. Ничего в рендер-сервере менять не пришлось, и потеряться по дороге
такое не может.

**Карта из пяти строк противоречила базе по КАЖДОЙ существующей строке**
(144022504: карта говорит `neuro_blogger_bot`, база — `HaimGroupMedia_bot`; и так
все четыре, пятого пользователя в базе нет). Значения выглядят перетасованными.
Какая сторона врёт — неизвестно, и это и есть довод: рукописная таблица из пяти
строк, расходящаяся с данными, не должна решать, кто получит видео.

Кто прав — выяснено по `payments_v2` (каким ботом человек РЕАЛЬНО платит):
**ни один источник не прав целиком.** Для 352374518 и 1254048880 права база,
для 7669741878 — карта, для 1852726961 оба неверны, а у 144022504 доминирующего
бота нет вовсе. Отсюда и вывод: достоверен только `?bot=` из самой задачи.

Общее правило: когда два справочника расходятся, не выбирай между ними — найди
третий источник, который отражает поведение, а не намерение. Здесь это платежи.

Отдельно: `users.bot_name` — это бот, через которого человек ЗАРЕГИСТРИРОВАЛСЯ,
а не бот, которым он владеет. Я сначала заменил карту на запрос к базе, считая
иначе; сравнение выше опровергло это ДО отправки. Прежде чем строить логику на
колонке — проверь, что она значит, на данных, а не по названию.

## AI Reels падает на ПЕРВОЙ строке, а не на render/execute

Несколько циклов я считал осиротевшее событие `render/execute` последним
обрывом. Это пятый обрыв, а не последний. Пайплайн умирает раньше всех трат:

`renderRiddle.ts:57` первой же строкой вызывает
`validateRenderRiddleEventData(event.data)`, и payload, который строит
`createRenderAvatarPayload` и шлют ВСЕ ЧЕТЫРЕ визарда, эту схему НЕ ПРОХОДИТ.
Проверено прогоном `RenderRiddleEventDataSchema.safeParse` — восемь причин, для
любого из трёх сервисов:

    kie_api_key            Invalid KIE API key
    eleven_labs_api_key    Invalid ElevenLabs API key
    avatar_gen_service     must be "hedra" or "heygen"   ← 'fal' схемой не принят
    avatar_settings.avatar_speech   Required
    avatar_settings.api_key         Required
    cover_url              Invalid cover URL   ← пустая строка не проходит .url()
    circle_position        Required
    circle_scale           Required

Отсюда правило: **прежде чем чинить звено, прогони вход через его собственную
схему.** Одна команда `safeParse` даёт больше, чем цикл чтения кода — и она бы
сэкономила несколько циклов, потраченных на звенья ниже по течению.

Ещё: путь nexrender списан целиком — нет таблицы `render_servers` НИ в
Postgres-NFrq, НИ в боевом Supabase (42P01), нет `SSH_KEY_STRING`, нет колонки
`templates.aep_object_key`, которую читает `steps.ts:1404`, а живой Remotion на
`Instagram_Story` отвечает 400 со списком реальных композиций. Согласовывать
имена событий бессмысленно.

## zod: .optional() принимает undefined, но НЕ null

Я поставил `callback_url: null` для случая «переменной нет» — и добавил девятую
причину отказа к восьми существующим: `Expected string, received null`.
`z.string().url().optional()` — это `string | undefined`, без `null`.
Для «значения нет» в zod-схемах ставь `undefined`.

## Self-check before reporting done

1. Does the changed component actually render? (live DOM, not build)
2. Did the deploy pick up the commit? (compare deployed commitHash to HEAD)
3. Does the endpoint answer from the caller's origin? (CORS, auth headers)
4. For data: counts AND exact sums as text, not counts alone.
5. Say plainly what was NOT verified. A green build is not verification.
