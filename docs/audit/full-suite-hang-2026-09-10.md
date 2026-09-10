# Полный прогон vitest висел на 100 % CPU: одна строка теста и /proc

Дата: 2026-09-10. Контекст: локальная замена CI (GitHub Actions не запускается
из-за биллинга аккаунта), полный `npx vitest run` из корня.

## Симптом

Прогон доходил до `apps/vibee-editor/render/…`, после чего один воркер
крутился на 99,9 % CPU без конца (наблюдал 21 минуту). `testTimeout` 30 с не
срабатывал — таймаут vitest живёт в цикле событий, а цикл был заблокирован
синхронно. `kill -USR1` инспектор не открыл, `gdb`/`strace` в среде нет.

## Как нашли

Точечные прогоны по каталогам всё показывали зелёным — зависал файл, а не
каталог. Стандартные репортеры печатают файл только по окончании, поэтому
«последний ✓» указывал не на виновника. Помог репортер из десяти строк,
пишущий `onTestModuleStart`/`onTestModuleEnd` в файл, плюс
`--no-file-parallelism`: первый `START` без `END` —
`apps/vibee-editor/render/talking-portrait.test.ts`. Дальше бисекция
`-t "<describe>"` → `-t "<it>"` с `timeout 20`:
`no ledger at all means no spending`.

## Причина

Тест хотел «директорию, которую нельзя создать» и подставил
`/proc/no/such/place/spend.json`. На macOS владельца `/proc` нет — `mkdirSync`
бросает, тест зелёный. На Linux `/proc` существует, procfs отвечает на
`mkdir /proc/no` не `EACCES`, а `ENOENT`; рекурсивный `fs.mkdirSync`
трактует `ENOENT` как «родителя ещё нет», поднимается к `/proc` (есть),
спускается обратно, снова `ENOENT` — синхронный цикл навсегда.
Воспроизводится одной строкой:

```sh
timeout 5 node -e "require('fs').mkdirSync('/proc/no/such/place',{recursive:true})"
# exit 124
```

## Починка

Родителем сделан обычный **файл** во временном каталоге теста —
`mkdir` отвечает `ENOTDIR` на любой ОС, намерение теста сохранено.
Поиск других `'/proc/` в тестах: больше нет.

## Попутно в том же каталоге

- `crm-offer.test.ts › a stalled touch write does not hold up the owner's "sent"`
  — падал по 30 с всегда, не только в полном прогоне. Fake timers: 3-секундный
  сторож взводится после отправки и двух динамических `import()`, которые
  идут через загрузчик модулей, а не через микрозадачи;
  `advanceTimersByTimeAsync(3100)` выполнялся раньше, чем таймер существовал.
  Теперь тест ждёт `vi.getTimerCount() > 0` через `vi.waitFor`, потом двигает
  часы. Три прогона подряд зелёные. Код продукта не менялся.
- `autopilot-talking-portrait.test.ts` (14) и `autopilot-poster-record.test.ts`
  (4) — `expected null to be +0`: тесты запускают
  `apps/vibee-editor/render/node_modules/.bin/tsx`, а у render-приложения
  свои зависимости не стояли. Среда, не код: после `npm ci` в
  `apps/vibee-editor/render` — 19/19.

## Что ещё показал полный прогон

- `src/tests/unit/provider-registry.test.ts` (#2316): `io-ts` требует peer
  `fp-ts`, а `.npmrc` с `legacy-peer-deps=true` peer не ставит — в чистой
  среде файл не загружается. `fp-ts` теперь явно в `dependencies`; в
  релизный бандл `io-ts` не входит (проверено по `dist/index.js`).
- `render/system-prompt-by-surface.test.ts` пиннил слово владельца от
  2026-09-08 «клуба нет»; #2317 (09-09) ввёл клуб за 10 000 звёзд/30 дней и
  переписал промпт, тест не обновил. Тест пинит действующее решение.
- `render/the-lock-and-the-credit-commit-together.test.ts`: точный счётчик
  вызовов `creditStarsPayment(pool, {` был 2, #2317 добавил третий
  (продление клуба). Счётчик 3, вызовы перечислены.
- Плеер, `ProfileTabs.test.tsx`: полный `vi.mock('jotai')` без `atom` —
  работал, пока у `@vibee/atoms` была вторая, немокнутая копия jotai; с одной
  копией индекс атомов падает при импорте. Мок стал частичным
  (`importOriginal`).
- Плеер, типы: из `packages/vibee-atoms/src` голый `react` резолвится вверх
  от пакета, а не из `player/node_modules` — в чистой среде это TS2307, в
  среде с посторонним `node_modules` над репозиторием — TS7016. В
  `tsconfig.app.json` плеера `react`/`jotai` закреплены через `paths`
  (vite использует свой `alias`, на рантайм не влияет). Похоже, это и был
  пятый из прежних BASELINE=5.
- `prettier --check "src/**/*.ts"` (шаг `verify`): 25 файлов за 09-09/09-10
  не были отформатированы — только переносы строк, отформатированы.

## Урок

Полный прогон из корня требует зависимостей трёх пакетов:
корень, `apps/vibee-editor/player`, `apps/vibee-editor/render`
(и `jotai` в корне для `packages/vibee-atoms`). Чистая среда без них даёт
сотни ложных падений и ложную уверенность «это код». Диагностика зависаний:
репортер начала файлов + `--no-file-parallelism`, не «последний ✓».
