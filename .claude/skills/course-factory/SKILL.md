---
name: course-factory
description: 'How to make a t27.ai course: 27 lessons in EN and RU, one live colourful widget per lesson with its numbers from a t27 spec compiled to WebAssembly, a blog post, the catalogue +1, published on the apex. The recipe, the order of PRs, the laws of the site generators and the traps measured on courses 8 and 9. Load on «новый курс», «сделай курс», «курс на t27.ai», «уроки», «виджет урока», «визуализация в уроке», «фабрика курсов», «queen-course-keeper», «EPIC t27#9063», and before touching apps/website/specs/course/ or public/widgets/ in gHashTag/trinity.'
---

# Фабрика курсов t27.ai

Владелец, 11.10.2026: «делегируй королеве задачу делать новые и новые курсы,
рассказывая увлекательно про мой проект». Раньше (тот же день): «используй
визуализации, чтобы увлекательней курсы были!!»

Очередь курсов и определение «готово» лежат в одном месте: **EPIC
gHashTag/t27#9063**. Раунд Королевы описан в `.claude/agents/queen-course-keeper.md`.
Здесь — как сделать ОДИН курс и на чём уже спотыкались.

## When to Use This Skill

- делаешь новый курс или урок на t27.ai (`/learn/<курс>/`);
- добавляешь виджет урока (`apps/website/public/widgets/<id>/`);
- курс не проходит `check:course`, `check:widget-pages`, `check:widget-logic`;
- ведёшь раунд `queen-course-keeper`.

## Quick Diagnosis

| Симптом                                        | Причина и что делать                                                                                                                                                   |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<id>.logic.ts` без единой функции             | спека объявляет `pub fn`, а старый `t27-logic.mjs` читал только `fn`. Починено в 999#3987; `t27-logic` теперь падает (exit 1), если функции объявлены, но не прочитаны |
| Zig отказывает на `/` или `%` со знаком        | сдвиг на 111…1 (база 3, `OFFSET=581130733`) и беззнаковая арифметика — как `trit_at` в `specs/ternary/trits.t27`                                                       |
| в WASM не уходит `i64`/`u64`                   | понижаются только bool, u8/u16/u32, i8/i16/i32, f32/f64, str                                                                                                           |
| спека урока «не чистая» в компиляторе сайта    | сайт везёт свой t27c; спека с отброшенными блоками (`isa/ternary_gates.t27`: 30 штук) не годится — берите другую или перенесите логику                                 |
| спека с `use` не даёт логику                   | логика берётся из спеки без импортов; виджет карты опкодов ушёл на `ternary_encoding`, а не `t27a_mnemonics`                                                           |
| `agents-from-specs`: unknown shape / ExprUnary | отрицательные числа в массивах приходят как `ExprUnary`; формы i8/i16/i32 и arr-i\* добавлены в trinity#1619                                                           |
| `course-pages.mjs` падает под root             | Chromium под root нужен `--no-sandbox` — обёртка вокруг `chrome` с этим флагом                                                                                         |
| виджет печатает «null», стартовый вид скучный  | дети `null` фильтровать (`put()` в `ternary-kit.js`); стартовое состояние — уже интересное (сумма с переносом, машина, уже доработавшая программу)                     |
| цвета плиток вентилей перебиты                 | более точное правило `.tk-cell.tk-p/n/z`                                                                                                                               |
| бот-ревьюер пишет «пустые страницы `+0 -0`»    | сверять размером файла: в trinity#1622 все пять «пустых» были 376–1126 строк                                                                                           |

## Solution Steps

### 1. Логика уроков — спеки в gHashTag/t27

- Одна-две спеки на курс, рядом с тематическим каталогом (`specs/ternary/`,
  `specs/fpga/dsp/`). Каждая функция, которую покажет виджет, — `fn` в спеке с
  тестами; числа в тестах, не строки (Zig не сравнивает строки `==`).
- Закон «0 vacuous», отрицательные контроли, `t27c seal --save`, запись NOW в
  `docs/now/`, номер issue в каждом коммите (`git -c core.hooksPath=.githooks`).
- Кодирование согласовать с аппаратными спеками: в троичном курсе `code2`
  пришлось переделать на N=00, Z=01, P=10, как в `isa/`.
- Обязательные проверки t27: validate, check-linked-issue, parse-ratchet,
  own-language, duplicate-bodies. Красные на master (не наши, сверять заново
  каждый раз): t27b-native-ratchet, fpga-conformance, fpga-lint.
- Если задачу берёт движок Королевы — issue с `## Boundary` (список файлов);
  Королева сама дописывает разделы (метка `queen-shaped`).

### 2. Логика в виджет — без ручных копий

```bash
# 999: собрать fn спеки в WASM -> <id>.logic.ts
node scripts/t27-logic.mjs <spec.t27> <kind/id> --out=<dir>
# trinity: положить логику в папку виджета
node scripts/widget-logic.mjs --import <widget-id> <x.logic.ts> <x.t27>
node scripts/widget-logic.mjs --check   # sha спеки, импорт ./logic.js, K_<NAME> == константа логики
```

Массив `K_*` в `tool.js` не должен совпадать по имени с константой логики.

### 3. Курс в gHashTag/trinity (`apps/website`)

- Виджеты: `public/widgets/<id>/` — `tool.js`, `logic.js`, `logic.t27`,
  `card.png` (1200×630), `index.html`, `<id>.t27`; общий набор движков на курс
  (`ternary-kit.js`, `dsp-kit.js`) с `export function mount(engine, logic, W, mode)`.
- Спека виджета `specs/widgets/<id>.t27`: не меньше двух `test`; TITLE ≤ 70,
  DESCRIPTION ≤ 200, IMAGE_ALT ≤ 420, HOOK ≤ 160; CATEGORIES — fpga, compiler, game.
- Галерея `specs/widgets/gallery.t27`: вставка ПЕРЕД закреплёнными (wars), их
  индексы сдвигаются; тест на место полки.
- Курс: `specs/course/<id>.t27` + `<id>-ru.t27` + `i18n/<id>.ru.json`;
  каталог `specs/course/courses.t27` +1 с тестом на последний курс;
  отрицательный контроль в `scripts/course-from-spec.test.mjs` двигается
  (`COURSE_COUNT` n → n+1); пункт в `Navigation.tsx`.
- Ни один `LESSON_WIDGETS` id не повторяется ни в каком курсе.
- Превосходные степени («the first», «the only», «первый», «единственный»)
  генератор отвергает. RU обязан нести тот же мультисет цифр, что EN
  (`digitsOf` выбрасывает разделители) — без пробелов-разделителей тысяч.
- Спеки уроков возятся в `public/t27/files/specs/...` байт-в-байт как на
  master t27.
- Блог: `src/data/blog/bodies/<slug>.ts` + регистрация в `index.ts` и `posts.ts`;
  картинка поста рисуется из скомпилированной логики, а не руками.
- Генерация и проверки: `gen:course-pages`, `check:course`, `test:course`,
  `check:widget-logic`, `check:widget-pages`, `check:widgets`,
  `check:course-pages`, `check:og-preview`.
- PR trinity: ветка `<type>/<slug>`; блок `<!-- t27-work-report -->` … с
  ```json, `head_sha`полный,`blog.outline`по 80–4000 знаков; проверка`python3 scripts/pr_blog_report.py validate --event ev.json --output dir`(в событии нужен объект`repository`).

### 4. Проверка, что курс в проде

Контейнер облачной сессии не достаёт до t27.ai. Проверка — по дереву апекса:

```bash
gh api "repos/gHashTag/gHashTag.github.io/git/trees/HEAD?recursive=1" --jq '.tree[].path' \
  | grep -E '^(learn/<курс>/index.html|ru/learn/<урок>/index.html|widgets/<kit>.js|blog/<slug>/index.html)$'
```

Коммит апекса называется «Publish … from trinity <sha>» — ждать именно sha
слияния. Ответ contents-API 404 печатается в stdout как JSON, поэтому `[ -n ]`
его не отличит от файла: проверять деревом.

## Как рассказывать увлекательно

- Курс — глава истории проекта: зачем это t27, Trinity, троичной машине,
  FPGA, улью. Первая страница говорит «почему», а не «что».
- Урок открывается вопросом, который задал бы любопытный человек; виджет на
  него отвечает; под виджетом — ссылка на спеку, которая считает ответ.
- Виджет живой с первой секунды: стартовый вид уже показывает интересное
  состояние, цвета — смысловые (P/Z/N, перенос, ошибка), палец 390 px.
- Ни одного числа без спеки или замера в репозитории. Никаких «первый в мире».

## Common Issues

- Замер «сколько спек заблокировано» на подмножестве банка без `math/`
  дал неверное число (11.10.2026). `test-report` гонять на полном банке.
- Две проверки Brain CI (CLI Smoke Test, Brain Health Report) упали на
  trinity#1622 за 2 с при той же сборке, дважды зелёной в том же прогоне.
  Перезапуск из облачной сессии — 403; объяснение комментарием в PR.

## Related Resources

- EPIC и очередь: gHashTag/t27#9063
- раунд Королевы: `.claude/agents/queen-course-keeper.md`
- курс 8: t27#8979, trinity#1619; курс 9: t27#8990, trinity#1622
- компилятор и specs/ml: t27#8993
- превью ссылок курса: навык `link-previews`

## Пишем на .t27

**Владелец, 07.10.2026: «все пишем на .t27».** Каждое число урока, порог
виджета и правило курса — спека `.t27` ПЕРВОЙ (в `gHashTag/t27`); виджет
импортирует логику, собранную из неё в WASM, а не копирует руками. Как
именно, законы и ловушки — только в навыке `t27-spec-first`: здесь указатель,
не копия правила.
