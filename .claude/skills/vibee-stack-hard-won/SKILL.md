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

## Self-check before reporting done

1. Does the changed component actually render? (live DOM, not build)
2. Did the deploy pick up the commit? (compare deployed commitHash to HEAD)
3. Does the endpoint answer from the caller's origin? (CORS, auth headers)
4. For data: counts AND exact sums as text, not counts alone.
5. Say plainly what was NOT verified. A green build is not verification.
