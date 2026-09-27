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
