---
name: 't27-spec-first'
description: 'Спеки .t27 — стандарт по умолчанию (решение владельца 27.09.2026). Любая вертикаль с числами и правилами (цены, лимиты, таймеры, кто платит, что уходит клиенту) описывается спекой в gHashTag/t27, копируется в хост вместе с выводом `t27c gen-ts`, хост ИМПОРТИРУЕТ числа, а тест гоняет векторы спеки против кода; строгая проверка — scripts/check-t27-specs.mjs. Загружать при словах «спека», «t27», «.t27», «перепиши на t27», «привяжи спеку», «стандарт», «gen-ts», «t27c», «Zig», при «оркестрация», «связать через .t27», «развилка между хостами», при правке чисел в привязанной вертикали (src/spec/*), когда pre-commit пишет «A .t27 spec of record breaks a law», и ПЕРЕД тем, как написать в комментарии «spec: specs/…t27».'
---

# Спеки .t27 — стандарт по умолчанию

## Правило

**Владелец, 07.10.2026: «напиши все скилы, что мы все пишем на .t27!!!»**
Не только вертикали с деньгами: любое число, порог, правило, порядок на
экране, ширина, при которой что-то сворачивается, -- спека первой. Каждый
навык репозитория несёт раздел «Пишем на .t27» -- указатель сюда, не копию;
`src/__tests__/tools/everySkillPointsToT27.test.ts` краснеет на навыке без
него. Промах, из-за которого это записано: виток 15 (P31) завёл в плеере
`CRM_PHONE_QUERY = '(max-width: 480px)'`, нижнюю ширину пилюль 360 px и
правило сворачивания AUTO кодом без спеки; P32 переносит их в
`crm-first-screen.t27`.

**Владелец, 27.09.2026:** «сделай спеки стандартом по дефолту; создай скилы и
скрипты, где строго будет проверяться .t27». t27 — язык, на который проект в
итоге переписывается (CLAUDE.md, «t27 в центре»). Вертикаль стоит на этой
дороге, когда:

1. её числа и правила живут в спеке `gHashTag/t27 specs/<kind>/<id>.t27`;
2. спека лежит в хосте байт в байт рядом со своим `t27c gen-ts`
   (`apps/vibee-editor/render/src/spec/<id>.t27` + `<id>.gen.ts`);
3. хост **импортирует** числа (`import * as SPEC from '../spec/<id>.gen'`) и
   нигде их не перепечатывает;
4. `<id>.test.ts` рядом прогоняет **каждый** `test` спеки против хоста —
   спека правдива, только если код делает то, что говорят её тесты.

Ссылка на спеку в комментарии без привязки — ровно тот анти-паттерн, против
которого это правило: «цитата, которую никто не проверяет».

## Когда

- Новая вертикаль с числами/правилами → спека **первой**, код — по ней.
- Меняешь число в привязанной вертикали → меняй спеку в t27 (VERSION+1),
  синхронизируй, не правь `*.gen.ts` руками.
- Пишешь в коде `specs/…/x.t27` → x должна быть привязана или записана как
  долг в `scripts/t27-specs.json` (проверка не пустит иначе).

## Оркестрация связывается через .t27

**Владелец, 02.10.2026:** «для оркестрации мы всё связываем .t27». Когда
работа идёт через несколько хостов сразу — сервер, плеер, `tri`, другой
агент, чужой API, — **развилку между ними** первой описывает спека. Это
решения «какой дорогой идти», пороги и то, что считается квитанцией.
Каждый участник ссылается на эту спеку, а не на соседний файл.

- **Развилка — функция спеки.** В `automation/meta-connect.t27` это
  `route(has_token, signed_in) -> "api" | "browser" | "skip"`. Хост повторяет
  её одноимённой функцией, а `publishEverywhere` идёт строго по ней. Тест
  проверяет развилку на самом хосте: без токена не уходит ни одного вызова API.
- **Квитанция — тоже правило спеки.** `posted(published_id)`: опубликовано
  только тогда, когда вернулся id поста. Нажатая кнопка постом не считается.
  Строку результата, по которой стол блога ставит ✅, держит тест.
- **Каждый участник ссылается на одну спеку.** Сервер импортирует числа из
  `meta-connect.gen`. Карточка плеера (`MetaConnectCard.tsx`) и `tri meta`
  читают ту же таблицу `social_tokens`, и в их шапках названа спека. Своих
  чисел у них нет.
- **Отказы тоже в спеке.** `TOKEN_LEAVES_SERVER=false` и `ASK_NEEDS_YES=true` —
  это константы с тестом на хосте: токен не уходит наружу, а ключ агента
  получает 403 на `/start`. Без такой константы запрет остаётся просто
  комментарием.

Порядок:

1. Спека в t27.
2. Seal и PR в t27.
3. `sync-t27-spec.mjs`.
4. Хост и тест с теми же заголовками.
5. Мутанты.
6. PR в 999 со ссылкой на t27#N.

## Строгая проверка — `scripts/check-t27-specs.mjs`

```bash
node scripts/check-t27-specs.mjs                        # офлайн: pre-commit, verify, vitest
node scripts/check-t27-specs.mjs --t27 ../t27 --run     # + сверка с t27, компилятор, тесты спек
```

Законы: `ascii`, `footer` (строка TRINITY в шапке и последней строкой),
`header-path`, `module` (одно `module <kind>::<id>`), `frame` (KIND, ID,
REPO = 999-multibots-telegraf, VERSION), `braced-tests` (тест открывает
скобку и что-то утверждает), `gen-header`/`gen-values`/`gen-extra`
(сгенерированный модуль = спека, ничего лишнего, ничего не выпало),
`gen-ignored` (в `.prettierignore`), `binding-test` + `binding-titles`
(каждое имя теста спеки дословно есть в `<id>.test.ts`), `host-imports`,
`restated` (файл вертикали не пишет число спеки литералом), `cited`.
С `--t27`: `t27-same`, `t27c-gen`, `ratchet`, с `--run` — `t27c-test`.

Где запускается: lefthook pre-commit (команда 8, `t27-specs`), `bun run
verify` (`check:t27-specs`), тесты рендера
(`src/spec/specs-of-record.test.ts` — там же отрицательный контроль на
каждый закон), и сам `sync-t27-spec.mjs` после записи.

**Манифест `scripts/t27-specs.json` — храповик.** `unbound`: спеки ЭТОГО
репо в t27, ещё не привязанные (27.09 вечер: 56 из 61) — список только сокращается;
привязал — убери, проверка требует. `foreign`: чужие спеки, на которые мы
ссылаемся для справки. `citedMissing`: спеки, которые наш код цитирует, а в
t27 их нет (27.09: 3) — долг: написать спеку или убрать цитату.

## Рецепт: привязать вертикаль

**Быстрый старт (27.09.2026): `tri spec-bind <kind/id> [t27]`** — копия спеки с
`gen-ts`, `src/spec/<id>.test.ts` с КАЖДЫМ заголовком теста спеки как
ПАДАЮЩЕЙ заглушкой, снятие с храповика и проверка. Существующий тест не
трогает (прошлый виток не затирается). Остаётся умное: импорт `SPEC` в хост и
заглушки → вызовы хоста. Первым делом читать вывод проверки: он сразу
показывает braceless-тесты (нужна v2 в t27) и `restated` (числа, которые хост
пишет сам).

1. **Спека в t27** (`/home/user/t27` или клон `gHashTag/t27`), ветка
   `claude/<тема>` — force push запрещён, занятая ветка → новая.
   - ASCII only; шапка `// SPDX…`, `// specs/<kind>/<id>.t27 -- …`, Host,
     Generated, Claim status, `// phi^2 + 1/phi^2 = 3 | TRINITY`;
   - `module <kind>::<id_с_подчёркиваниями> { … }`, KIND/ID/REPO/VERSION;
   - правила — `fn` (gen-ts тела не выводит: в хосте будет экспортируемая
     функция-зеркало), тесты — `test "…" { assert(…); }` с вызовами `fn`,
     а не сравнением литерала с самим собой (такие тесты пусты);
   - текст интерфейса (кириллица, эмодзи) в спеку не кладётся — кладётся
     свойство (`PREP_LABEL_NAMES_ASPECT`), текст остаётся в хосте.
2. **Проверить в t27**:
   ```bash
   cargo build --release -p t27c              # компилятор
   ZIG=…/ziglang  # Zig 0.16.0: pip download ziglang==0.16.0, распаковать wheel
   PATH=$ZIG:$PATH ./target/release/t27c test-report --verbose specs/<kind>/<id>.t27
   ./target/release/t27c validate-vacuity --specs-dir <каталог только с этой спекой>
   ./target/release/t27c seal --save specs/<kind>/<id>.t27
   ./target/release/tri now add "<заголовок>" --closes <issue> --bullet "…"
   ```
   Отрицательный контроль: сломай границу в копии спеки
   (`--specs-dir <копия>`) — тест обязан покраснеть.
3. **PR в t27**: issue → коммит с `Closes #N` и строкой TRINITY → PR →
   готов → слияние после обязательных проверок.
4. **Хост**:
   ```bash
   node apps/vibee-editor/render/scripts/sync-t27-spec.mjs /home/user/t27 <kind>/<id>
   ```
   Затем `import * as SPEC from '../spec/<id>.gen'` вместо литералов;
   `src/spec/<id>.test.ts`: для каждого `test` спеки — `it('<то же имя>')`,
   вызывающий функцию ХОСТА с входами и ответами спеки; поведение, которое
   живёт в другом тесте, — назвать его в комментарии рядом.
5. Убрать `<kind>/<id>` из `unbound` в `scripts/t27-specs.json`.
6. Мутации: сломай правило в хосте — тест привязки обязан упасть. Список
   мутаций — рядом с тестом (`src/spec/<id>.mutants.json`), прогон одной
   командой из каталога рендера:
   `tri mutants src/spec/<id>.mutants.json -- npx vitest run src/spec/<id>.test.ts`
   (таблица убитых/выживших, код 1 при выжившей). Выжившая — добавь вектор,
   и в спеку тоже.
7. Отрицательные контроли САМОЙ спеки — тоже списком рядом
   (`src/spec/<id>.controls.json`), на копии во временной папке, репо не
   трогаются: `T27_ZIG_DIR=<папка zig 0.16> tri spec-controls
src/spec/<id>.t27 src/spec/<id>.controls.json` — «пойман» / «ПРОПУЩЕН» /
   «не собралась» (последнее — не пойман: спека, которая не собирается,
   ничего не доказывает). Вердикт по таблице, не по коду возврата t27c.

## Ловушки (каждая стоила времени)

- **`t27c test-report` возвращает 0 при FAIL в таблице** (замер 27.09:
  «FAIL 2», код 0). Судить по таблице (`readTestReport`), не по коду.
- **Zig 0.15.2 не собирает** (`std.process.Init`) — нужен 0.16.0.
- **`t27c test` только считает тесты**, исполняет их `test-report`.
- **`scripts/tri now add` уходит в t27c** — собрать `tri` (`cargo build
--release` в t27) и звать `./target/release/tri`.
- **Prettier не трогает `*.gen.ts`**: это байты компилятора;
  `.prettierignore` в корне. Форматировать корневым prettier 3.6.2 (у рендера
  свой 3.8.1 переформатирует чужой код).
- **`;` внутри строки** в `pub const` — не конец объявления (парсер проверки
  это знает; свой парсер не пиши).
- **Векторы спеки тоже надо мутировать.** crm-duet v1: `state_after(3,4)`
  и `state_after(8,4)` проходили и при `lines < turns` вместо
  `lines < turns * 2`. Мутация в хосте выжила — значит, выживет и в спеке.
  Лечится вектором на границе (6 из 8 → failed), добавленным В ОБА места.
- **Сторож реальных id в `src/agent` видит в цвете из одних цифр
  (`#101820`) шестизначный номер.** В тестовых палитрах — #hex с буквами
  (`#10182a`); сторож не ослаблять. Виток 7 наступил снова (`#000000`,
  `#111111` в новом тесте): запись в навыке не спасает, если её не
  прогоняют — гоняй `no-dossier-in-the-agent-tree.test.ts` вместе с
  тестами, которые правишь в `src/agent`.
- **Тест, где мутация выживает из-за данных.** crm-story-reel v7: клиент
  «приносил» палитру `black` — её отбрасывает проверка #hex, и правило
  «клиент палитру не приносит» было неотличимо от мутации. Данные теста
  должны проходить все СОСЕДНИЕ проверки, чтобы упираться в проверяемую.
- **Файл теста мокает модуль, который нужен настоящим** (crm-client-workspace
  мокает `../agent/chat` ради маршрутов) — `vi.importActual` для той функции,
  а не второй файл теста.
- **Подделка базы возвращает КОПИИ строк.** crm-duet v3: фейк отдавал в
  SELECT те же объекты, что потом менял UPDATE, — хост читал `row.status`
  после записи и видел уже «doing» («noted» вместо «moved»). Postgres
  отдаёт копии; фейк тоже (`rows.map(r => ({ ...r }))`).
- **Фильтр в подделке — только по условию, которое SQL называет.** Фейк
  `planPool` фильтровал по `template_id = $2`; новое `template_id IS NOT NULL`
  он не знал и молча вернул её СОБСТВЕННУЮ карточку — 8 красных тестов,
  которые были правы. Новое условие в SQL — новая ветка в фейке.
- **Правило для экрана — в спеку, а функция экрана — в чистый модуль без
  импортов.** Виток 8 (панель палитры, v11): `player/src/lib/storyPalette.ts`
  не импортирует ничего, поэтому тест привязки в РЕНДЕРЕ импортирует её по
  пути (`await import(join(PLAYER, 'lib', 'storyPalette.ts'))`) и гоняет
  векторы спеки против НАСТОЯЩЕЙ функции плеера, а не копии. Путь строкой —
  tsc рендера не лезет в чужой пакет.
- **Не заявлять в PR проверку, которую не прогнал.** Виток 8: в описании
  PR спеки стояло «18/18 контролей хоста» до прогона — прогнал после, и
  только потом оставил. Число в описании — из вывода, не из ожидания.
- **Закон «всегда существует» — проверять перебором хоста, не словами.**
  Виток 9 (v12): «лучший из белого и чёрного читается на любом фоне» —
  константа `EXTREME_MIN_CONTRAST_X10 = 45` (√21 = 4,58:1). Привязка
  перебирает ВСЕ #rgb и серые фоны контрастом самого хоста и требует, чтобы
  худший был РАВЕН константе: не только «не ниже», но и «граница настоящая»
  (46 было бы ложью, 44 — пустым законом). Худший — #083, ровно 45.
- **Рефакторинг кода под списком мутантов оставляет якоря позади.** Виток
  9: `readPairs` поменял отступ — два `from` перестали находиться, а прогон
  называл только первый. `tri mutants --check <list>...` — все устаревшие
  якоря сразу, ничего не запуская; прогон теперь тоже называет все.
- **`tri spec-check <spec> [controls] [--seal]` — ворота спеки одной
  строкой** (виток 10): таблица, а не код выхода (BLOCKED ≠ зелёно);
  пустые тесты — копией в СВОЕЙ папке (виток 9 написал в PR «0 из 53»:
  в переиспользованной папке лежала вторая спека, своих было 29);
  контроли; печать из своего чекаута. На первом же прогоне поймала
  устаревший контроль (#26 держался за старое `SUGGEST_NEVER = 11`).
- **Выживший мутант «не та сторона» — признак, что перебор ходит одной
  дорогой.** Виток 10: фон проверяли только со светлой кнопкой, фон всегда
  уходил в тёмное, и мутант «светлый путь идёт к чёрному» жил. Лечится
  вектором на ОБЕ стороны и счётчиком: тест требует, чтобы обе дороги
  встретились хотя бы раз.
- **Число закона — из замера, и замер — в тесте.** Виток 11 (v14): прежде
  чем писать «тон уходит не дальше 3°», перебор хоста измерил худшие 2,54°
  (и 19,8° у старого смешения); в спеке — и граница, и старое число
  (`SRGB_MIX_DRIFT_DEG = 20`), а тест пересчитывает оба из кода. Закон,
  записанный до замера, — пожелание.
- **Мутант «цвет потерял насыщенность» проходит перебор, который пропускает
  почти серые.** Виток 11: фильтр `hueChecked` выкидывал обесцвеченный
  результат из проверки — нужен отдельный вектор на насыщенность (золото
  держит больше, чем при старом смешении).
- **Новая команда `tri` под занятым именем мертва молча.** Виток 11: `tri
drift` уже значил «влито, но не выехало»; `case` берёт первое совпадение,
  и новая команда отвечала ошибкой старой. Теперь
  `src/__tests__/tools/triCommandNamesAreUnique.test.ts` держит имена
  уникальными; моя стала `tri main-drift`.
- **Мутант, чей тест в другом файле, «выживает» на чужом прогоне.** Виток 7:
  список crm-story-reel прогнали с двумя обычными файлами — два «выживших»
  (бриф и чтение плана) были убиты своими тестами в других файлах сразу.
  Теперь у мутанта поле `"tests": ["файл"]` — tri mutants добавляет его к
  команде (и к зелёному прогону). Выживший без этого поля — сначала найди,
  где живёт его тест.
- **`tri mutants` — из каталога пакета, после `--` КОМАНДА.** Пути в списке
  относительные; `-- src/spec/x.test.ts` (файл вместо команды) давал
  трассировку Python. Теперь инструмент говорит, что не так.
- **Полный прогон — `tri full-run`**: «зелёный» фоновый прогон рендера
  однажды оказался прогоном плеера (178 файлов вместо 410).
- **Зелёный с первого раза — повод для мутаций, не для радости.** 13/13 с
  первого прогона, из 7 мутаций одна выжила.
- **Литерал в хосте — не единственный вид рассинхрона.** В crm-duet
  регулярка `{0,2}` считала слова МЕЖДУ отрицанием и словом, а спека —
  расстояние: окно 3 против 2. Хост строит регулярку из
  `NEGATION_WINDOW_WORDS - 1`, и тест держит расстояние 3.
- **Слияние squash — с явными `commit_title` и `commit_message`.** Без них
  сообщение склеивает всю историю ветки (включая слияния main).
- **Prettier в pre-commit пишет (`--write` + `stage_fixed`)**: файл, который
  раньше обошёл форматирование, переформатируется целиком при первой правке.
  Это не твой шум — назови его в PR.
- **VERSION поднимается вместе с заметкой в заголовке.** crm-story-reel
  прожила v12, v13 и v14 с `VERSION = 11`: три витка дописывали
  `// vN (дата)` и не трогали число. Закон `version-note` в
  check-t27-specs.mjs: у спеки с датированными заметками VERSION равен
  последней; в тесте спеки — `assert(VERSION == N)` с контролем «VERSION
  отстал». Нашлось на снимке панели, а не проверкой — проверки не было.
- **Убитый прогон мутантов оставляет мутанта в коде.** Виток 14: контейнер
  перезапустился посреди `tri mutants`, `finally` не выполнился, и
  story-reel-tool.ts остался с `hueChecked → true` — один `git add -A` до
  выкладки. Теперь каждая мутация пишется в журнал `.git/tri-mutants.pending.json`
  ДО применения, `tri mutants --heal` (сам зовётся в начале прогона и в
  `tri loop`) возвращает файл, если в нём ровно этот мутант, и не трогает
  файл, ушедший дальше. SIGTERM восстанавливает, как Ctrl-C. После любого
  перезапуска — первым делом `git status` и `tri loop`.
- **Правило в комментарии спеки — правило, которое никто не держит.**
  `PRICE_ESTIMATE_TOKENS … // named to the client BEFORE the press` жил с
  v1, а её страница ставила цену ПОД кнопкой, и тест «…the price before the
  press» проверял лишь, что цена ЕСТЬ. Правило из комментария становится
  константой с тестом и контролем (v16 `PRICE_BEFORE_PRESS`), а место на
  экране меряет `tri shot` (`before`). Название теста не должно обещать
  больше, чем он проверяет.
- **В самом t27 коммит идёт через ЕГО tri.** Если в PATH стоит глобальный
  `tri` из 999, хук падает с «unknown command: hooks». Нужно собрать свой
  (`cargo build --release -p tri --offline`) и коммитить с
  `PATH=$PWD/target/release:$PATH`.
- **Пуш в t27 требует запись NOW.** Без неё ворота NOW отказывают в пуше.
  Запись создаётся командой
  `./scripts/tri now add "<заголовок>" --bullet … --closes N` и коммитится
  отдельно.
- **`t27c validate-vacuity` принимает только `--specs-dir <каталог>`.** Голый
  каталог он отвергает. Негативный контроль обязателен: замените один `<=` на
  `<`, и нужный тест должен покраснеть.
- **`[host-imports]` до `git add` — ложная тревога.** Проверка ищет
  отслеживаемые файлы, поэтому сначала `git add` новых файлов хоста, потом
  повторный прогон.
- **VERSION — в отдельном тесте спеки** («VERSION says what the header's last
  note says»): иначе каждый подъём версии правит чужой тест (v15 держал
  `VERSION == 15` внутри теста о причинах).
- **У t27 master краснеют 7 ворот и без тебя** (gate-topology, spec-guards,
  documented subcommands, corpus ratchet, duplicate-bodies, coverage,
  emit-bitexact) — это не твоя спека; см. комментарии в t27#4850/#4852.

**2026-10-07 loop (crm-story-reel v20, ratchet drift #3828):**

- **A rewrite stales mutant anchors silently until the next
  `tri mutants --check`.** #3824 rewrote the retry rule through
  `carryStills`/`carryClips`/`voiceKnown` and merged with three anchors
  stale; no gate runs `--check`, so it took #3827 to find and re-anchor them.
  Run `tri mutants --check` in the same PR as the rewrite; after
  re-anchoring, rerun that exact mutant rather than trusting the new anchor.
- **At current mode `VOICE_NONE` (0) only `voiceKnown` keeps a missing voice
  mode from carrying clips.** `Number(null)` is `0`, so `sameVoice` alone
  calls a missing mode the same mode; `carryClips` returns
  `carryStills(sameStyle) && voiceKnown && sameVoice`, and `voiceKnown` is
  what blocks the clips. The boundary vector, from #3824, is
  `carryClips(true, true, false)`; it kills #3824's mutant "clips carried
  from an unrecorded voice". The story test "a failed job that never
  recorded its voice carries no clips" runs at mode 1 (`VOICE_CLONE`,
  `qualify()` gives a clone), so on its own it does not cover the mode-0
  boundary.
- **`tri mutants` lives in `bin/tri`.** The root `./tri` reaches it only
  through its unknown-command bridge (exit 64 = "not mine"); a word the root
  `./tri` handles itself never reaches `bin/tri` that way. When in doubt, call
  `bin/tri` directly.
- **A `*.gen.ts` goes stale when t27c changes, not only when the spec
  changes.** `mail-push.gen.ts` gained a "TestBlock was not emitted" line in
  #3831. Regenerate with the current compiler; never hand-edit the output.
- **A bee never applies the owner's `owner-approved-foreign` label to its own
  PR.** Generated output plus data is allowed without it; if the label is
  truly needed, park the branch and report.
- **Census/ratchet drift on t27 master can come from a master workflow
  change, not from your spec.** t27#7399 added a "Foreign-line budget" `run:`
  step to `own-language.yml` (which exists since t27 0f9f314d3, 2026-10-05)
  without re-blessing the census; `tools/census/quiet.txt` and `shell.txt`
  went from 181/301 to 182/302 only in t27#7451, an unrelated spec PR.
  Compare against fresh master before blaming your diff.
- **`git push` exiting 141 is not a failure by itself** (SIGPIPE from the
  pre-push hook output). Verify with `git ls-remote origin <branch>` and retry
  only if the branch is missing.
- **In a 999 worktree run `./tri wt-deps` first.** It links the root
  `node_modules` to the main checkout and copies render's into a real
  directory. It does not touch the player: the player tests need a separate
  `ln -sfn` of `apps/vibee-editor/player/node_modules` to the main checkout
  (`.claude/loop-opus/WORKFLOW.md`). Never commit either link (add files by
  name).
- **`check-t27-specs.mjs` without `--t27 <fresh t27 clone>` cannot see drift
  from t27.** Ratchet entries (`citedMissing`, `unbound`) only show up with
  it.
- **Lessons written from a compacted session summary carried four false
  claims (#3837 -> #3838).** Verify every fact against code or PR history
  before it goes into a skill.

## Что уже привязано (27.09.2026)

| спека                              | хост                                                                                               | что нашла привязка                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| automation/crm-story-reel v14      | story-template, story-reel-tool, story-card, story-voice-notes, crm-playbook                       | двойная оплата кадра «ещё рисуется»; агент CRM не доходил до шаблона (голос — Replicate, не ElevenLabs); v4/v5: её голосовые на Kie без клона или при 402; v6: лимит дня до траты; v7: палитра концовки продавца, #hex 5/7 цифр молча ломал CSS, контраст до траты; v8/v9: агентов к старому рилсу вели слова (бриф, Королева, подсказки, чтение плана); v10: палитра клиента хранится отдельно — в `profile.story_reel` она включила бы ей платное самообслуживание; v11: панель выбрасывала палитру из ответа; v12: отказ называет читаемый оттенок её цвета, закон «оттенок есть всегда» проверен перебором; v13: её цвет и её фон рядом с оттенком, фон бывает не всегда (контрпример найден перебором хоста); v14: оттенок в OKLCH — sRGB уводил тон на 19,8°, закон дрейфа ≤ 3° проверен перебором |
| automation/crm-lead-magnet v2      | crm-deliver-tool, client-face, kie-image, billing-shared                                           | «один подарок на человека» не держался; безопасная зона только в комментарии; подпись «по аватарке» на чужом источнике; устаревшие «не запускали», «платит получатель», «6 за секунду»                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| automation/crm-client-workspace v4 | conversation.ts, crm-duet-tool, routes (threadFor), плеер (маршруты, панели)                       | v1 превращал кривой id клиента в личную ветку, а код отказывает (400); панелей 7, не 6; ветка Королевы и агент в чате клиента не были описаны; v3: задачи Королевы шли Ассистенту, а не выбранному специалисту; v4: Королева называет исполнителя, чужое имя не теряет задачу                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| automation/crm-sellers v2          | telegram-tools (isSeller), crm-sellers-tool, бот (обход по продавцам)                              | тесты v1 без скобок сравнивали литералы сами с собой и называли реальных людей                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| automation/meta-connect v1         | meta-connect, meta-routes, meta-card, blog-share-wiring (publishEverywhere), плеер MetaConnectCard | браузер владельца вышел из Instagram/Threads/Facebook — стол молча пропускал три сети; API даёт id поста как квитанцию; ключ агента не может сам подключить сеть (403); токен запечатан и вычищается из ошибок                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| automation/crm-duet v3             | crm-duet-tool, leela-canon, crm-story-tool (storyTo), бот (businessBotService, текстом)            | окно отрицания в проверке голоса было 3 слова, а не 2; мягкий лимит брифа — 2 на прогон, не 3; векторы state_after не отличали `turns * 2` от `turns`; v3: рилс дуэта — рилс-история: инструмента не было ни в одном наборе дуэта, обещание «исполнялось» её портретом, план читал только карточки старого шаблона                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

## Очередь привязки (от быстрых побед к крупным)

1. ~~`automation/crm-client-workspace`~~ — привязана 27.09.
   ~~`automation/crm-sellers`~~ — привязана 27.09 (v2: тесты были без скобок, реальные id).
2. `automation/crm-client-ownership` (находка: «клиент» только по архиву
   `payments_v2`, звёзды `star_payments` не видны — чтение денег, только с
   тестами). ~~`automation/crm-duet`~~ — привязана 27.09 (v2, t27#4890).
3. `automation/agent-provider-chain`, `automation/inngest-probe-suite`,
   `automation/leela-agent-link`, `automation/browser-*`.
4. `functions/*` (26) и `crons/*` (23) — большие, по одной.
5. `citedMissing` (agent-conversations, inngest-functions-status,
   crm-proactive-sweep) — написать спеку или убрать цитату.

## Related Resources

- `scripts/check-t27-specs.mjs`, `scripts/t27-specs.json`
- `apps/vibee-editor/render/scripts/sync-t27-spec.mjs`
- `apps/vibee-editor/render/src/spec/` — привязанные спеки и их тесты
- навык `own-language-first` — наш язык для документов о себе
- CLAUDE.md, «Миссия: t27 в центре»

## Stacked spec PRs after a squash merge (07.10, t27#7000/#7009)

After the first PR of a chain squash-merges, every retargeted child conflicts
in the spec and its seal. Fix with a plain `git merge origin/master` (keep the
child's spec, `t27c seal --save`), never force push; wait for required checks
started AFTER the push. Better: do not stack spec PRs while Actions is down.
