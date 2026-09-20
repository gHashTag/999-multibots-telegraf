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
