---
name: 'Cloud agent does the work'
description: 'Правило владельца: рилсы, липсинк, гламур фото, посты и любую работу с контентом делает ОБЛАЧНЫЙ агент сервиса (агент-блогер из каталога /agents, агент в боте и в приложении) своими инструментами — не локальные скрипты и не разовые функции Railway из сессии Claude Code. Загружать ПЕРЕД тем, как собрать что-то «руками»: скрипт, ffmpeg, curl к KIE/fal, функцию или сервис в Railway; при словах «сделай рилс», «собери шаблон», «SplitTalkingHead», «remotion render», «вручную», «липсинк», «сгламуй», «пришли готовое», «агент не умеет».'
---

# Работу делает облачный агент

**Решение владельца, 2026-09-24:** «это всё агент-блогер в облаке должен
делать, а не через локальные скрипты — мы сервис создали для этого, используй
его на всё, 100%».

## Owner rule 2026-10-03: reels ONLY through the server pipeline

> «почему ты вручную создаёшь шаблон, а не через t27? у нас пайплайн создания
> рилсов… через Remotion… сервер настроен на работу с Kie — через него
> запросы делай и заодно проверяй, работает ли всё как надо… в скилы сохрани,
> чтобы работать только так» (owner, 2026-10-03)

**What went wrong.** Reel v9 was built on the Mac: Kie `createTask` called
directly with the service key, whisper and `split-reel-plan` caption maths run
in a local `tsx`, `npx remotion render SplitTalkingHead` run locally. The
result looked right, but nothing went through the service: no ledger, no
server logs, and no proof that the server path itself works. That is exactly
what this skill forbids.

**The only way to make a reel** (owner's, a client's, a test):

1. **Door:** `/mcp` of `vibee-render` as the owner, `X-Agent-Key` from
   `AGENT_KEYS` (skill `mcp-owner-access`; the key never leaves a variable).
   Long tools outlive the public edge (it drops an idle call after 50-60 s)
   and Node `fetch` (300 s header timeout), so run the call **inside the
   render pod** against `127.0.0.1:$PORT/mcp` with `node:http`,
   `req.setTimeout(0)`, under `nohup`, writing the answer to a file. Then
   poll the file and the logs. A redeploy kills the call: repeat it with the
   `stills`/`clips` the answer returned; finished work is not paid twice.
2. **Story reel:** `story_reel`, one call. Inside it: `image_edit` on Kie,
   `audio_generate` (the owner's line goes to our `voice_clone_speak` with
   `OWNER_VOICE_REF_URL`), `lipsync_generate` with Kie Kling, then
   `reel_render StoryReel` (Remotion on the server).
3. **Split reel:** spec `render/src/spec/split-reel.t27`, then host plan
   `split-reel-plan.ts`, then composition `SplitTalkingHead` via
   `reel_render`. The pieces come from the same tools (`audio_generate`,
   `lipsync_generate`, `image_edit`), chained by ONE call: `split_reel
{image_url, text, brolls, for_lead?, cta?}` (`split-reel-tool.ts`). It
   gates the voice at `SPEECH_MAX_SECONDS`, draws only the b-roll the voice
   needs, hears the clip's own soundtrack with our whisper (word times) for
   the captions, and returns `voice_url`/`clip`/`broll_urls` on every
   failure so a retry pays nothing twice. Still not on the server: the
   `tri reel-check` comparison before sending, and a measured face aim.
4. **Every run is also a check.** Read the render logs step by step:
   - `[токены]` lines;
   - Kie `createTask`;
   - `Uploaded to S3`;
   - `Rendering <Composition> with props`.

   Every refusal or detour is a finding, and it goes into the report: a
   provider other than Kie, a fallback chain, a wrong key.

**Never, for a deliverable:**

- Kie or any provider called from the Mac;
- local `npx remotion render`;
- local whisper or caption maths;
- an ffmpeg mux of the final file.

Local tools may only **inspect** what the server made: frames,
`tri reel-check`, ffprobe.

## Правило

1. **Результат для владельца или клиента производит сервис.** Облачный агент
   (рендер `vibee-render`: агент в боте, в приложении, агенты каталога
   `/agents`, включая блогера) делает работу своими инструментами из реестра
   `TOOLS` (`apps/vibee-editor/render/src/agent/tools.ts` и соседние).
2. **Не собирать результат в обход сервиса.** Никаких ffmpeg/curl-цепочек в
   контейнере сессии, прямых вызовов KIE/fal с ключами сервиса, разовых
   функций или сервисов в Railway «чтобы быстрее». Такая работа не
   оставляет следа в журнале агента, не проходит через его цены и
   списания, и завтра её снова придётся делать руками.
3. **Если агент чего-то не умеет, чинится агент.** Недостающая способность —
   это новый инструмент в реестре агента (PR с ценой, списанием, возвратом и
   тестами), после чего работу делает агент. Отказ «агент не умеет» без
   такого PR — недоделанная работа.
4. **Честный отчёт вместо выдумки.** Пока инструмента нет, агент говорит
   «не умею, вот что нужно», а не описывает несделанное (разбор 24.09 —
   `owner-noir-reel`).

## Как обращаться к облачному агенту из сессии Claude Code

- Дверь — `/mcp` рендера с `X-Agent-Key` (навык `mcp-owner-access`):
  `tools/list`, `tools/call`. Личность берётся из ключа.
- **Из облачного контейнера Claude Code рендер закрыт** сетевой политикой
  (замер 24.09: `vibee-render-production.up.railway.app`, KIE, хранилище —
  `403 connect_rejected`). Чтобы работать через агента напрямую, окружению
  сессии нужны: доступ к хосту рендера в списке сети и ключ агента как
  секрет окружения (не в чат). Без этого — только правка кода агента через
  PR.

## Что измерено 24.09.2026 (факты, не догадки)

- **Липсинк в сервисе был, у агента — нет** (утро 24.09). Маршрут
  `POST /api/generate/lipsync` обслуживал только мини-приложение. В тот же
  день недостающая способность стала инструментом агента —
  `lipsync_generate` (ниже).
- **`veed/fabric-1` на KIE теперь требует `resolution`.** Запрос из двух
  полей (`image_url`, `audio_url`) отвечает `code 500 «resolution is
required»` без списания. Ровно так шлёт `src/talking-portrait.ts`, значит
  говорящий портрет автопилота с этой модели не работает.
- **Гламур фото** (`google/nano-banana-edit`) — 4 кредита KIE за кадр
  (три кадра: 4663,15 → 4651,15). Значок-треугольник модель НЕ
  переворачивает по просьбе: какой значок на исходнике, такой и остаётся —
  брать эталон, где значок ▽ (вершиной вниз, `docs/brand/club-reel-noir.md`).

## Пробы — на 2–3 секундах, не на полной длине (владелец, 24.09.2026)

«Это дорого — 21 секунду на тесты!» Первый прогон липсинка ушёл на
полную дорожку 21,4 с пять раз подряд (infinitalk ×2, пробы, kling,
omnihuman), хотя вопрос каждый раз был «работает ли модель вообще».

- **Вопрос «работает ли?» задаётся самым коротким куском**: 2–3 с голоса,
  одна часть. Полная длина — только после удачной короткой пробы и на той
  модели, что прошла.
- **Возврат токенов человеку ≠ бесплатно для нас.** Части идут
  параллельно: если одна упала, соседние могли досчитаться у провайдера и
  быть оплачены с баланса KIE, хотя инструмент честно вернул токены.
- **Перед дорогой моделью — цена вслух**: omnihuman ~$0.135/с у KIE, 21 с ≈
  $3. Сначала проба, потом смета, потом полная длина.

## Первый живой прогон липсинка агентом, 24.09.2026

Инструмент `lipsync_generate` (PR #2954, #2971, #2977) сделал нуар-рилс
владельца: гламур фото 1 + голос из `IMG_3522`, 21,4 с, три части, модель
`kie/omnihuman-1-5`; видео пришло владельцу в Telegram. Что узнали по дороге:

- **`kie/infinitalk/from-audio` (умолчание маршрута) отвечает «internal
  error, please try again later»** через ~5 с на любую картинку (проверены
  JPEG-исходник и PNG-гламур) — это не наши файлы. fal (запасной) —
  `Exhausted balance`. Когда умолчание лежит, назвать модель: `model`.
- **`kie/kling/ai-avatar-standard`** — `HTTP 502` на первой же части; через
  час проба 3 с прошла, и владелец выбрал именно Kling («лучше»).
- **`kie/omnihuman-1-5` — сработал.** Дороже: ~$0.135 за секунду у KIE.
- **Полка пускает две загрузки одновременно** (`UploadConcurrencyGate(2)`),
  третья получает 429. Части голоса грузятся по одной.
- **Дверь к облачному агенту из сессии Claude Code** — `/mcp` рендера с
  `X-Agent-Key` владельца (ключ берётся ссылкой на `AGENT_KEYS`, в чат и лог
  не попадает): `tools/call lipsync_generate`. Работу делает инструмент
  агента, списание — с кошелька владельца; дверь только передаёт вызов и
  отправляет готовое в Telegram. Внутренний адрес рендера
  (`<RAILWAY_PRIVATE_DOMAIN>:8080`) не рвёт длинный вызов на границе.

## Инструмент вместо «агент не умеет»: пример — code_run (26.09.2026)

Правило 3 в деле. Учёный-программист (агент `coder`) раньше мог только
ОПИСАТЬ код. Теперь у него `code_run` (`render/src/agent/code-run.ts`): он
пишет программу и ЗАПУСКАЕТ её, ответ цитирует настоящий вывод. Так же
устроены `hdl_run` (Verilog) и генерации.

Как делается безопасный запуск чужого кода (тот же приём, что у `hdl_run`):

- **Все разрешения сняты, а не выданы.** Deno `run --no-prompt --no-remote
--no-npm` без единого `--allow-*`: запрос к сети/диску/окружению/подпроцессу
  — ОШИБКА, а не запрос. Проверено на живом Deno: все отказы держатся.
- **Пустое окружение + `nobody`.** `env: {PATH, HOME}`, а когда сервер под
  root — `uid/gid 65534`: даже если проверка что-то пропустит, процесс не
  прочтёт `/proc/<pid>/environ` сервера (секреты).
- **Дедлайн, потолок вывода, часовой бюджет на человека.**
- **Проверять то, что исполнится, а не что написано.** Для `hdl_run` дыру
  нашли так: макрос склеивает имя `$fopen` ПОСЛЕ текстовой проверки. Лечится
  прогоном через тот же препроцессор (`iverilog -E`) и проверкой ЕГО вывода.

Чего инструмент пока не умеет — говорит честно: `code_run` не запускает
Python и отвечает «не запускалось», а не выдумывает вывод. Из сессии тот же
прогон — `tri code [--lang ts|js] ФАЙЛ` (нужен Deno на PATH; в образе есть).

## The agent says only what it did (2026-10-06)

Two guards in `apps/vibee-editor/render/src/agent/` stand between the
model's words and the person, plus one deploy setting:

- `claimed-but-not-done.ts` (issue #3658, PR #3667; scope PR #3680): an
  answer that claims a picture, a video, a sent file or a browser action with
  no matching tool call in the same turn gets an honesty note. Quoted text is
  not a claim; a back-reference header ("Above I:", "**Earlier I:**", an
  emoji or `###` header, with or without a colon or a blank line) covers only
  the FIRST sentence of each item of the list directly under it -- a plain
  line after the list or a second sentence in an item is judged on its own.
  Voice claims: #3684, merged in PR #3693 (5041a5673); rare openers left: #3723.
- `printed-facts.ts` (#3661, PR #3679): a date, time or price going into a
  picture prompt must be one the person wrote, or one the agent showed and
  the person answered a PLAIN yes to. A yes is a closed list of yes words --
  any other word (a new day, "later") asks once more. Otherwise
  `image_generate` / `image_edit` refuse BEFORE the charge and name the facts.
  Leftovers: #3686. A bare number after a price word ("price 20") is a
  currency-less price and matches the same amount in any currency (#3692).
- The deploy setting, not a file: a provider head with no tool support
  narrates work it cannot do (memory `agent-provider-ollama-has-no-tools`).

While a tool runs, every chat surface (DM, business DM, managed bots, the
hive) shows the tool's own chat action -- upload_photo / upload_video /
upload_voice -- from the explicit map `TOOL_ACTIONS`, read by `actionForTool`
in `src/helpers/telegramLongAnswer.ts` (#3682, #3688). A new tool whose name
sounds like media (image, video, voice, audio, reel...) without an entry turns
`toolActionEverywhere.test.ts` red: add the entry. A media tool with a neutral
name is NOT caught -- add its entry by hand when you add the tool.

Lesson from five review rounds (2026-10-06): an OPEN list of "change words"
never ends -- the reviewer always finds one more correction that reads as yes.
A CLOSED list of what counts as yes, with "ask again" as the default, ended
it in one round. Same for headers: decide what IS a header, not what is not.

But a closed list is not always the safe one. Close the list on the side
where a MISS is safe. "What counts as yes": a miss asks once more -- safe.
"What may stand before the agent's verb": a miss hides a real claim -- unsafe.
That closed list dropped ordinary adverbs ("Ну сделала афишу", "Теперь…",
"Короче…") and let the claim through (#3693, review round 2). Two more from
the same round:

- A question excuses a claim only inside the claim's OWN clause. "Сделала
  афишу — как тебе?" is still a claim; the "?" belongs to the next clause.
- Check EVERY match of a claim pattern, not only the first: a harmless first
  match must not shadow a real claim later in the answer.

"Whose verb is it?" took SIX review rounds (#3693). Each round fixed a list
and the reviewer found the next position: openers, then pronouns and
prepositions, then a preposition three words back. A fixed window ("the two
words before the name") is a closed list in disguise -- the boundary is
always in the wrong place. What ended it was a rule tied to the grammar: a
capitalised word is someone else's subject only at the start of its clause
with no preposition anywhere earlier in that clause. Before patching a
list, ask what STRUCTURE the misses share.

A grid before review, not examples. On one morning (2026-10-06) three
"structural" fixes each came back from review with an unsafe hole, and each
hole was a COMBINATION that no hand-written example covered:

- #3728: "capital after a name = surname" made "Анна 🙌 Готово сделала" quiet
  (a greeting by name, an emoji, then the agent's own sentence).
- #3730: "spaced к + a word = preposition" made "₽10 к рублей" read as 10, so
  "₽10" confirmed a printed 10 000 ₽. The fix was to close the list on the
  safe side: к is a preposition only before a known time word (утру,
  вечеру...) or a digit.

Before asking for review, write a grid test that crosses every slot (for
example greeting x addressee x separator x opener x verb, or currency position
x spacing x following word). Compute the expected value from a one-line rule,
and run it against main as well. The reviewer should be checking the rule, not
finding your next missing example.

Digit groups must join only across a space, NBSP (U+00A0) or narrow NBSP
(U+202F) -- never across a newline, or "30\n500" on two lines becomes 30500.
Both readers share `DIGIT_JOINERS`: `look-at-own-picture.ts` since #3705,
`printed-facts.ts` since #3716 (79c96bd84).

Measure, do not guess: `tri honesty` prints the deploy-time provider head
(tools or not) and the `[agent:honesty]` flags by kind, counts only; rc 1 on
any flag or a toolless head (#3670).

Can the agent read its own picture? `tri vision-bench` runs the render's own
vision (llama.cpp, Qwen3-VL-2B, ONE slot) inside vibee-render and prints a row
per read: ms, hits, and whether the slot was busy just before. Measured
2026-10-06, vision idle:

- synthetic posters (four lines, fonts 26-72 px at 1536): 4/4 facts at every
  size; a 448 px height reads in ~1.2 s, 768 px in ~2.4 s. 448 is enough.
- the SAME JPEG bytes a second time read in ~0.45 s at any size: llama.cpp
  reused its cached image prompt. The bench draws a fresh background every run
  so the number is a cold read; a bench that repeats a picture measures the
  cache, not the model.
- a real `agent-image` "poster" of 2026-10-05 (prompt: title, "8 October ·
  11:30", venue) read as `© pollinations.ai` and nothing else -- and it is
  right: the picture is a stock portrait with no text at all. That is the
  case the self-check (#3660) exists for; a reading of 0/N is a finding about
  the picture before it is a finding about vision.

`--image URL --expect "11:30,500"` scores any real picture; rc 1 on a miss.

Pollinations draws no lettering. The newest prod poster scored 0/4 on the
bench (#3701). The self-check of #3660 (merged 1cfe53604, false-missing fix
5458846f9) makes the agent SAY the facts are missing -- it does not put them
on the picture. Exact dates, times and prices need the facts overlay drawn
by code, spec first (#3701); never promise them from the image model.

## Related Resources

- `mcp-owner-access` — ключ агента и `/mcp`
- `owner-noir-reel` — стиль нуар-рилса владельца
- `t27-blogger-agent` — контракт агента-блогера
