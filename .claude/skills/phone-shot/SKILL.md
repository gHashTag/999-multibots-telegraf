---
name: 'phone-shot'
description: 'Measure a screen of the app on a PHONE, not in jsdom: `tri shot <harness>` opens the real component in Chromium at 390 px with a coarse pointer, answers its tool calls with the host''s own functions, saves PNGs and measures finger targets (the page''s own --touch-target), sideways scroll, clipped text and overlapping controls. Use before saying a panel "works on the phone", when adding a harness for a new screen, and when a layout fix needs a number.'
---

# Экран на телефоне — `tri shot`

## When to Use This Skill

- Правка раскладки, кнопок, панели — перед словами «на телефоне работает».
- Панель проверена только тестами DOM (jsdom раскладки не знает: кнопка
  32 px «есть» и проходит любой тест).
- Нужен снимок экрана владельцу или в PR.
- Добавляется новый экран, и его надо уметь снимать.

## Quick Diagnosis

```bash
./bin/tri shot story-palette              # 390 px, русский
./bin/tri shot story-palette --lang en    # короткие английские слова — узкие цели
./bin/tri shot story-palette --width 320  # самый узкий телефон
./bin/tri shot my-story                   # её собственная страница «Мои рилсы»
./bin/tri shot crm-client                 # вся карточка клиента /crm/:id
./bin/tri shot crm                        # the /crm list itself: work, contacts, search
./bin/tri shot all                        # все стенды × 390 ru, 390 en, 320 ru — для ворот
TRI_SHOT_JOBS=1 ./bin/tri shot all        # по одному (по умолчанию 3 сразу, один Vite на всех)
```

`all` поднимает ОДИН dev-сервер и раздаёт его прогонам (`TRI_SHOT_BASE`):
отдельный Vite на каждый из 12 прогонов был основной ценой — 250 с против
120 с при нагрузке ~60–90 (2026-10-02), вердикты побайтно те же.

Стенды: `story-palette` — панель рилс-истории в карточке клиента (продавец),
`my-story` — её страница `/story` (жмёт сама клиентка), `crm-client` — вся
карточка `/crm/:id` (шесть панелей, рилс, дуэт с подтверждением).
`crm` is the `/crm` list (fixtures in `src/harness/crmFixtures.ts`). The
harness passes its own query string to the list, so
`/harness/crm.html?tab=contacts&who=leads&q=an` opens that state; a row
opens the REAL card (`/crm/:clientId`), so list -> card -> Back measures
scroll and kept search as the phone sees them. A stand-in card hid the
scroll defect for a whole tick.

Строка на состояние: `ok|RED <state>: N controls, target 44px, wider 0px,
small 0, cut 0, overlap 0, order 0 · <png>`. Код 0 — чисто, 1 — красно, 2 — НЕ
ИЗМЕРЕНО (это не «зелено»). Снимки — `.git/tri-shot/<name>-<state>-<width>-<lang>.png`.
Вердикт уходит в `tri gate` — отдельной записью на ширину И язык
(`shot my-story 390 ru`): до витка 13 английский прогон затирал русский.

## Что меряется

- **small** — кнопка, поле или ссылка меньше цели по любой стороне. Цель
  читается СО СТРАНИЦЫ (`--touch-target` в index.css, 44 px), а не зашита в
  инструмент.
- **wider** — страница едет вбок.
- **cut** — text clipped by its own box. Every ellipsis and every sideways
  scroller counts. A visually hidden (sr-only) word does NOT: it is hidden on
  purpose (`clip-path: inset(50%)`, `clip: rect(0…)`, or a 1px absolute box).
  Teach the checker only a false positive like that one; a real cut is fixed
  in the page.
- **overlap** — две цели наложились.
- **order** — пары `before` стенда: первое стоит ВЫШЕ второго на экране.
  Цена над кнопкой (спека v16): «до нажатия» — это место, а не слово.
  Пара, где первого нет, — тоже нарушение: «цена над кнопкой» неверно о
  цене, которой нет.

## Solution Steps: снять новый экран

1. `apps/vibee-editor/player/harness/<name>.html` — копия `story-palette.html`
   (та же метка viewport, что в index.html). Vite отдаёт её только в dev,
   сборка берёт только index.html.
2. `apps/vibee-editor/player/src/harness/<name>.tsx` — тот же компонент, что
   на странице, внутри той же обёртки (`.crm .crm-client`…) и под теми же
   листами стилей в порядке main.tsx.
3. Ответы инструментов — функциями ХОСТА (`bin/helpers/shot-story-answer.ts`
   — образец: вся логика ответа импортируется из рендера, повторён только
   порядок слияния). Рукописный JSON согласен с экраном, под который его
   написали, и больше ни с чем.
4. Запись в `HARNESSES` (`bin/helpers/shot.mjs`): `tool` (какой инструмент
   отвечает), фикстура, `root`, `scope`, `within` (`section` — вся панель
   вокруг корня, `root` — сам корень), `before` (что читается раньше) и
   состояния — нажатия, которые ведут от одного к другому. Цены в ответах —
   функциями хоста (`storyPriceEstimate`, `storyPriceEstimateNotes`):
   рукописное 270 при `voice_mode: notes` врало о цене (хост — 218).
   Инструменты, которые хост без базы не ответит (профиль, план, история,
   медиа), отвечают `fixtures` стенда по имени — формами из теста самой
   страницы (`CrmClient.test.tsx` держит их против разборщиков), но
   НАСТОЯЩЕЙ длины: раскладка ломается на длинном имени, а не на «Leela».
   Люди в фикстурах — выдуманные.
5. Прогон ДО правки (число «до»), правка, прогон ПОСЛЕ, и обратная
   проверка: старые стили → обязан покраснеть.
6. Сторож в vitest того, что установил замер (образец —
   `src/pages/storyPanelFingerTargets.test.ts`): блок coarse-pointer есть,
   стоит ПОСЛЕ базовых правил, даёт цель каждому элементу. Мутации — в список.

## Common Issues (каждая стоила времени)

- **`fullPage: true` выключает палец.** После одного снимка всей страницы
  этот Chromium отвечает `(pointer: coarse)` = false до конца жизни
  страницы — все следующие состояния мерились как рабочий стол, и правка
  «работала» в одном состоянии из трёх. Лечение: viewport высотой со
  страницу и обычный снимок; состояние без coarse — «не измерено».
- **Правила для пальца — в `@media (pointer: coarse)`** и ПОСЛЕ базовых:
  та же специфичность, побеждает поздний. На рабочем столе viewport без
  `isMobile/hasTouch` этих правил не видит вовсе.
- **Chromium в контейнере** — `/opt/pw-browsers/chromium` (ревизия старше,
  чем ждёт playwright 1.58); `playwright install` не запускать.
- **Флажок меряется подписью.** Нажимают подпись «сухой прогон», а не
  квадрат 13 px: для checkbox/radio внутри `<label>` целью считается label
  (виток 14 — иначе ложная тревога на каждом флажке).
- **Английский уже русского**: «watch» 42 px в ширину при 44 в высоту —
  короткому слову нужна `min-width`.
- **WebKit (iOS Telegram) здесь не снять** — в контейнере только Chromium.
  Что WebKit игнорирует (`min-height: fit-content` у flex-кнопки) — см.
  `modelCardsFitTheirText.test.ts`.

- **jsdom lies about focus -- and the iOS keyboard depends on it.** Turn 1 of
  the CRM-on-a-phone loop (30.09.2026): a "Find a contact" button switched
  the section and focused the box in an effect. The `activeElement === input`
  test was green; the live browser showed `BODY` right after the tap and the
  input only later. iOS raises the keyboard only for a `focus()` made inside
  the gesture itself, so on a phone there was no keyboard. Fix: the entry is
  a real `<input>` and focus is handed input to input in one commit
  (`onFocus` switches the section, the second box has `autoFocus`, the text
  is shared). Check it live: read `document.activeElement` IMMEDIATELY
  after `click()`, in the same script.
- **Buttons next to a field drop the keyboard.** Clear and filter chips take
  focus on tap. `onPointerDown={e => e.preventDefault()}` keeps it in the
  field; test it with `dispatchEvent(new PointerEvent('pointerdown',
{cancelable: true}))` and `defaultPrevented`.
- **No chrome-headless-shell for `tri shot`?** Downloading it needs the
  owner's yes. Use the preview browser instead: `resize_window` 390x844,
  `/harness/crm.html`, `getBoundingClientRect` via `javascript_tool`; reset
  to `desktop` at the end of the turn.
- **Gates in a worktree** -- `tri worktree <branch>` links the root and
  render node_modules; without them npx pulls a foreign ESLint/tsc and
  pre-commit goes red for nothing.
- **`npx tsc -p .` in the player checks nothing.** Its tsconfig.json is a
  solution file with references; the gate runs `tsconfig.app.json`. CRM
  loop tick 2 saw "clean", then lost a commit to player-types
  (`Avatar name` got `string | null`). Run `./bin/tri precommit
player-types` (~10 s) before committing.
- **An exit code alone is not a verdict -- read the log.** The first
  `tri precommit` probe exited 1 on a planted type error and looked
  proven; the log said lefthook rejected the flag (`--commands`, the flag
  is `--command`). The clean run exited 1 too. A red probe proves the gate
  only if the log names the planted error.
- **A harness that only `tri shot` can feed is blind in the preview.**
  crm-client.html got its answers from Playwright's route interception;
  in the preview browser the card said "session refused". Harness pages
  answer their own tools in-page from a JSON fixture that shot.mjs reads
  too (`answerCrmToolsInPage(fixtures, { passThrough: true })`), so one
  source serves both and the host-answered tool still reaches `tri shot`.
- **Bottom actions: sticky, last in the DOM, not fixed.** A primary action
  placed after every panel with `position: sticky; bottom: calc(max(
var(--app-tabbar-total, 0px), var(--app-safe-bottom, 0px)) + 12px)` stays
  under the thumb on a long page and settles in place at the end; no
  duplicate button, no scroll listener (CrmClient, tick 3).
- **Recent/remembered rows draw only ids the server just listed.** A
  localStorage id is shown only if it is in the current list (privacy on
  a shared device, and no dead links). Consequence: the list is paged, so
  someone past the first page is not offered back.

- **Sibling routes forget.** `/crm` and `/crm/:id` are siblings: opening
  a card unmounts the list, and Back mounts it fresh. Any state the person
  built on the list (search, chip) must live in the address --
  `useUrlMirror` (ordinary state, written with `replace`; a controlled input
  fed through a router transition drops letters). And a "Back" link to a
  fixed path is not Back: step `navigate(-1)` unless
  `location.key === 'default'` (opened from a link). Tick 4.
- **A hidden preview pane throttles timers.** A `javascript_tool` script
  that awaits `setTimeout` sleeps timed out after 45 s while the pane was
  hidden. Do one action per call and read the result in the next call.

- **Route changes do not touch scroll -- measure the round trip.** Tick 5
  (01.10.2026): a card opened from a list scrolled 497 px opened 497 px
  down, crumb at -485; Back put the list at the top, the tapped row 1231 px
  away. `useScrollMemory(ready)` on the list + `useScrollTopOnPush(id)` on
  the detail (`src/lib/useScrollMemory.ts`). Three traps:
  - the scroller is `#root` inside Telegram (`html[data-tg='1']`), the
    window elsewhere -- check both (`data-tg=1` and `--app-vh-stable:844px`
    on `<html>` in the preview turns the harness into the Telegram shape);
  - save the offset in a `useLayoutEffect` CLEANUP, not a scroll listener:
    the cleanup runs before React removes the DOM; the listener lost the
    offset whenever the tap beat the scroll event (always, in a hidden pane);
  - restore only after the re-read list is drawn (`ready`), and retry per
    frame while it is still shorter than the old offset.
    jsdom has no layout: fake the clamp with `Object.defineProperty(
document.documentElement, 'scrollTop', {get, set})`.

- **A crumb that is a real Back needs every link INTO its screen to
  cooperate.** Tick 6 found a loop that tick 4 caused. The card's crumb
  became `navigate(-1)`, but the chat's "to the client" still PUSHED the
  card. So chat -> card -> Back -> chat -> card went on forever. Fix
  (`src/lib/backTo.ts`): the opener passes `state={cameFrom(path)}`, and the
  child's back link calls `useBackTo(path)`. That steps back when it came
  from `path` and otherwise REPLACES itself with `path`. A replace gets a
  fresh key, so `key === 'default'` alone forgets that this was the first
  entry. Carry `state.firstEntry` and test through `isFirstEntry()`.
  **Check:** for every `navigate(-1)` crumb, grep every `<Link to=` that
  reaches that route.
  Tick 7 found that tick 6 had applied that check to one link and not to
  the other: the card beside the chat had a second "open the card" link,
  and the loop lived on through it. Grep the ROUTE, not the component
  you just edited: `grep -rn '/crm/\${' src`.
- **"In parallel" is not "progressive".** `const [a, b] = await
Promise.all([...])` followed by `setA(a); setB(b)` reads in parallel but
  DRAWS after the slowest read. The name in the chat title waited about
  1 s for a media list, under a comment that claimed the opposite. On a
  phone that is a second of an id instead of a name on every visit. **Fix:**
  `load().then(land(setX))` per read, with a guard, so that a late answer
  for the client just left does not land (`alive` in an effect, or a
  reload counter). **Test:** one tool never answers
  (`new Promise(() => {})`), and the other panels are still drawn. Better
  still, hand what the opener already knows (the name) over in link state.
- **A word on every row is a column header in disguise.** The CRM list
  repeated "AUTO" on each row's tick: 73px of a 352px row, and the name
  was cut at 179px. On a phone, keep the control alone (a 44px target
  still) and name the column ONCE in the list heading. Measure that the
  label and the controls share a `left` at 390 and 320. Keep the word
  inside each control for a screen reader. It must be clipped
  (`clip-path: inset(50%)`), never `display:none`, and the heading copy
  is `aria-hidden`. Pin that with a stylesheet test: jsdom cannot see it.
  **Measure first:** `scrollWidth > clientWidth` over every name and fact
  line gives the count of cut rows, before and after.
- **A title with a subtitle beside a face is a grid, and `gap` there is
  two gaps.** CRM tick 10: on one line, a stage that never shrinks cut a
  long name to one word. Moving the stage under the name (face spanning
  both lines, as in Pipedrive and HubSpot) gave the name 131 -> 272px. The
  first try grew the row from 36 to 52px, because in a grid the flex row's
  `gap: 10px` is also a ROW gap. Set `row-gap: 0` and measure the row
  height, not just the name width.
- **A pinned section heading needs a parent of its own and the real height
  of the bar above it.** A sticky element is held inside its parent. Two
  headings in one parent stay pinned together, so wrap each heading and
  its rows in a `<section>`. `top` is the pinned bar's height. Publish it
  with `usePublishedHeight` (a ResizeObserver, on the bar's parent) rather
  than copying 114px into the stylesheet. Give the heading an opaque
  background. Scroll to a few depths and read each heading's `top`: it
  should equal the bar's bottom until its section ends.
- **Check a pinned element in the Telegram shell, not only the page.**
  Inside Telegram `#root` scrolls, not the window (`telegram.css`). The
  harness loads that stylesheet, so set `html.dataset.tg = '1'` and
  `--app-vh-stable` to the viewport height, then scroll `#root` and measure
  `top` relative to `#root`'s rect. Scroll the window back to 0 first: a
  window offset left from before the switch makes every sticky element
  look broken (CRM tick 11: -410px, a false alarm).
- **"Not enough room" is often the space BETWEEN rows.** CRM tick 11: each
  64px contact was its own framed card with a 10px gap, a 74px pitch.
  Telegram and iOS Contacts use one grouped surface with a hairline indented
  past the face. The same rows then pitch at 62px, about one more person per
  phone screen, with no touch target smaller. Measure the pitch (the
  distance between rows' tops), not the row height.
- **A search result must show what was typed.** Mark the hit (`<mark>`).
  Put the fact it was found in before the ones that can push it past the
  ellipsis, and name a hidden field (the id) when it was the only match.
  CRM tick 11: "ор" matched a package name that rendered as "... · Ф▮…",
  a hit cut in half by the ellipsis.
- **Measure in the owner's language; English fitting proves nothing.** CRM
  tick 9: `.crm__acts button{flex:1 1 auto}` put four English buttons on one
  line. In Russian ("Отказался" is wider) the last button wrapped ALONE and
  grew to 318px, a lone full-width button. The same rule on a shared
  selector also stretched single buttons in other panels. The fix: wrap the
  buttons that belong together in one group (`role="group"`, `display:flex`).
  The group wraps as one, and only its children grow (`flex:1 1 0`, even
  thirds). A stylesheet test forbids a grow on the shared selector. Switch
  the language (`localStorage['vibee-lang']`) and re-measure at 390 and 320
  before calling a row fixed.
- **A harness must mount the app's own chrome.** Without `TelegramTabBar`,
  pages reserve 0 px for the bar (`body[data-tabbar]` is never set), and the
  header's fallback bottom bar covers the composer. That overlap exists only
  in the harness. Before calling an overlap a bug, check that the harness
  mounts what `App.tsx` mounts.
- **A flex row without `min-width: 0` defeats the ellipsis and widens the
  PAGE.** The chat top row was 490 px wide at 390, and the document scrolled
  sideways to 502. Measure `document.documentElement.scrollWidth`, not only
  the row. **Fix:** the row gets `min-width: 0; max-width: 100%`, the title
  gets `min-width: 0`.
- **A shared class with `margin-left: auto` splits the free space.** Card and
  Queen both pushed, so they stood apart mid-row. The override must win on
  specificity (`.a.b`), because an earlier plain `.b` rule loses to the
  later shared one.
- **44 px targets without growing the row:** use `min-height: 44px` plus
  negative `margin-block` under `(pointer: coarse)`, so the target reaches
  into the row's padding.
- **Server prose on the screen is a language bug waiting.** The CRM's
  waiting reasons were Russian sentences built on the server, so an English
  screen printed them verbatim (tick 12). Send a code next to the words
  (`because_code`, `next_why_code` + `next_why_vars`), translate the code,
  and keep the words as the fallback for a code the screen does not know
  yet. A test reads the code list from the server's own source, so a new
  code without a line in both dictionaries fails at once.
- **A stand that keeps saying NOT MEASURED is rot, not luck.** #3242 put the
  palette inside a closed `<details>` ("More"); the stand waited for a root
  that was never visible and printed "not measured" (exit 2) for days while
  the panel under it had 32px topic buttons and a 24px DM toggle. Two fixes:
  a harness may carry `open: async page => ...` — run before the root wait,
  it opens the door the way a thumb does (`openMore` presses the summary
  once); and `bun run verify` runs `tri shot all` as step `phone-shots`,
  where exit 2 is a FAIL, never a skip (retried once for load).
- **An ellipsis on the only name of a thing is a cut.** The reel history row
  ended its topic in "..." at 320px; the topic is what tells one reel from the
  next, so it wraps (`overflow-wrap: anywhere; min-width: 0`).
- **`new URL(`...${x}`, import.meta.url)` in a player test is an asset glob
  to Vite**, and a path outside the player is refused ("Denied ID ...?url").
  Read the server source with `resolve(dirname(fileURLToPath(
import.meta.url)), ...)` and `readFileSync`.
- **Green by the counters is not yet green to the eye.** CRM, 2026-10-02:
  after the search box moved its border from the input to the label,
  design-system.css still ringed the focused input (`box-shadow`), which
  drew a second box inside the first. No counter catches that. Read the PNGs
  after every fix.
- **Wrap, don't cut, on a phone.** `overflow-wrap: anywhere` instead of
  `nowrap` + `ellipsis` for names and facts; wrap a chip row (funnel,
  filters at 320) instead of scrolling it past the edge. The cost is a
  taller row, so say so in the PR.
- **A link inside a line of text is never 44px.** Give it its own element
  (`a.crm__tme`, a 44×44 sibling) and a grid column on a phone. Look for the
  same speck in the screen's other lists, even if the stand's fixture leaves
  them empty (CRM hot leads).

## Related Resources

- `bin/helpers/shot.mjs`, `bin/helpers/shot-story-answer.ts`
- `apps/vibee-editor/player/harness/`, `src/harness/`
- `tri layout` — рецепт замера высоты в панели предпросмотра (на машине с ней)
- навык `story-reel-gift` — что показывает панель палитры
