---
name: 't27-spec-first'
description: 'Спеки .t27 — стандарт по умолчанию (решение владельца 27.09.2026). Любая вертикаль с числами и правилами (цены, лимиты, таймеры, кто платит, что уходит клиенту) описывается спекой в gHashTag/t27, копируется в хост вместе с выводом `t27c gen-ts`, хост ИМПОРТИРУЕТ числа, а тест гоняет векторы спеки против кода; строгая проверка — scripts/check-t27-specs.mjs. Загружать при словах «спека», «t27», «.t27», «перепиши на t27», «привяжи спеку», «стандарт», «gen-ts», «t27c», «Zig», при правке чисел в привязанной вертикали (src/spec/*), когда pre-commit пишет «A .t27 spec of record breaks a law», и ПЕРЕД тем, как написать в комментарии «spec: specs/…t27».'
---

# Спеки .t27 — стандарт по умолчанию

## Правило

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
репо в t27, ещё не привязанные (27.09: 59 из 61) — список только сокращается;
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
6. Мутации: сломай правило в хосте — тест привязки обязан упасть.

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
- **У t27 master краснеют 7 ворот и без тебя** (gate-topology, spec-guards,
  documented subcommands, corpus ratchet, duplicate-bodies, coverage,
  emit-bitexact) — это не твоя спека; см. комментарии в t27#4850/#4852.

## Что уже привязано (27.09.2026)

| спека                              | хост                                                                         | что нашла привязка                                                                                                                                                                     |
| ---------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| automation/crm-story-reel v6       | story-template, story-reel-tool, story-card, story-voice-notes, crm-playbook | двойная оплата кадра «ещё рисуется»; агент CRM не доходил до шаблона (голос — Replicate, не ElevenLabs); v4/v5: её голосовые на Kie без клона или при 402; v6: лимит дня до траты      |
| automation/crm-lead-magnet v2      | crm-deliver-tool, client-face, kie-image, billing-shared                     | «один подарок на человека» не держался; безопасная зона только в комментарии; подпись «по аватарке» на чужом источнике; устаревшие «не запускали», «платит получатель», «6 за секунду» |
| automation/crm-client-workspace v2 | conversation.ts, crm-duet-tool, routes (threadFor), плеер (маршруты, панели) | v1 превращал кривой id клиента в личную ветку, а код отказывает (400); панелей 7, не 6; ветка Королевы и агент в чате клиента не были описаны                                          |

## Очередь привязки (от быстрых побед к крупным)

1. ~~`automation/crm-client-workspace`~~ — привязана 27.09.
   ~~`automation/crm-sellers`~~ — привязана 27.09 (v2: тесты были без скобок, реальные id).
2. `automation/crm-client-ownership` (находка: «клиент» только по архиву
   `payments_v2`, звёзды `star_payments` не видны), `automation/crm-duet`
   (12 тестов без скобок → v2; `crm-duet-tool.ts` сам пишет TURNS_DEFAULT,
   TURNS_MAX, SELLER_RETRY_ON_LIMIT, DISCOVERY_SELLER_TURNS).
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
