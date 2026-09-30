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
```

Стенды: `story-palette` — панель рилс-истории в карточке клиента (продавец),
`my-story` — её страница `/story` (жмёт сама клиентка), `crm-client` — вся
карточка `/crm/:id` (шесть панелей, рилс, дуэт с подтверждением).
`crm` is the `/crm` list (fixtures in `src/harness/crmFixtures.ts`; the
harness ignores `?tab=` -- switch sections by tapping).

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
- **cut** — текст обрезан своим же блоком.
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

## Related Resources

- `bin/helpers/shot.mjs`, `bin/helpers/shot-story-answer.ts`
- `apps/vibee-editor/player/harness/`, `src/harness/`
- `tri layout` — рецепт замера высоты в панели предпросмотра (на машине с ней)
- навык `story-reel-gift` — что показывает панель палитры
