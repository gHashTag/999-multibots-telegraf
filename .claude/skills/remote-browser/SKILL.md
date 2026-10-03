---
name: 'Remote Browser (agentic browser per client)'
description: 'Свой браузер на клиента: под, брокер, прокси /live/, профиль, гашение, вкладка в мини-аппе, уведомление в боте. Загружать ПЕРЕД любой правкой apps/vibee-editor/render/src/browser/*, deployment/remote-browser/, nginx-шаблона плеера или страницы /browser, а также при словах «удалённый браузер», «агентный браузер», «под», «neko», «смотреть за агентом».'
---

# Remote Browser

Один браузер на человека, два пульта: человек смотрит поток и в любой момент
берёт руль, агент водит тот же самый Chromium. Полная архитектура и все замеры —
`docs/architecture/remote-browser-per-user.md` (раздел 1 — вердикт, 2 — числа)
и `docs/architecture/remote-browser-f0-measurements.md` (сырые прогоны).

## When to Use This Skill

- Правка `apps/vibee-editor/render/src/browser/*`, `deployment/remote-browser/`,
  `apps/vibee-editor/nginx/default.conf.template`, `player/src/pages/Browser.tsx`.
- Вопросы «почему открывается отдельной вкладкой», «почему браузер погас»,
  «почему агент не видит браузер», «почему картинки нет».
- Перед тем как предложить «просто выставить порт наружу».

## Четыре правила, нарушение любого ломает всё

1. **Порт браузера (CDP, MCP) не смотрит наружу никогда.** Измерено: MCP у neo
   пускает без заголовка `Authorization`. Кто дотянулся до CDP — читает все
   куки и действует от имени человека.
2. **Один человек = один под = один профиль.** Это PRIMARY KEY таблицы
   `browser_sessions`, а не дисциплина.
3. **Под не видит нашу сеть.** Страница — недоверенные данные; текст на ней,
   зовущий по внутреннему адресу, не должен иметь возможности сработать.
4. **Пароль не видит ни агент, ни мы.** Человек логинится сам внутри потока,
   обратно идёт только видео. Это свойство neko, а не наша договорённость.

## Ловушки, которые уже стоили времени

**Headful Chromium игнорирует `--remote-debugging-address`** и слушает CDP
только на loopback ВНУТРИ контейнера. Опубликованный порт молчит при живом
контейнере. Поэтому в образе есть `cdp-bridge.conf` с socat — и этот порт
наружу не публикуется.

**`USER neko` в Dockerfile убивает контейнер.** Базовый образ neko работает от
ROOT, а `neko` — это ПЕРЕМЕННАЯ ОКРУЖЕНИЯ, которую его supervisord читает
(`user=%(ENV_USER)s`), чтобы сбросить привилегии самому. Смена пользователя
образа делает supervisord не-root процессом, и контейнер падает на старте:
`Can't drop privilege as nonroot user`.

**Агент не может водить браузер: политика запрещает отладчик.** В образе neko
лежит `/etc/chromium/policies/managed/policies.json` с
`"DeveloperToolsAvailability": 2` — DevTools запрещены. Симптомов три и ни один
не называет причину: HTTP-ручки CDP отвечают нормально, `Browser.getVersion` на
браузерном сокете отвечает, `Target.attachToTarget` возвращает `Not allowed`, а
сокет СТРАНИЦЫ принимает подключение и молчит на любую команду. Значение
меняется на 1 в нашем Dockerfile — правкой, а не удалением файла, чтобы
остальные ограничения образа остались.

**Сокет страницы не отвечает, браузерный отвечает.** Ходить надо на
`/devtools/browser/…`, прикрепляться `Target.attachToTarget({flatten:true})` и
адресовать вкладку по `sessionId`. Прямое подключение к `/devtools/page/<id>`
открывается и молчит.

**`docker rm -f` — это SIGKILL, и он теряет логины.** Chromium дописывает
сессионные куки при штатном завершении. Останавливать только `docker stop -t 15`,
потом `rm`.

**`--bwsi` в конфиге neko убивает всю затею.** Это гостевой режим, профиль
выбрасывается. Убран в `deployment/remote-browser/chromium.conf`.

**Пароль пода едет в адресе сокета, а не в теле POST.** Страница шлёт
`new WebSocket(url + "?password=…")`, а `/api/login` neko зовёт сам у себя
(в логе `agent: Go-http-client`, `module=legacy`). Подменять надо строку
запроса апгрейда.

**neko вычищает `pwd` из адреса**, поэтому перезагрузка возвращает форму
пароля. Параметры автологина выдаются на КАЖДУЮ загрузку документа.

**Картинки не будет без мультиплексированного порта.** Без `NEKO_WEBRTC_UDPMUX`
/`TCPMUX` и `NAT1TO1` под объявляет ICE-кандидатов на адресе контейнера и в
логе пишет `ICE connection state changed: failed`. Порт публикуется ТЕМ ЖЕ
номером — номер уходит в кандидата.

**Статусный опрос — не использование.** Мини-апп опрашивает сессию каждые 10
секунд; если это обновляет `last_seen_at`, поды не гаснут никогда. Признак
жизни — открытый сокет зрителя.

**Кука `SameSite=Lax` не ходит в чужой origin.** Поэтому `/live/` проксируется
nginx-ом под origin приложения. `SameSite=None` не спасает: Telegram на iOS —
WKWebView, он режет сторонние куки.

**`location /live/` объявлен ПОСЛЕ `location = /index.html`**, потому что
`tri-frame-ancestors.test.ts` в отрицательном контроле называет «строку 2» и
имеет в виду копию политики оттуда.

## Площадки

|                   | может                                        | не может              |
| ----------------- | -------------------------------------------- | --------------------- |
| Railway           | держать под как сервис, TCP-прокси для медиа | машину на сессию, UDP |
| docker (локально) | всё, драйвер `docker`                        | это не прод           |
| Fly Machines      | машину на сессию, гашение                    | ещё не поднято        |

Драйвер выбирается `BROWSER_POD_DRIVER`: `docker` | `fixed` (+`BROWSER_POD_ENDPOINT`).
Не задан — маршрут честно отвечает 503, и сторож в мини-аппе перестаёт
опрашивать.

### Под на Railway (с 2026-09-21)

- **Регион — Singapore** (`asia-southeast1-eqsg3a`): до пода ~300 мс из
  UTC+7 было в Калифорнии, это и было «всё виснет». Рендер остался в США:
  вызовы CDP идут через океан, первый после смены адреса — долгий (прогрев).
- **Профиль на томе** `/home/neko/.config/chromium`. Без тома любой
  редеплой стирал все входы. `own-profile.sh` (root) отдаёт том `neko` и
  запускает штатный `supervisord`.
- **Выкатка пода — руками**, мерж её не делает:
  `cd deployment/remote-browser && railway up --service browser-pod --detach`.
- **Ловушка региона тома.** `railway volume add` создаёт том в СТАРОМ
  регионе сервиса (`sfo`), выкатка в новый регион падает на шаге
  `MIGRATE_VOLUMES` без логов. Причину видно только в
  `deploymentEvents` GraphQL API. Том создавать через `volumeCreate` с
  явным `region`. Токен CLI: `~/.railway/config.json` → `user.accessToken`.
- **Ловушка `railway scale`.** `us-west=0` не гасит ключ `sfo`: получится
  две реплики в двух регионах — два пода, два профиля. Гасить явно
  `sfo=0` и сверять `multiRegionConfig` в `deployment list --json`.
- **Политику Chromium править только jq** и проверять `jq -e` в сборке:
  нечитаемый файл Chromium игнорирует целиком, вместе с запретами.
- **Меню размеров neko читается один раз при старте**, а новый режим живёт
  на 29 Гц (§41 разбора). Любой запрос размера, даже отказанный,
  перезапускает видео.

## Проверки, которые есть

    npx tsx scripts/browser-live-check.ts     # драйвер против настоящего docker
    npx tsx scripts/browser-live-e2e.ts       # вся цепочка, 10 проверок
    npx tsx scripts/browser-profile-check.ts  # профиль переживает перезапуск
    npx tsx scripts/browser-live-serve.ts     # поднять и посмотреть глазами

Live, against the owner's real pod, through the agent's own door (`/mcp` +
agent key) -- the full case list is the header of `bin/helpers/b.sh`
(`tri browser help`); not copied here:

    tri browser                   # health: pod answers since when + tabs vs cap
    tri browser status            # tabs with ids; * = where the tools act
    tri browser find "words" ID   # where a click WOULD land -- no click
    tri browser blank ID          # why a page is empty: the error that killed it
                                  #   staleTab = tab runs an older build -> reload
    tri browser reload ID         # reload one tab (after a deploy, before judging)
    tri browser layers ID         # find says NOT FOUND: shadow roots + iframes
    tri browser composer ID       # what is in X's boxes now; no presses
    tri browser wait "words" [S]  # poll until the words appear; rc 1 = never did
    tri browser logins            # which networks are signed in (names only)
    tri browser share-check [SLUG] # the desk's publish look on every signed-in
                                  #   network: opens, finds the button, NEVER
                                  #   presses, closes only its own tab (#3434)
    tri browser time [URL]        # new-tab latency; closes only what it opened
    tri browser call TOOL '{..}'  # any tool, raw
    tri browser cover             # every registry tool has a case? rc 1 names gaps
    tri browser doctor            # FIRST, every loop tick: every tab read, nothing driven
    tri browser tidy              # abandoned tabs and why; list only, no visit
    tri browser tidy ask [ID...]  # ONE real card: "close these N?" (a day to answer)
    tri browser tidy apply QID    # after his "allow": close exactly those, once
    tri browser swept [SINCE]     # what the sweep/room-making closed, by host,
                                  #   beside the desk lines (logs only, #3471)

Pick the command by the symptom, and keep `cover` at rc 0: a tool added to
`agent-tools.ts` without a case in `b.sh` is a tool nobody can check by hand.
`ask` and `ask-input` send a REAL question to the owner's phone -- not for
smoke tests. A tab opened before a deploy keeps the old bundle and can show a
bug that is already fixed live; `blank` says `staleTab`, `reload` cures it.

**Start every loop tick with `tri browser doctor`.** It lists the tabs against
`TAB_CAP`, runs `cover`, and reads EVERY tab on the server: blank page,
staleTab (an older build than the site serves), unsent text in X's composer.
Each anomaly comes with the command that fixes it; rc 0 clean, 1 anomalies, 2
could not ask. It fixes nothing itself.

**How it reads without driving: `browser_status {shape: true}`**
(`render/src/browser/tab-shape.ts`). CDP evaluates in a BACKGROUND target
too (`evaluateOn`), so no tab is fronted, and the status door (`podToLookAt`)
never starts a visit. Only counts come back -- nodes, characters, composer
characters -- never page text. Not read, and said so per tab: sensitive
places (`guard.ts`: running code there needs a fresh yes), the browser's own
pages, and a page that throws or hangs (12 s each, in parallel), which is
named as such rather than blamed on the guard. A render older than
tab-shape.ts refuses `shape`; doctor then lists without reading and says so.

**History, so nobody reaches for the front again.** The first doctor (#3392)
toured tabs through the front, and a page-reading tool with no visit on
record STARTS a visit (`liveSession` -> `startBrowserAsAgent`), which
messages the owner: a "read-only" check wrote to him at 02:36. Every agent
tool that reads goes through that door -- `blank`, `read`, `composer` --
so reading one tab by hand still starts a visit; doctor does not need to.

`watchedByThePerson` means "a visit row is live". It does NOT mean eyes on
the screen, and the agent's own reads create that row. If it flips to true
in the middle of your work, ask whether you started the visit yourself.

staleTab is a subset test (a module the site serves now that the tab
lacks; runtime-injected modules do not count), and the sweep checks it only
on our own sites (`t27.ai` and subdomains), re-fetched with
`credentials: omit`: our pages are public, while a second GET of someone
else's page with his cookies can spend a one-time context (Instagram's
two-step URL carries one). A staleTab on a tab with composer text says
`composer ID` first: a reload throws the draft away.

**Litter tabs are his call: `browser_tidy`** (`render/src/browser/tab-tidy.ts`,
2026-10-03). The first all-tab sweep found ten tabs on his pod, four of them
dead weight: a Reddit submit form, an Instagram sign-in stuck at two-step,
two raw GitHub files. `tab-sweep.ts` closes duplicates above `TAB_CAP` on its
own; a half-filled form is NOT litter until he says so. Three steps, only the
last touches the browser:

1. LIST (`tri browser tidy`): unfinished form (`/submit`, `/compose`,
   `shareActive`), stuck sign-in (`/login`, `two_step_verification`,
   `/checkpoint`...), raw file (raw.githubusercontent, api.github), empty
   tab beside real ones, duplicate URL, or an id named by hand. Never every
   tab: when all qualify, the first stays. Doctor counts them.
2. ASK (`tidy ask`): one approval card listing host/path and reason, TTL 24 h
   so a night loop can ask and he answers in the morning. The exact id+URL
   pairs are stored with the question (`browser_tidy_asks`), so his yes is a
   yes to THOSE tabs, not to whatever the next listing holds.
3. APPLY (`tidy apply QID`): only on `allowed`, only by his own telegram id,
   refused while he holds the wheel, once (one atomic UPDATE claims the row,
   AFTER the pod answered, so a dead pod does not spend the yes). A tab whose
   URL changed since the question is skipped and named, and the last open
   page always stays (he may have closed the others himself before his yes).

Do not `tidy ask` at night without a reason: it is a real card on his phone.
Ask once (#3449): while a tidy question is still pending (24 h for a tidy
card, `TIDY_TTL_MS`; a row with an empty `ttl_ms` gets the approvals module's
10 minutes) or allowed but not applied, `browser_tidy` makes no new card and
returns `open` instead; `tri browser doctor` then prints
`вопрос уже у владельца (QID), ждём «Разрешить»` or points to
`tidy apply QID`. Only an expired or denied question lets a new card through.

`bun run verify` runs `cover` as the `browser-cover` step.
`ask WHAT S` refuses S over 120 (the server clipped it silently);
`ask-input choice WHY "A|B|C"` asks him to press one option.

## Related Resources

- `docs/architecture/remote-browser-per-user.md` — решения и причины
- `docs/architecture/remote-browser-f0-measurements.md` — сырые числа
- `deployment/remote-browser/` — образ пода
- Навык `blind-guards` — перед правкой любого теста отсюда

---

## The agent owns every browser tool (2026-09-21)

Nine tools, in the SAME registry every agent already reaches through `/mcp`,
so an agent connected yesterday sees them today:

```
browser_status   browser_open    browser_read     browser_screenshot
browser_click    browser_type    browser_evaluate browser_close_tab
browser_ask_permission
```

**They are in the compact kit too** (`COMPACT_TOOLS` in `src/agent/tools.ts`),
which is how a 16k-window model sees them at all. That cost raising the pinned
schema budget from 6000 to 7000 tokens, and the cost is stated rather than
hidden: 16k minus a ~5k prompt minus 7k of schemas leaves about 4k for the
conversation. If that proves too tight, the lever is the DESCRIPTIONS --
`browser_ask_permission` is 254 tokens of prose on its own -- not dropping
tools. An agent that can click but cannot ask permission is an agent the
guard stops with no way through.

### Checking that an agent really has them

```bash
# the registry, as the agent sees it
cd apps/vibee-editor/render && npx vitest run provider.test.ts

# a real pod, driven end to end through the tools
npx tsx scripts/browser-agent-check.ts
```

### The window is ours

`src/browser/skin.ts` rewrites only the document's HEAD as it passes through
the proxy: our mark, our type (Outfit), the app's own palette, the footer
pinned into the top bar, frosted glass over a full-window picture, and our
loader. The stream, the input channel, the scripts and every asset stream
through untouched -- paint, not a fork.

**Four traps, all paid for:**

- A BACKTICK in a comment inside `BRAND_CSS` ends the template. It happened
  four times. `browser-skin-source.test.ts` reads the file as TEXT so it
  still fails when the module will not compile.
- The `font` SHORTHAND on `.avatar` beat neko's inline `line-height: 50px`
  and put the initials outside the circle. Family and weight only; if the
  size is set, line-height must equal height.
- Forcing the font family on every node killed the Font Awesome glyphs.
- Boxes can measure identical and still LOOK crooked: an inline icon sits on
  the font's baseline, not in the middle of its box. Flex-centre the glyph,
  not only its cell.

---

## Night of 2026-09-21/22: "the window is grey" -- how it was found

**Diagnose in this order, and do not guess past a step.** The evening went
wrong three times on guesses (screen modes, autoplay, a window off-screen);
each fell to one measurement.

1. **Is the pod's screen alive?** `browser_screenshot { desktop: true }`
   (neko's admin shot of the X screen, not the CDP page). If it shows
   Chromium, the pod is fine and the fault is between the pod and the eye.
2. **Is the video arriving?** Connect a viewer yourself (BrowserOS neo on the
   `viewUrl`), then in the page: `video.videoWidth`, `!video.paused`,
   `currentTime` advancing, and draw one frame to a canvas -- mean luma
   near 0 is a black stream, anything else is real pixels.
3. **What is on top?** `document.elementFromPoint(centre)`. On this night it
   answered `DIV.emotes`: neko's flying-emoji layer, the exact size of the
   picture, painted `#111` by our skin's `.emotes` rules (meant for the
   emoji picker) and taking every click. Fix: `.player-container > .emotes`
   transparent + `pointer-events: none` (#2743).

**Traps paid for:**

- **A hidden frame measures 0 x 0 and still fires `resize`.** The app keeps
  its Browser tab mounted; its 0 was read as "the smallest screen" and two
  windows took turns resizing the pod -- ten video restarts a minute.
  `isVisibleBox` refuses boxes under 2 px on both fit doors; the window's fit
  script asks only while visible and reclaims the screen once when shown
  again (#2739).
- **The chat model does not see pictures.** A screenshot reached it as 80 KB
  of base64 text and it described a screen it never saw ("the Queen's
  board") while the real one was a Google sign-in. `tool-content.ts` swaps
  pictures for a note, every shot carries `tabs` in text (#2755), and `seen`
  is our own vision endpoint's description (#2762). **Never trust an agent's
  description of a screenshot without `seen` or tabs to back it.**
- **The board is a separate repo.** The Queen's BROWSER view lives in
  `gHashTag/trinity` (`apps/website`), shipped here by bumping `QUEEN_REF`
  in `apps/vibee-editor/Dockerfile`. Its PRs need the `T27 work report`
  block (`scripts/pr_blog_report.py validate`) or the merge is refused.
  A panel over the hive must be `position: relative` or the hive paints over
  it; keep z-index under the HUD menu (5-9) and hide the scene instead.
- **Merged is not shipped.** Railway lost the GitHub source of four
  services the same night; later a build failed its healthcheck and Railway
  kept the old one. `tri drift` names UNWIRED / STALLED / FAILING per
  service; a daily task runs it.

**Two doors a checker needs, and how to use them without leaking:**

- agent key for `/mcp` and `/api/agent/chat` -- recipe in
  `mcp-owner-access`; the owner's pod session opens with
  `POST /api/browser/session` and `X-Agent-Key`.
- neko admin through the proxy: `POST /live/<id>/api/login` with the pod's
  admin password (`NEKO_MEMBER_MULTIUSER_ADMIN_PASSWORD` of `browser-pod`,
  read into a variable, never printed), then `Authorization: Bearer <token>`
  on `/api/room/screen/shot.jpg`. A member login (placeholder password
  `proxied-by-the-broker`) gets 403 there.
- A view URL with `?t=` in a tool call is a credential in the transcript:
  close the session afterwards (`DELETE /api/browser/session`, logins kept)
  so the token dies.

## The wheel is real (2026-09-22, #2794)

The person takes the wheel by touching the picture and gives it back with
"Hand back". The server knows: `person_wheel_until` on `browser_sessions`,
a 10-minute lease renewed by every touch (the app renews at most every
30 s). While it holds, the acting tools -- open, click, type, evaluate,
close tab -- throw WHEEL_TAKEN with the reason; status, read, screenshot
and ask-permission go on. `POST /api/browser/wheel?holder=person|agent` is
the person's door only: an agent key gets 403 (checked live). Every step,
refusals included, is in the journal: `tri journal`.

If an agent "does nothing" in a live browser, first `tri journal` -- a row
of refused clicks with "taken the wheel" means the person is driving, not
that the agent is broken.

**Who drives is in the session answer** (`GET /api/browser/session` ->
`wheel: 'person' | 'agent'`, #2797), so a page opened later shows the
truth. Both doors take and give the wheel: the app's Browser tab and the
Queen's BROWSER panel (gHashTag/trinity#1109). A press inside a frame
never bubbles to the page around it -- listen on the frame's OWN window
(same origin), and re-attach on every load: the window reloads itself to
reconnect.

**Probes stay out of the person's journal** (#2803). A health check that
calls the person's browser tools sets MCP `params._meta.probe: true`; /mcp
passes it as `ctx.probe`, the journal keeps probes apart (last 20) and
`GET /api/browser/journal` hides them unless `probes=1`.

**A look is a probe; anything he can see happen is not** (#3434, 03.10).
`bin/helpers/b.sh` sends status|tabs|read|shot|desk|wait|layers|composer and
`tri logins` with the probe by default (doctor and tidy mark their reads by
hand). An unmarked `tri logins` was journaled as agent work, and two minutes
later the owner got an "agent work over the connection" report. `find` scrolls
the page and `share-check` opens tabs, so both stay journaled and reported
(only share-check's cookie-name read is a probe): there is no invisible mode. A
probe that finds the pod running with no visit row (the reaper took it) is told
exactly that (`noBrowserError` in agent-tools.ts), not "no browser is running".

**A visit with no journal step behind it was opened by a desk** (#3450,
03.10). The desks (reddit, engage, blog-share, rounds, scenarios) drive the
page over raw CDP, not the journaled tools; the Reddit tick at 00:11:11 opened
the owner's visit at 00:11:12 and nothing said who. Since #3450 the witness
is the journal: `startBrowserAsAgent(who, by)` writes a `browser_start` step
whose `by` names the desk; a new desk that touches the browser must pass `by`.
For a visit from before #3450, match `browser_sessions.created_at` to the
desk's key in `agent_strategies`: `reddit:last-tick`, `rounds:last-run`,
`engage:last-search`. blog-share and scenarios keep no such key, so their old
visits can only be ruled in by elimination. A restart is journaled the same way (#3456):
`restartBrowserAsAgent(who, by)` writes `browser_restart` with `by` 'rounds'
or 'heal', and neither step counts as turn work (`isTurnWork` in report.ts).

## Человек видит работу агента у себя в чате (22.09.2026, #2809, #2813)

**Жалоба владельца:** ссылка «смотреть за агентом» открывалась во внешнем
браузере телефона, где нет нашего входа, и там было пусто.

- **Кнопки, ведущие в браузер, — только `web_app`, никогда не `url`.**
  `openBrowserButton()` в `render/src/browser/announce.ts`. Кнопка `web_app`
  открывает app.t27.ai/browser ВНУТРИ Telegram с подписанным initData, а рендер
  проверяет подпись по токенам всех ботов фермы. Работает только в личке
  (туда эти сообщения и уходят). Тесты требуют `url === undefined`.
- **Отчёт после хода:** `browser/report.ts` + `after-turn.ts`, вызов в конце
  `/api/agent/chat` (agent/routes.ts). Ход, который трогал браузер, получает
  «лабораторный журнал»: задача, ход опыта (шаги словами, повторы склеены,
  время `+м:сс` от первого шага, потому что часовой пояс человека серверу
  неизвестен), наблюдения зрения, вывод агента, приборы. Ход без браузера
  ничего не шлёт. Отчёт строится из журнала, поэтому набранный текст в нём
  только по длине.
- **Ролик:** `browser/film.ts`. Кадр всего экрана (neko shot) после каждого
  действия и каждого взгляда, в памяти не больше 40 кадров, живут 30 минут,
  отдаются один раз. Пробы не снимаются. Это кадр на шаг, а не непрерывная
  запись: честно так и подписано.
- **Ловушка ffmpeg:** из JPEG-кадров получается `yuvj420p`, даже с
  `format=yuv420p`. Чинит `-color_range tv`, а `-pix_fmt yuv420p` сам по себе
  не чинил. Проверять ffprobe-ом, а не глазами на аргументы.
- **Не покрыто:** агенты через `/mcp` (у них нет конца хода), поэтому отчёта
  им пока нет.

## Вход с телефона: человек печатает, агент просит (22.09.2026)

- **`/api/browser/type`** (`person-type.ts`) — дверь ТОЛЬКО человека. GET: где
  фокус (сайт, тип поля, подпись поля; значение никогда). POST `{text, enter}`:
  один `Input.insertText` в сфокусированное поле, по желанию Enter, берёт руль.
  Без фокуса — 409 и ничего не печатается. Текст не журналируется, не
  логируется, не отдаётся в ответе. `tri eyes` каждый виток проверяет, что
  ключ агента здесь и на `/cookies` получает 403 (зонд с пустым телом).
- **Панель «⌨ Ввести текст»** (`player/.../TypeSheet.tsx`): до отправки видно,
  куда уйдёт текст; поле пароля скрыто с «глазом»; Enter телефона отправляет
  (явный `onKeyDown`, неявная отправка формы в эмуляции не срабатывала).
- **`browser_ask_input`** (`input-request.ts`): просьба в памяти, одна на
  человека, 10 минут. Сессия отдаёт `inputRequest`, вкладка открывает панель со
  словами агента; кнопка Telegram ведёт на `/browser?type=1`. Ввод отвечает
  просьбе через `markTyped`, агент получает `{typed, chars, field}`.
- **Бюджет схем 7000:** инструмент влез только после сокращения описания до
  двух строк. Бюджет не поднимать ради одного инструмента.
- **Ловушка теста словарей:** регулярка `t\('…'\)` ловит и `params.get('type')`.
  Имена параметров выносить в константы.

## Карта «агент ждёт человека» — кнопка на каждый случай (22.09.2026, #2824, #2827)

| момент                              | инструмент                                  | карточка во вкладке              | дверь человека                 |
| ----------------------------------- | ------------------------------------------- | -------------------------------- | ------------------------------ |
| секрет (пароль/почта/код/текст)     | `browser_ask_input kind=password…`          | панель ввода со словами агента   | `POST /api/browser/type`       |
| разрешение на охраняемой странице   | `browser_ask_permission`                    | янтарная «Разрешить / Отклонить» | `GET/POST /api/browser/decide` |
| выбор из вариантов                  | `browser_ask_input kind=choice options=[…]` | зелёная, варианты кнопками       | `POST /api/browser/choose`     |
| сделать самому (капча, телефон, QR) | `browser_ask_input kind=action`             | «Готово / Не получается»         | `POST /api/browser/choose`     |

- Все двери человека: ключ агента → 403. `/decide` не отдаёт токенов в
  приложение: решает личность, только свой свежий вопрос, один раз.
- Печать не отвечает на выбор; выбор принимает только предложенный вариант.
- Под картинкой всегда ▲ ▼ Tab Esc (`/type` с `scroll`/`key`): свайп по
  потоку двигает мышь, а не прокручивает, кнопки ниже края были недостижимы.
- На телефоне картинка держит ≥45% экрана, карточки ниже прокручиваются.
- Бюджет схем 7000 снова впритык: при новом поле ужимать описания, не бюджет.

**Почему агент «встал» 22.09:** страница `gds.google.com` (настройки
аккаунта) охраняется; вопрос был только в Telegram, человек его не видел.
Теперь он и во вкладке.

## Если нажатия человека не доходят (22-23.09.2026)

- Смотреть отчёт касания из окна: `railway logs --service vibee-render | grep browser-touch`.
  `at: "video"` — слой ввода neko скрыт или перекрыт; `at: "textarea.overlay"` — здорово.
- Оболочка окна НЕ должна прятать `.overlay` по классу: `div.overlay` — заглушка звука,
  `textarea.overlay` — слой ввода. Тест: `render/src/browser/input-layer.test.ts`.
- Руль: касание человека берёт руль и рендер отдаёт управление его сессии neko
  (`browser/mouse.ts`, лог `[browser:mouse]`). `outcome: given` НЕ значит, что
  нажатия доходят, — это только про neko.
- Звук окна выключен по умолчанию (`MUTE_SCRIPT`), включается только `?sound=1`.

## Which networks the browser holds (24.09.2026, #2961-#2965)

`browser_logins` answers "where is the clone signed in" **without opening a
page**: `Storage.getCookies` on the BROWSER socket (the mirror of the cookie
import's `Storage.setCookies`; the pod's socat bridge passes every method),
then `marksOf` drops values in the first step and `loginsOf` keeps one state
per network. Code: `render/src/browser/logins.ts`.

- **One door for "whose pod":** `loginsOfPerson(pool, telegramId)`. The tool,
  `/api/clone/status` (`accounts`) and the rounds all go through it.
- **Four states, and the fourth matters:** `unknown` = we do not know that
  network's login cookie (hh.ru, Upwork, Habr, Medium). Never report it as
  signed out: that sends the person to sign in again to an account they hold.
- **A cookie is not a session.** X revokes sessions server-side and the
  cookie stays; the tool's note says so, a screenshot of the open site is
  the proof.
- **Rounds skip a network that is plainly signed_out/expired** and say
  "не подключена"; skipped sites never count toward "the browser is blank".
- **Trap, caught by the full suite:** a module imported by `agent-tools.ts`
  must reach `./cdp` at CALL time (`endpoint => browserWsUrl(endpoint)`),
  not at load -- `browser-guard.test.ts` mocks `./cdp` partly and a load-time
  reference fails six of its tests.
- From a terminal: `tri logins` (table) / `tri logins --json` (for a loop).

## blog-share never presses "Post" on a sign-in form (24.09.2026, tick 4)

`publishEverywhere` (`render/src/agent/blog-share-wiring.ts`) reads the
browser's logins first (`loginsOfPerson`) and skips a network that is
plainly signed out: "не подключена — вход не найден, ничего не нажато".
Threads joined X, LinkedIn and r/t27ai through its own web intent
(`threads.net/intent/post?text=`, fills the composer, never posts by
itself). Instagram is NOT there: it needs a photo/video uploaded through its
web composer (file input via CDP), a separate piece of work.

- **27.09.2026.** Под, на котором никто не записан, — корень трёх разных баг-репортов. На Railway под это заранее поднятый сервис, stop() у fixedDriver ничего не останавливает, жнец удаляет строку browser_sessions через 10 минут тишины — и браузер живёт с логинами, а в базе его никто не называет. Измерено 27.09.2026: 0 строк в таблице, 9 страниц и 192 куки в поде. Отсюда и 'ни одна сеть не подключена' (loginsOfPerson требует state=live), и слепой уборщик вкладок, и вера в HTTP 200 как в признак живости. Любой обход browser_sessions надо дополнять адресом BROWSER_POD_CDP (в коде — UNCLAIMED). Смотреть числом: tri tabs.

- **27.09.2026.** Проверено живьём 27.09.2026 после мерджа PR #3110: tri tabs отвечает '144022504 — 9 вкладок из 12, 9 сайтов, убирать нечего'. То есть (а) число потолка теперь видно одной командой, (б) под в этот момент был записан на владельца, а не UNCLAIMED — значит переусыновление нужно не всегда, а именно после того, как жнец убрал строку. Порядок диагностики: сначала tri tabs, потом tri logins; если tabs показывает UNCLAIMED, а logins пуст — это ровно та дырка, а не разлогин.

- **27.09.2026.** A pod cannot be stopped on this platform, so the reaper deleting the session row leaves a browser running with somebody's logins and nothing naming it. The tenant is now recorded in browser_pod_tenants at both moments the knowledge exists: when a session goes live (routes.ts open), and one statement before the row is dropped (reaper.ts). loginsOfPerson falls back to that record, so 'which of my networks are connected' is answered by the browser rather than by a row that is meant to die.

- **27.09.2026.** A restart is proven by Chromium's boot GUID, not by the pod answering afterwards. It is the path of webSocketDebuggerUrl in /json/version; boot.ts reads it before and after and logs restarted | same-browser | unknown. Same GUID plus a silent browser means the driver's restart never happened and only supervisorctl restart chromium inside the pod will cure it -- waiting longer cannot. A page socket is never an identity: pages come and go without a restart.

## Three blind spots found in one night (2026-10-02/03)

Each looked like "the site is broken" and was ours. Diagnose with the case
named, before touching code.

1. **Shadow DOM** (#3361). The click probe read `document` only; Reddit and
   LinkedIn draw buttons inside open shadow roots. Symptom: "nothing visible
   says X" with X on screen. Check: `tri browser find "X" <id>` -- it runs the
   probe from your checkout, so a probe fix is proven on the live page BEFORE
   deploy. Closed shadow roots and cross-origin iframes are still not walked.
2. **No clock on the pod's HTTP API** (#3361). `/json/list`, `/json/new`,
   activate and close had no timeout; a LinkedIn share open hung the agent
   > 170 s. Now `LIST_TIMEOUT_MS` (= CALL_TIMEOUT_MS) and
   > `NEW_PAGE_TIMEOUT_MS` = 60 s. A new tab measured 38-43 s on the starved
   > pod: `tri browser time` -- above 60 s the clock cuts it, and that is the
   > pod's problem to fix, not the clock's to raise.
3. **No GPU = no WebGL.** t27.ai rendered blank in the pod: React died on
   Babylon's "WebGL not supported" (fix in gHashTag/trinity). `browser_read`
   returns "" and `browser_screenshot` says "not painted" -- indistinguishable
   from "still loading" until `tri browser blank <id>` re-imports the page's
   module scripts with an error listener and names the crash.
   **Fixed 2026-10-03** (gHashTag/trinity#1255, merge e88f863): the landing
   probes WebGL first and skips the scene without it; a scene that still
   throws is caught by `SceneBoundary`. Measured live in the pod on a new
   tab: `blank: false`, 549 nodes, 20486 chars of text. CI guards it as
   `check:home-no-webgl`. Any other page that "is blank only in the pod" --
   suspect the GPU first.

Acting live: every case drives the person's real browser (`front` brings a tab
forward on his screen). When `tri browser status` says the person is watching,
read, don't drive. Never `type` a password; close only tabs you opened.

## Read against competitors (2026-10-03)

Sources and the full table: Browserbase, Steel, Anchor, Hyperbrowser,
BrowserOS, ChatGPT agent/Atlas, Comet, Opera Neon, Browser Use, Skyvern,
Cloudflare Browser Run; Buffer, Typefully, Postiz for posting. What they do
that we did not, and where each stands:

| Gap                                                                               | Who does it               | Status                                                                                               |
| --------------------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------- |
| No frames while the PERSON drives                                                 | ChatGPT agent             | **done** #3464: `tickMayFilm` stops the film ticker under the person's wheel lease                   |
| A live view that says "stream stopped" + why, not a frozen picture                | Browserbase, Skyvern      | **done** #3475: `FREEZE_SCRIPT` -- 10 s without a frame on a connected video says so, names the side |
| A login that is checked by USE, not by cookie name; a one-tap "sign in again"     | Anchor                    | **done** #3477: a gated page sent to the sign-in wall = `refused`; `signInAgain` names the door      |
| The person's own per-site list: blocked / read-only for the agent                 | Comet                     | **done** #3481 list, #3482 + #3484 the app's "My sites", #3483 blocked tabs named by host only       |
| One typed handoff (login/captcha/approval) answering resolved/cancelled/timed_out | BrowserOS, Cloudflare     | partly: `browser_ask_input`, `browser_ask_permission`                                                |
| A watch-only share link                                                           | Hyperbrowser, Browserbase | **#3510**: `/watch/<token>` pictures only, held on blocked/ask/sensitive/unknown, 2 seats, revocable |
| A desk that presses asks the same question as the tools                           | Comet, ChatGPT agent      | **done** #3503: `deskClick`/`deskType` -> `mustBeAllowedToAct`, address read NOW                     |
| A frame or a redirect judged where it is, not by the tab's address                | ChatGPT agent, Comet      | **done** #3507: `frameAtPoint` (Chromium hit-test), `landing` for open                               |
| Per-channel split, never X's 280 for LinkedIn                                     | Postiz trap               | held: `xThread` vs `postFor` (#3453, #3457)                                                          |

**The person's own site list (`site-rules.ts`).** `guard.ts` has one list
for everyone; the person knows places nobody else can name (their clinic,
the shop with the saved card). Two rules per person, in
`browser_site_rules`: `ask` makes acting there need a fresh yes exactly as
on a bank (`mayAct` gets `alsoSensitive`), `block` refuses open, read, page
screenshot and every act, even with a yes -- the refusal fires before any
CDP call, and the test asserts the browser saw nothing. Matching is host
suffix + path prefix, NEVER substring (`includes` would make "x.com" match
netflix.com). The agent's door (`browser_sites`, `tri browser sites`) only
tightens: a page that talked an agent into "unblock this" would turn the
person's brake into the agent's, so DELETE and block->ask are the person's
(`/api/browser/sites` without an agent key). An unreadable list is null,
never []: open, read, shot and act are ALL refused, a fresh yes included
(`browser_evaluate` reads as well as acts), and `browser_status {shape}`
reads no tab. Not in the compact kit (`COMPACT_HIDDEN`): it is the person's
setting, not a turn of conversation.

**Unknown fails closed, every time -- three holes the bees found.** (1) A
tab whose address cannot be read is treated as blocked while the list
blocks anything: the unknown place may be the blocked one. (2) A desktop
shot shows whatever tab is in front, so it is refused while ANY open tab is
blocked. (3) A blocked tab still leaked through the tools that LIST tabs:
`browser_status` and every page shot's `tabs` carried its title and full
path (a statement title, an account number in the path). `veilTab`
(#3483) names it by origin only, title empty, `veiled: 'blocked'` (or
`'list unreadable'`); `browser_ask_input` is refused on a blocked tab before
any CDP call. `browser_tidy` veils every answer and stores the real URL for
apply's comparison (#3487); `browser_focus_tab` answers with the veiled URL
too. **Rule: grep every tool that RETURNS a tab's url or title** -- each of
these leaks was a return nobody had listed.

**The desks answer to the list too (#3488).** Desks drive raw CDP and never
pass the agent tools' guards, so every desk road calls ONE check,
`deskMayGo(who, url)` in `browser/desk-page.ts`: a blocked site throws
`blockedError`, an unreadable list throws `UNREADABLE_LIST`, and an address
it cannot read (`''`, `chrome-error://`) is refused while anything is
blocked. The roads, each found by a bee after the first fix missed it:

- `newDeskPage` (blog-share, reddit, engage, scenarios' open): before any
  tab is made or closed for room. The test pod starts AT `TAB_CAP`, with a
  control that the same open unblocked does close one -- under the cap a
  check moved after room-making still passed.
- rounds (`rounds-wiring.ts`): its own window via `openWindow`/`goTo`.
  Blocked sites are dropped from the walk before it starts (left in, a
  round of only failed looks reads as a blank browser and restarts it); an
  unreadable list walks nothing; each look re-checks where the window
  LANDED, so a redirect onto a blocked site reads nothing.
- reddit `readAsThePerson`: borrows a tab already on Reddit; checked first.
- scenarios `where()`: acts on the tab in front; checked on every step.

`ask` is not checked by `deskMayGo`: that door does not know whether the
desk will act. It is checked at the PRESS since #3503: `deskClick` and
`deskType` ask `mustBeAllowedToAct` against where the tab is NOW, so a
redirect after a newDeskPage open is judged where it landed. A pin forbids
raw `clickAt`/`typeText` under `src/agent`. Named limit: one yes lasts five
minutes, so a long multi-network run on "ask" sites refuses the later
networks by name. When adding a desk road,
grep `src/agent` for `openWindow`, `goTo`, `frontPage` and `listTargets`,
not only `newDeskPage`.

**The person's door in the app (#3482, #3484).** Browser tab -> "My sites"
(`components/Browser/SiteRules.tsx`): add as ask or never, flip a row,
remove a row, rows the agent added say so. Only the server's 503 means "your
list could not be read, the agent is stopped"; a 401 or a network error is
this screen failing and says so in other words (`readSiteListState`). The
server's English 400/409/503 refusals become dictionary sentences
(`siteRuleFailKey`). No @testing-library in the player: the logic is pure
functions in `lib/remoteBrowser.ts`, the strings are checked as source text
in both languages.

**A picture that stopped says so (#3475).** `CONNECT_SCRIPT` spoke only when
neko showed its connect form. A socket that stays up with no new frame had no
words, and the last picture read as a browser ignoring the person.
`FREEZE_SCRIPT` (`skin.ts`) counts frames presented (`requestVideoFrameCallback`)
or decoded (`getVideoPlaybackQuality`), never `currentTime`, which runs on with
no frames. neko captures at a fixed rate (`ximagesrc use-damage=false`,
30/s), so `FROZEN_AFTER_MS` (10 s) without a frame is a stall, not a still
page. It shows a strip, not a cover: the words, whose side
(`navigator.onLine`), and the reconnect button. It posts `frozen` once, and
the app re-reads the session as for `stuck`. It is quiet on a hidden tab, a
paused or never-played video, neko's card, and the loader or watch mode. Not
yet seen live: the first real stall after the deploy is the measurement.

**A login is checked by use (#3477).** X revokes a session on its side and
leaves `auth_token` in place, so `browser_logins` said "signed in", the blog
desk landed on X's sign-in form, reported "button not found" and left the form
open, and `browser_sign_in` said "do nothing". Now a desk's GATED page (a
composer or a share form, never a public page) that lands on the network's own
sign-in wall (`WALLS` in `login-use.ts`) is written to
`browser_login_refusals`: network, the login cookie's expiry (`stampOf`),
host+path of the wall (never the query, which can carry a one-time token).
`loginsOfPerson` then says `refused` while the expiry is unchanged and the
refusal is under a week old. A new sign-in moves the expiry and voids it; a
gated page let through deletes it. Nobody clears it by hand. The desk closes a
walled page without a press and tells him to sign in himself;
`tri browser logins` prints `REF ... since` and the door to sign in again.
Opening the sign-in door on purpose is not a refusal (`wallOf` answers null
when the asked URL is itself a wall). A login held only in session cookies
stamps 0 before and after a new sign-in, so nothing could void its refusal and
the desks, which skip a refused network, would never look again: such a
refusal is written but never believed (`withUse`); the network stays
`signed_in` and only the walled page that one time is closed.

**Read journal times with their date.** `tri journal` printed `HH:MM:SS`
only: at 01:05 UTC a step from 22:47 the day before read as fresh. Both
readers now share `bin/helpers/journal_line.py` (#3463) -- date kept, UTC
said, and the first line is how long ago the newest real step was.

## A frame is judged where it is (2026-10-03, #3507)

A page is more than its address: the Pay button is a js.stripe.com iframe on
an unguarded shop, a blocked site can be embedded, a shortener lands
elsewhere. `src/browser/embedded.ts` holds the rules; the header names the
limits. Facts measured live by the bee, not guessed:

- **Ask Chromium, never the page, which frame a press hits.**
  `DOM.getNodeForLocation` + `DOM.describeNode` (cdp.ts `frameAtPoint`)
  pierces CLOSED shadow roots and cannot be lied to by an overridden
  `getBoundingClientRect`; the frameId it names IS the iframe target id in
  `/json/list`. It takes DOCUMENT coordinates: add the scroll offset.
  Leave `ignorePointerEventsNone` out -- a real press honours
  `pointer-events: none`.
- `Page.getFrameTree` gives NO url for a cross-site frame; Chromium's
  target list does.
- Typing has no hit-test: a risky frame is asked `document.hasFocus()` in
  its OWN world, which the embedding page does not control.
- A server 302 usually never commits, so `landing`'s `seen` holds JS and
  meta hops only; four equal looks before settling on the address asked.
- Open follow-ups: a unit test for `frameAtPoint` (mutants survived: an
  error read as "top page" would let a press through), a test that a
  blocked frame is not asked `hasFocus`, and asking unseen sensitive
  frames for focus before refusing to type (YouTube embeds trip it).

## The watch-only link (#3510)

`/watch/<token>`: a picture of the person's browser and nothing else -- no
input channel, the socket closes 1008 on any message. The address is read on
the cast's OWN socket (`Page.getFrameTree` after `Page.enable`) before the
first frame; the target list's url is never trusted, it can be a navigation
behind. Held (no frames) on blocked, ask, sensitive or unknown places; at
most two seats per link, a seat is registered for release BEFORE the token
read (`watchViewerOf` fires `onClose` at once on a socket already gone), so
a watcher who leaves early never strands a seat. One cast lives
`FRAMES_MAX_MS`; the page reconnects after 2 s.

## A desk opens a tab through one door (2026-10-03, #3469, #3471)

Asking why the blog did not reach the networks found two holes. Neither was a
site change.

1. **The desks went around the ceiling.** blog-share, reddit, engage and
   scenarios opened tabs with raw `newPage`, past `roomForOne`. `roomForOne`
   is the check added after a fifteenth tab wedged Chromium. The pod stood at
   10 of 12, and one share run opens up to four more.
2. **The sweep could close a desk's working tab.** `planTabSweep` closes every
   later tab of an origin. The X composer beside the person's `x.com/home` is
   that later tab, so it could close between "type" and "post".

The door is `newDeskPage` (`render/src/browser/desk-page.ts`):

- It makes room first, then holds the new tab for `DESK_HOLD_MS` (15 min).
- The clock (`podsToSweep`) and `browser_open`'s `makeRoom` both keep held
  tabs.
- A source guard fails on any raw `newPage(` in `src/agent`.
- **A new desk opens tabs only through it.**

**Every closing is named** (#3471), by host and reason only. A path can carry
a one-time token, as Instagram's two-step URL does:

```
🧹 [tabs] (unclaimed pod): closed 1, 11 open of 12 allowed -- x.com (duplicate)
🧹 [tabs] room for x.com: chrome://newtab (over cap)
```

When a desk run fails midway ("thread did not go through", "button not
found"), run `tri browser swept [SINCE]` before blaming the site. It shows
those lines beside the desk lines of the same hours, from the logs only. Lines
before #3471 carry a count, not names.

**Two `tri`s.** The root `./tri` and `bin/tri` are different scripts, and
browser cases live in `bin/tri`. Until #3471, `./tri browser doctor` dropped
the word, printed the plain health line and exited 0, which is a green doctor
that read nothing. If a case's output lacks its documented shape (no tab
list), suspect the routing first.

**A desk start tells the person once per 12 h** (#3467). The reddit desk
ticks hourly; after the reaper drops an idle visit (10 min), every tick was a
fresh start and sent "the agent opened your browser" all night. Now
`startBrowserAsAgent(who, by)` announces once per `DESK_QUIET_MS`, read back
from the journal (`announced: true`), so a deploy does not reset it. Tool
starts and restarts still announce. Any new desk passes `by`; before a
notification on an hourly path, multiply by 24.
