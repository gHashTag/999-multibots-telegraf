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
./bin/tri shot all                        # все стенды × 390 ru, 390 en, 320 ru — для ворот
```

Стенды: `story-palette` — панель рилс-истории в карточке клиента (продавец),
`my-story` — её страница `/story` (жмёт сама клиентка), `crm-client` — вся
карточка `/crm/:id` (шесть панелей, рилс, дуэт с подтверждением).

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

## Related Resources

- `bin/helpers/shot.mjs`, `bin/helpers/shot-story-answer.ts`
- `apps/vibee-editor/player/harness/`, `src/harness/`
- `tri layout` — рецепт замера высоты в панели предпросмотра (на машине с ней)
- навык `story-reel-gift` — что показывает панель палитры
