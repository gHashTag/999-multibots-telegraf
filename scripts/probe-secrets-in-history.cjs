#!/usr/bin/env node
/**
 * READ-ONLY. Ищет секреты в ИСТОРИИ КОММИТОВ и в местах, где код их ПИШЕТ В ЛОГ.
 *
 * Повод: в базе нашлись токены восьми действующих ботов
 * (docs/audit/bot-tokens-in-db.md). База проверена — остались два места, где
 * секрет живёт долго и незаметно: история git и логи приложения.
 *
 * ВАЖНО: сами значения НЕ ПЕЧАТАЮТСЯ — только вид, коммит, файл и отпечаток.
 *
 * САМОПРОВЕРКА обязательна. Прошлая искалка нашла ноль из-за границы слова в
 * шаблоне, и «ничего не найдено» едва не ушло в отчёт как хорошая новость.
 *
 * Ничего не пишет.
 */
const { execSync, spawnSync } = require('child_process')
const { repoFiles } = require('./lib/repo-sources.cjs')
const fs = require('fs')
const path = require('path')

/**
 * ⚠️ ФЛАГ `i` У ПЕРВОГО ШАБЛОНА ОБЯЗАТЕЛЕН.
 *
 * Без него мимо проходит `const BOT_TOKEN = '…'` — заглавными пишут ровно там,
 * где токен присваивают переменной, то есть в самом опасном случае. Замер на
 * 2026-08-23, ДО чистки: добавление `i` дало ровно два новых файла
 * (`src/inngest_app/functions/monitoring/*.ts`), и в обоих лежал действующий
 * токен. Искалка, слепая к регистру, отчитывалась «чисто».
 *
 * Те файлы вычищены, и сейчас `i` не добавляет находок. Убирать его всё равно
 * нельзя: он держит дверь закрытой.
 *
 * ⚠️ ЧЕГО ЗДЕСЬ НЕ БЫЛО ВОВСЕ — И ЧТО СТОИЛО ДОРОЖЕ ВСЕГО ОСТАЛЬНОГО ВМЕСТЕ.
 *
 * До 2026-08-23 в этом списке не было шаблона под машинную учётку Infisical.
 * Она не «ещё один ключ»: пара `INFISICAL_CLIENT_ID` +
 * `INFISICAL_CLIENT_SECRET` обменивается на токен, которым читаются ВСЕ 50+
 * секретов проекта разом — включая ровно те токены ботов и служебные ключи
 * Supabase, которые вычищали предыдущие заходы. Пока шаблона не было, искалка
 * отчитывалась «чисто» про замок, оставляя на виду ключ от всей связки.
 *
 * Проверено живым прогоном по истории: учётка в ней есть.
 */
const PATTERNS = [
  [
    'токен бота Telegram',
    /(?:bot|token[=:"'\s]+)(\d{8,10}:[A-Za-z0-9_-]{30,})/gi,
    'полное управление ботом',
  ],
  /**
   * Кириллическое «Токен:». Шаблон выше требует ASCII-приставку `bot`/`token`,
   * а русская документация пишет приставку по-русски — и токен проходил мимо.
   * `[^0-9\n]{0,12}` — окно под разделители БЕЗ цифр: запрет цифр гарантирует,
   * что найденные `\d{8,10}` — начало токена, а не его середина.
   */
  [
    'токен бота Telegram (кириллическое «Токен:»)',
    /токен[а-яё]*[^0-9\n]{0,12}\d{8,10}:[A-Za-z0-9_-]{30,}/gi,
    'полное управление ботом',
  ],
  /**
   * Голые 64 hex БЕЗ имени рядом намеренно НЕ ищем: в истории полно sha256 из
   * package-lock и контрольных сумм, и такой шаблон утопил бы находку в шуме.
   * Инструмент, завышающий находки, обесценивает и настоящие.
   */
  [
    'машинная учётка Infisical',
    /(?:INFISICAL_CLIENT_SECRET|client[_-]?secret)["'\s]*[=:]["'\s]*[a-f0-9]{64}/gi,
    'доступ ко ВСЕМ 50+ секретам проекта разом',
  ],
  ['ключ xAI', /xai-[A-Za-z0-9_-]{40,}/gi, 'запросы к Grok за ваш счёт'],
  // `i` добавлен там, где его не хватало. Замер на 2026-08-23: на текущем
  // дереве ни одного нового файла, то есть ложных срабатываний не вносит, но
  // закрывает формы `R8_…`, `SK_…` и hex заглавными. `ключ AWS` намеренно
  // оставлен БЕЗ `i`: настоящий AKIA всегда заглавный, а `i` превратил бы
  // `[0-9A-Z]{16}` в «любые 16 букв-цифр» и дал бы совпадения в base64-блобах,
  // которых в истории очень много.
  ['ключ Replicate', /r8_[A-Za-z0-9]{35,}/gi, 'генерации за ваш счёт'],
  ['ключ OpenAI', /sk-[A-Za-z0-9]{32,}/gi, 'запросы за ваш счёт'],
  ['ключ Anthropic', /sk-ant-[A-Za-z0-9_-]{30,}/gi, 'запросы за ваш счёт'],
  ['ключ ElevenLabs', /sk_[a-f0-9]{40,}/gi, 'синтез речи за ваш счёт'],
  ['ключ AWS', /AKIA[0-9A-Z]{16}/g, 'доступ к хранилищу'],
  ['токен GitHub', /gh[pousr]_[A-Za-z0-9]{30,}/gi, 'доступ к репозиторию'],
  [
    'служебный ключ Supabase',
    /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{20,}/g,
    'полный доступ к базе',
  ],
  ['токен Fly.io', /fm2_[A-Za-z0-9+/=]{40,}/gi, 'управление развёртыванием'],
]

/**
 * Образцы, на которых шаблоны ОБЯЗАНЫ срабатывать.
 *
 * ⚠️ ВСЕ ЗНАЧЕНИЯ НИЖЕ ВЫДУМАНЫ И ДОЛЖНЫ ОСТАВАТЬСЯ ВЫДУМАННЫМИ.
 * Шаблон проверяет ФОРМУ, а не значение, поэтому настоящий ключ здесь не
 * усиливает проверку — он только утекает вместе с репозиторием, да ещё в файле,
 * который никто не заподозрит. Две замены 2026-08-23:
 *
 *   • в образце стоял номер ДЕЙСТВУЮЩЕГО бота (секретная половина и тогда была
 *     выдумана, так что ключ не утекал) → 1111111111;
 *   • образец Fly.io был ДОСЛОВНЫМ ПЕРВЫМИ 64 ЗНАКАМИ настоящего FLY_API_TOKEN
 *     — того самого, что вычистили из CLAUDE.md; здесь он пережил чистку и
 *     остался единственным его следом в репозитории → синтетика той же длины.
 *
 * Правите образец — сохраняйте длину и форму, иначе шаблон перестанет
 * совпадать, самопроверка пройдёт вхолостую и «ничего не найдено» снова начнёт
 * читаться как хорошая новость.
 *
 * ⚠️ ПОМЕТКА `secret-guard-ok` СТАВИТСЯ НА ТУ ЖЕ ФИЗИЧЕСКУЮ СТРОКУ, ЧТО И
 * ЗНАЧЕНИЕ. `scripts/security-token-guard.sh` фильтрует вывод `grep -n`, то
 * есть снимает совпадение ТОЛЬКО если пометка в той же строке; обещание «на
 * той же или предыдущей» в его шапке кодом не подкреплено. Здесь пометки
 * стояли на строках `],`, куда их отодвинул prettier с `printWidth: 80`, и они
 * не работали. Ставим хвостовым комментарием прямо за литералом.
 */
const SELF_CHECK = [
  [
    'токен бота Telegram',
    'https://api.telegram.org/file/bot1111111111:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/p.jpg', // secret-guard-ok: выдуманный образец самопроверки  // telegram-api-root-ok  cyrillic-ok
  ],
  [
    'ключ Replicate',
    'REPLICATE_API_TOKEN=r8_abcdefghijklmnopqrstuvwxyz0123456789ABCD', // secret-guard-ok: выдуманный образец самопроверки
  ],
  [
    'ключ OpenAI',
    'sk-abcdefghijklmnopqrstuvwxyz0123456789AB', // secret-guard-ok: выдуманный образец самопроверки
  ],
  [
    'ключ Anthropic',
    'sk-ant-abcdefghijklmnopqrstuvwxyz0123456789', // secret-guard-ok: выдуманный образец самопроверки
  ],
  [
    'ключ ElevenLabs',
    'sk_abcdef0123abcdef0123abcdef0123abcdef0123', // secret-guard-ok: выдуманный образец самопроверки
  ],
  [
    'ключ AWS',
    'AKIAIOSFODNN7EXAMPLE', // secret-guard-ok: выдуманный образец самопроверки
  ],
  [
    'токен GitHub',
    'ghp_abcdefghijklmnopqrstuvwxyz0123456789', // secret-guard-ok: выдуманный образец самопроверки
  ],
  [
    'служебный ключ Supabase',
    'eyJxxxxxxxxxxxxxxxxxxxx.eyJxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.xxxxxxxxxxxxxxxxxxxx', // secret-guard-ok: выдуманный образец самопроверки
  ],
  [
    'токен Fly.io',
    'FLY_API_TOKEN=fm2_EXAMPLEEXAMPLEEXAMPLEEXAMPLEEXAMPLEEXAMPLEEXAMPLEEXAMPLE0000', // secret-guard-ok: выдуманный образец самопроверки
  ],
  [
    'токен бота Telegram (кириллическое «Токен:»)',
    '- ✅ Токен: `1111111111:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`', // secret-guard-ok: выдуманный образец самопроверки
  ],
  [
    'машинная учётка Infisical',
    'INFISICAL_CLIENT_SECRET=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', // secret-guard-ok: выдуманные 64 hex по порядку, не значение
  ],
  [
    'ключ xAI',
    'XAI_API_KEY=xai-abcdefghijklmnopqrstuvwxyz0123456789ABCD', // secret-guard-ok: выдуманный образец самопроверки
  ],
]

/**
 * ⚠️ ОБРАТНАЯ СТОРОНА САМОПРОВЕРКИ, БЕЗ КОТОРОЙ ОНА ПОЛОВИНЧАТА.
 *
 * `SELF_CHECK` доказывает, что шаблон СРАБАТЫВАЕТ. Он не доказывает, что
 * шаблон отличает секрет от не-секрета: шаблон `/./` прошёл бы `SELF_CHECK`
 * целиком и при этом пометил бы каждый коммит в истории. Отчёт, где «найдено»
 * стоит везде, читается так же, как отчёт, где «найдено» не стоит нигде.
 *
 * Здесь строки, на которых НИ ОДИН шаблон срабатывать НЕ ДОЛЖЕН, — настоящие
 * формы из этого репозитория: плейсхолдеры документации, ссылки на переменные
 * окружения, sha256 из lock-файлов.
 */
const NEGATIVE_CHECK = [
  '- ✅ Токен: `1234567890:AA-ПРИМЕР-НЕ-НАСТОЯЩИЙ-ТОКЕН` — это плейсхолдер',
  'Токен хранится в Infisical, в репозитории его нет',
  'INFISICAL_CLIENT_SECRET=${INFISICAL_CLIENT_SECRET}',
  'INFISICAL_CLIENT_SECRET=<взять: railway variables --kv | grep INFISICAL_>',
  'const clientSecret = process.env.INFISICAL_CLIENT_SECRET',
  'sha256 = 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  '"integrity": "sha512-0123456789abcdef0123456789abcdef0123456789abcdef"',
  'const apiKey = process.env.XAI_API_KEY // база: https://api.x.ai/v1',
  'BOT_TOKEN=<взять: railway variables --kv | grep BOT_TOKEN_1>',
]

function selfCheck() {
  const broken = []

  // 1. Прямая сторона: шаблон обязан сработать на своём образце.
  for (const [name, sample] of SELF_CHECK) {
    const rule = PATTERNS.find(p => p[0] === name)
    if (!rule) {
      broken.push(`${name}: шаблона нет`)
      continue
    }
    rule[1].lastIndex = 0
    if (!sample.match(rule[1])) broken.push(`${name}: не сработал на образце`)
  }

  // 2. Обратная сторона: на заведомо чистой строке не должен сработать НИКТО.
  for (const clean of NEGATIVE_CHECK) {
    for (const [name, re] of PATTERNS) {
      re.lastIndex = 0
      if (re.test(clean)) {
        broken.push(`${name}: ЛОЖНОЕ срабатывание на «${clean.slice(0, 50)}…»`)
      }
    }
  }

  // 3. Шаблон без образца ничем не лучше отсутствующего: никто не знает,
  //    работает ли он. Ровно так здесь годами жили пять шаблонов, а под
  //    машинную учётку Infisical шаблона не было вовсе.
  for (const [name] of PATTERNS) {
    if (!SELF_CHECK.some(([n]) => n === name)) {
      broken.push(`${name}: шаблон есть, а образца самопроверки нет`)
    }
  }

  return broken
}

const fingerprint = v => `${String(v).slice(0, 8)}…${String(v).length} зн.`

function scanText(text, where, found) {
  for (const [name, re, why] of PATTERNS) {
    re.lastIndex = 0
    const m = text.match(re)
    if (!m) continue
    if (!found.has(name)) found.set(name, { why, places: new Map() })
    const e = found.get(name)
    if (!e.places.has(where)) e.places.set(where, new Set())
    for (const hit of m) e.places.get(where).add(fingerprint(hit))
  }
}

function report(title, found) {
  console.log(`\n=== ${title} ===`)
  if (!found.size) {
    console.log('  ничего не найдено')
    return
  }
  for (const [name, { why, places }] of found) {
    const uniq = new Set([...places.values()].flatMap(s => [...s]))
    console.log(`  ${name} — ${why}: разных значений ${uniq.size}`)
    for (const [where, prints] of [...places.entries()].slice(0, 12)) {
      console.log(`      ${where}  ${[...prints].slice(0, 2).join(', ')}`)
    }
    if (places.size > 12) console.log(`      ... ещё ${places.size - 12} мест`)
  }
}

function main() {
  const broken = selfCheck()
  if (broken.length) {
    console.error('❌ САМОПРОВЕРКА НЕ ПРОШЛА — искалке верить нельзя:')
    for (const b of broken) console.error('   ', b)
    process.exit(2)
  }
  console.log(
    `самопроверка пройдена: ${SELF_CHECK.length} образцов должны ловиться, ` +
      `${NEGATIVE_CHECK.length} чистых строк — не должны, ` +
      `у всех ${PATTERNS.length} шаблонов есть образец`
  )

  // --- 1. Файлы в рабочем дереве, ОТСЛЕЖИВАЕМЫЕ git ---------------------
  // Tracked AND present-but-unstaged. A secret sitting in a file that has not
  // been `git add`ed yet is still a secret on this disk; the index-only
  // population made it invisible to the very scan written to find it.
  // (repoFiles uses -z on both halves, which is why the escaping lesson below
  // still holds.)
  const tracked = repoFiles(process.cwd())
  const inFiles = new Map()
  // Skipped by TYPE, not size (same blind spot as the repo scan: the old 2 MB
  // limit dropped seven payment-table dumps of 4-18 MB). Skips are counted, so
  // "nothing found" stops describing an unknown subset.
  const MEDIA =
    /\.(mp3|mp4|webm|mov|avi|png|jpe?g|gif|webp|ico|pdf|zip|gz|woff2?|ttf|otf|wasm|bin|sqlite|db)$/i
  let scanned = 0
  const skipped = []
  for (const f of tracked) {
    if (!fs.existsSync(f)) {
      skipped.push(`${f}: нет на диске`)
      continue
    }
    const st = fs.statSync(f)
    if (!st.isFile()) continue
    if (MEDIA.test(f)) continue
    let text
    try {
      text = fs.readFileSync(f, 'utf8')
    } catch (e) {
      skipped.push(`${f}: ${e.message}`)
      continue
    }
    scanned++
    scanText(text, f, inFiles)
  }
  console.log(`осмотрено файлов: ${scanned} из ${tracked.length}`)
  if (skipped.length) {
    console.log(`  НЕ ПРОЧИТАНО: ${skipped.length}`)
    for (const x of skipped.slice(0, 5)) console.log(`     ${x}`)
  }
  report('СЕКРЕТЫ В ОТСЛЕЖИВАЕМЫХ ФАЙЛАХ (текущее состояние)', inFiles)

  // --- 2. История коммитов ----------------------------------------------
  const inHistory = new Map()
  // The WHOLE history in one stream, not 800 commits one at a time.
  //
  // Was: `git rev-list --all --max-count=800` plus a `git show` each. That
  // covered 800 commits of 4790 -- 16.7% -- and the section heading was
  // printed as if it were the answer about history. The direction is worse:
  // rev-list returns the NEWEST commits, so the probe looked exactly where a
  // long-deleted secret cannot be -- which is the only reason to scan
  // history at all. It reported nothing found, every run.
  //
  // One `git log -p` over everything takes 5.8s against 23.7s for the old
  // 800: four times faster at six times the coverage. The stream is read
  // line by line (240 MB), so it never lands in memory whole.
  const total = Number(
    execSync('git rev-list --all --count', { encoding: 'utf8' }).trim()
  )
  const proc = spawnSync(
    'git',
    ['log', '--all', '-p', '--unified=0', '--format=%H'],
    { encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024 }
  )
  if (proc.status !== 0) {
    console.error('git log не отработал -- история НЕ осмотрена')
    process.exit(2)
  }
  let seen = 0
  let current = 'HEAD'
  for (const line of proc.stdout.split('\n')) {
    if (/^[0-9a-f]{40}$/.test(line)) {
      current = line.slice(0, 10)
      seen++
      continue
    }
    if (line) scanText(line, current, inHistory)
  }
  console.log(`\nосмотрено коммитов: ${seen} из ${total}`)
  if (seen < total) {
    console.log('  ВНИМАНИЕ: осмотрена не вся история, вывод ниже неполон.')
  }
  report('СЕКРЕТЫ В ИСТОРИИ КОММИТОВ', inHistory)

  // --- 3. Код, который пишет секреты в лог ------------------------------
  const logging = []
  const srcFiles = tracked.filter(
    f => f.startsWith('src/') && f.endsWith('.ts')
  )
  const SECRETISH =
    /(token|apiKey|api_key|secret|password|SERVICE_ROLE|credential)/i
  for (const f of srcFiles) {
    if (!fs.existsSync(f)) continue
    const lines = fs.readFileSync(f, 'utf8').split('\n')
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]
      if (
        !/(logger\.(info|warn|error|debug)|console\.(log|error|warn))/.test(l)
      )
        continue
      if (!SECRETISH.test(l)) continue
      // Отсекаем безопасное: длина, наличие, маскирование.
      // Безопасные виды: логируется НАЛИЧИЕ, длина, маска или сообщение об
      // отсутствии — но не само значение.
      //
      // Без `!!` и `не найден/is not set` первая версия дала 70 «находок»,
      // из которых настоящих не было ни одной: почти всё — строки вида
      // `console.log('BOT_TOKEN_1 exists:', !!process.env.BOT_TOKEN_1)`.
      // Инструмент, завышающий находки, обесценивает и настоящие.
      if (
        /(!!|\.length|Boolean\(|\?\s*'есть'|substring|slice\(|\bmask|\*\*\*)/.test(
          l
        ) ||
        /(не найден|not set|not found|отсутств|skipping|загружен|exists|check in ENV|totalSecrets)/i.test(
          l
        )
      )
        continue
      logging.push(`${f}:${i + 1}  ${l.trim().slice(0, 90)}`)
    }
  }
  console.log(`\n=== КОД, ПИШУЩИЙ СЕКРЕТ В ЛОГ: ${logging.length} ===`)
  console.log('   (список для чтения глазами)\n')
  for (const l of logging.slice(0, 40)) console.log(`  ${l}`)
  if (logging.length > 40) console.log(`  ... ещё ${logging.length - 40}`)
}

main()
