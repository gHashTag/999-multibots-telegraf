#!/usr/bin/env node
/**
 * READ-ONLY. Ищет секреты в СОДЕРЖИМОМ всех строковых полей базы.
 *
 * Повод: токены четырнадцати ботов нашлись в `users.photo_url` — не в поле с
 * подходящим именем, а внутри ссылки на аватар
 * (docs/audit/bot-tokens-in-db.md). Значит, искать надо по содержимому, а не
 * по названиям колонок.
 *
 * ВАЖНО: сами значения НЕ ПЕЧАТАЮТСЯ. Только вид ключа, где найден, сколько
 * раз и обрезанный «отпечаток» — первые несколько знаков префикса, по которым
 * владелец опознает ключ, но воспользоваться им нельзя.
 *
 * Ничего не пишет.
 */
/**
 * Доступ к базе берём ЛЕНИВО и с явной проверкой — по двум причинам.
 *
 * 1. Раньше `process.env.SUPABASE_URL.replace(...)` стоял на уровне модуля.
 *    Без переменной файл падал ещё до `main()` с `Cannot read properties of
 *    undefined (reading 'replace')` — сообщением, по которому непонятно ни
 *    ЧТО не задано, ни ГДЕ это взять. И, что важнее, из-за этого нельзя было
 *    прогнать САМОПРОВЕРКУ шаблонов без доступа к базе: искалка умирала
 *    раньше, чем успевала проверить саму себя.
 * 2. Подстановка пустой строки была бы ещё хуже падения: запрос ушёл бы с
 *    пустым ключом и вернулся 401, а в отчёте это выглядело бы как «в таблице
 *    ничего не найдено» — то есть как хорошая новость.
 */
function requireEnv(name) {
  const v = process.env[name]
  if (!v) {
    console.error(`❌ ${name} не задан — искать в базе нечем.`)
    console.error(`   Взять: railway variables --kv | grep ${name}`)
    console.error(`   либо: infisical secrets get ${name}`)
    console.error(
      '   Пустое значение здесь дало бы 401 и пустой отчёт, который читается'
    )
    console.error('   как «секретов нет». Поэтому останавливаемся сразу.')
    process.exit(1)
  }
  return v
}

let url = null
let H = null

function initDbAccess() {
  url = requireEnv('SUPABASE_URL').replace(/\/$/, '')
  const key = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  H = { apikey: key, Authorization: `Bearer ${key}` }
}

const TABLES = [
  'assets',
  'attachments',
  'avatars',
  'eleven_labs_transcriptions',
  'game',
  'idempotency_keys',
  'instagram_apify_reels',
  'instagram_scrapings',
  'jobs',
  'model_trainings',
  'payments_v2',
  'pending_messages',
  'prompts_history',
  'superhero_generations',
  'synclabs_videos',
  'templates',
  'translations',
  'user_feature_views',
  'users',
]

/**
 * Шаблоны известных ключей. Каждый — с пояснением, чем это опасно, чтобы
 * находка сразу читалась как задача, а не как строка мусора.
 */
/**
 * ⚠️ ГРАНИЦА СЛОВА `\b` ЗДЕСЬ ЛОВУШКА.
 *
 * Первая версия шаблона для токена Telegram была `\b\d{8,10}:…` и находила
 * НОЛЬ — притом что токены в базе точно есть, я их нашёл итерацией раньше.
 * Причина: токен лежит внутри `…/file/bot1111111111:AAH…`, и между `t` и `1`
 * границы слова НЕТ — оба символа словесные.
 *
 * Поймал только потому, что знал правильный ответ заранее. Отсюда проверка
 * `самопроверка` ниже: набор заведомо-положительных строк, на которых шаблоны
 * обязаны срабатывать. Без неё «ничего не найдено» читалось бы как хорошая
 * новость.
 *
 * ⚠️ ЧЕГО ЗДЕСЬ НЕ БЫЛО ВОВСЕ — И ЧТО ДОРОЖЕ ВСЕГО ОСТАЛЬНОГО В СПИСКЕ.
 *
 * До 2026-08-23 не было шаблона под машинную учётку Infisical. Она не «ещё
 * один ключ»: пара `INFISICAL_CLIENT_ID` + `INFISICAL_CLIENT_SECRET`
 * обменивается на токен, которым читаются ВСЕ 50+ секретов проекта разом —
 * включая те токены ботов, ради которых эта искалка и написана. Учётка вполне
 * может лежать в базе тем же путём, каким туда попали токены: внутри URL, в
 * `metadata`, в теле сохранённого запроса.
 */
const PATTERNS = [
  [
    'токен бота Telegram',
    /\d{8,10}:[A-Za-z0-9_-]{30,}/g,
    'полное управление ботом',
  ],
  /**
   * Машинная учётка Infisical. Голые 64 hex БЕЗ имени рядом намеренно НЕ ищем:
   * в базе хранятся хеши и идентификаторы задач, и шаблон на голый hex утопил
   * бы настоящую находку в шуме — а инструмент, завышающий находки,
   * обесценивает и настоящие.
   */
  [
    'машинная учётка Infisical',
    /(?:INFISICAL_CLIENT_SECRET|client[_-]?secret)["'\s]*[=:]["'\s]*[a-f0-9]{64}/gi,
    'доступ ко ВСЕМ 50+ секретам проекта разом',
  ],
  ['ключ xAI', /xai-[A-Za-z0-9_-]{40,}/gi, 'запросы к Grok за ваш счёт'],
  // `i` добавлен там, где его не хватало: формы `R8_…`, `SK_…`, hex заглавными.
  // `ключ AWS` намеренно оставлен БЕЗ `i` — настоящий AKIA всегда заглавный, а
  // `i` превратил бы `[0-9A-Z]{16}` в «любые 16 букв-цифр» и дал бы совпадения
  // внутри обычных base64-строк, которых в базе полно (аватары, вложения).
  ['ключ Replicate', /r8_[A-Za-z0-9]{30,}/gi, 'запуск генераций за ваш счёт'],
  ['ключ OpenAI', /sk-[A-Za-z0-9]{20,}/gi, 'запросы за ваш счёт'],
  ['ключ ElevenLabs', /sk_[a-f0-9]{40,}/gi, 'синтез речи за ваш счёт'],
  ['ключ AWS', /AKIA[0-9A-Z]{16}/g, 'доступ к хранилищу'],
  ['ключ Anthropic', /sk-ant-[A-Za-z0-9_-]{20,}/gi, 'запросы за ваш счёт'],
  ['токен GitHub', /gh[pousr]_[A-Za-z0-9]{30,}/gi, 'доступ к репозиторию'],
  [
    'JWT',
    /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
    'может быть служебным ключом базы',
  ],
  [
    'ключ в параметре запроса',
    /[?&](?:api[_-]?key|token|access[_-]?token|secret|password)=[^&\s"']{8,}/gi,
    'зависит от сервиса',
  ],
  // `i` здесь не косметика: по RFC 7235 схема авторизации регистронезависима,
  // и `bearer <токен>` — совершенно законная форма, которую шаблон без `i`
  // пропускал целиком.
  [
    'заголовок Authorization',
    /Bearer\s+[A-Za-z0-9._-]{20,}/gi,
    'зависит от сервиса',
  ],
]

async function fetchAll(table) {
  const out = []
  let from = 0
  for (;;) {
    const res = await fetch(`${url}/rest/v1/${table}?select=*`, {
      headers: { ...H, Range: `${from}-${from + 999}`, 'Range-Unit': 'items' },
    })
    if (!res.ok) return out
    const rows = await res.json()
    if (!Array.isArray(rows) || !rows.length) break
    out.push(...rows)
    if (rows.length < 1000) break
    from += 1000
    if (from > 40000) break
  }
  return out
}

/** Отпечаток: достаточно, чтобы опознать, недостаточно, чтобы использовать. */
const fingerprint = v => {
  const s = String(v)
  return `${s.slice(0, 8)}…${s.length} знаков`
}

/** Строковые значения внутри объекта любой вложенности. */
function* strings(value, path = '') {
  if (typeof value === 'string') {
    yield [path, value]
    return
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      yield* strings(v, path ? `${path}.${k}` : k)
    }
  }
}

/**
 * САМОПРОВЕРКА. Заведомо-положительные строки, на которых шаблоны ОБЯЗАНЫ
 * срабатывать. Если хоть один не сработал — искалка сломана, и «ничего не
 * найдено» ничего не значит.
 *
 * ⚠️ ВСЕ ЗНАЧЕНИЯ НИЖЕ ВЫДУМАНЫ И ДОЛЖНЫ ОСТАВАТЬСЯ ВЫДУМАННЫМИ.
 * Шаблоны смотрят только на ФОРМУ, поэтому настоящее значение здесь ничего не
 * добавляет к проверке, зато утекает вместе с репозиторием. Раньше в номере
 * бота стоял идентификатор действующего бота (секретная половина и тогда была
 * выдумана) — заменён на 1111111111. Если правите образец, держите ту же длину
 * и ту же форму, иначе шаблон перестанет совпадать и самопроверка начнёт врать.
 *
 * ⚠️ ПОМЕТКА `secret-guard-ok` СТАВИТСЯ НА ТУ ЖЕ ФИЗИЧЕСКУЮ СТРОКУ, ЧТО И
 * ЗНАЧЕНИЕ. `scripts/security-token-guard.sh` фильтрует вывод `grep -n` и
 * снимает совпадение ТОЛЬКО если пометка в той же строке; обещание «на той же
 * или предыдущей» в его шапке кодом не подкреплено. Пометка стояла на строке
 * `],`, куда её отодвинул prettier с `printWidth: 80`, и не работала.
 */
const SELF_CHECK = [
  [
    'токен бота Telegram',
    'https://api.telegram.org/file/bot1111111111:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/p/f.jpg', // secret-guard-ok: выдуманный образец самопроверки  // telegram-api-root-ok  cyrillic-ok
  ],
  /**
   * Кириллическое «Токен:». ОТДЕЛЬНОГО ШАБЛОНА ЗДЕСЬ НАМЕРЕННО НЕТ, и это не
   * упущение: шаблон токена в этой искалке — голый `\d{8,10}:…` БЕЗ требования
   * ASCII-приставки `bot`/`token`, поэтому русскую приставку он ловит и так.
   * Второй шаблон той же формы дал бы каждой находке по две строки в отчёте —
   * ровно то завышение, которое обесценивает настоящие находки.
   *
   * Но «ловит и так» — это утверждение, а не факт, пока его не проверили.
   * Образец ниже привязан к СУЩЕСТВУЮЩЕМУ шаблону и делает утверждение фактом.
   * В двух других искалках (история и тест) шаблон требует ASCII-приставку,
   * и там отдельное правило действительно понадобилось.
   */
  [
    'токен бота Telegram',
    '- ✅ Токен: `1111111111:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`', // secret-guard-ok: выдуманный образец самопроверки
  ],
  [
    'ключ Replicate',
    'token=r8_abcdefghijklmnopqrstuvwxyz0123456789A', // secret-guard-ok: выдуманный образец самопроверки
  ],
  [
    'ключ OpenAI',
    'sk-abcdefghijklmnopqrstuvwxyz0123', // secret-guard-ok: выдуманный образец самопроверки
  ],
  [
    'ключ Anthropic',
    'sk-ant-abcdefghijklmnopqrstuvwxyz0123', // secret-guard-ok: выдуманный образец самопроверки
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
    'JWT',
    'eyJxxxxxxxxxx.eyJxxxxxxxxxx.xxxxxxxxxx', // secret-guard-ok: выдуманный образец самопроверки
  ],
  [
    'ключ в параметре запроса',
    'https://x.test/a?api_key=supersecretvalue123', // secret-guard-ok: выдуманный образец самопроверки
  ],
  [
    'заголовок Authorization',
    'authorization: bearer xxxxxxxxxxxxxxxxxxxxxxxx', // secret-guard-ok: строчный `bearer` — проверка регистронезависимости
  ],
  [
    'машинная учётка Infisical',
    '{"clientSecret":"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"}', // secret-guard-ok: выдуманные 64 hex по порядку, не значение
  ],
  [
    'ключ xAI',
    'XAI_API_KEY=xai-abcdefghijklmnopqrstuvwxyz0123456789ABCD', // secret-guard-ok: выдуманный образец самопроверки
  ],
]

/**
 * ⚠️ ОБРАТНАЯ СТОРОНА САМОПРОВЕРКИ, БЕЗ КОТОРОЙ ОНА ПОЛОВИНЧАТА.
 *
 * `SELF_CHECK` доказывает, что шаблон СРАБАТЫВАЕТ. Он не доказывает, что тот
 * отличает секрет от не-секрета: шаблон `/./` прошёл бы `SELF_CHECK` целиком и
 * при этом пометил бы каждую строку каждой таблицы. Отчёт, где «найдено» стоит
 * везде, читается ровно так же, как отчёт, где не стоит нигде.
 *
 * Здесь строки, на которых НИ ОДИН шаблон срабатывать НЕ ДОЛЖЕН.
 */
const NEGATIVE_CHECK = [
  'https://t.me/some_bot?start=welcome',
  'Токен хранится в Infisical, в базе его нет',
  '{"clientSecret":"${INFISICAL_CLIENT_SECRET}"}',
  'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  'https://api.x.ai/v1/chat/completions',
  'https://x.test/a?api_key=', // пустое значение — не секрет, а пустая настройка
  'model_id=eleven_multilingual_v2&output_format=mp3_44100_128',
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

  // 2. Обратная сторона: на заведомо чистой строке не срабатывает НИКТО.
  for (const clean of NEGATIVE_CHECK) {
    for (const [name, re] of PATTERNS) {
      re.lastIndex = 0
      if (re.test(clean)) {
        broken.push(`${name}: ЛОЖНОЕ срабатывание на «${clean.slice(0, 50)}…»`)
      }
    }
  }

  // 3. Шаблон без образца ничем не лучше отсутствующего: никто не знает,
  //    работает ли он вообще.
  for (const [name] of PATTERNS) {
    if (!SELF_CHECK.some(([n]) => n === name)) {
      broken.push(`${name}: шаблон есть, а образца самопроверки нет`)
    }
  }

  return broken
}

async function main() {
  const broken = selfCheck()
  if (broken.length) {
    console.error('❌ САМОПРОВЕРКА НЕ ПРОШЛА — искалке верить нельзя:')
    for (const b of broken) console.error('   ', b)
    process.exit(2)
  }
  console.log(
    `самопроверка пройдена: ${SELF_CHECK.length} образцов должны ловиться, ` +
      `${NEGATIVE_CHECK.length} чистых строк — не должны, ` +
      `у всех ${PATTERNS.length} шаблонов есть образец\n`
  )

  // Самопроверка идёт ПЕРЕД доступом к базе: `--self-check` даёт прогнать
  // шаблоны без учётных данных, а значит — в CI и на машине без прод-доступа.
  if (process.argv.includes('--self-check')) {
    console.log('режим --self-check: база не опрашивалась.')
    return
  }

  initDbAccess()

  // вид -> место -> { count, samples:Set }
  const found = new Map()

  for (const table of TABLES) {
    const rows = await fetchAll(table)
    if (!rows.length) continue
    for (const r of rows) {
      for (const [col, val] of Object.entries(r)) {
        // Метаданные хранятся объектом — туда тоже смотрим.
        for (const [sub, s] of strings(val, col)) {
          for (const [name, re, why] of PATTERNS) {
            re.lastIndex = 0
            const m = s.match(re)
            if (!m) continue
            const place = `${table}.${sub}`
            if (!found.has(name)) found.set(name, { why, places: new Map() })
            const entry = found.get(name)
            if (!entry.places.has(place))
              entry.places.set(place, { count: 0, prints: new Set() })
            const p = entry.places.get(place)
            p.count += m.length
            for (const hit of m) p.prints.add(fingerprint(hit))
          }
        }
      }
    }
  }

  if (!found.size) {
    console.log('Секретов известного вида в базе не найдено.')
    return
  }

  console.log(`=== НАЙДЕНО ВИДОВ СЕКРЕТОВ: ${found.size} ===`)
  console.log('   (сами значения не печатаются — только отпечатки)\n')

  for (const [name, { why, places }] of found) {
    const total = [...places.values()].reduce((s, p) => s + p.count, 0)
    const uniq = new Set([...places.values()].flatMap(p => [...p.prints])).size
    console.log(`  ${name} — ${why}`)
    console.log(`      вхождений ${total}, разных значений ${uniq}`)
    for (const [place, p] of places) {
      console.log(
        `      ${place}: ${p.count}  ${[...p.prints].slice(0, 3).join(', ')}${p.prints.size > 3 ? ` +${p.prints.size - 3}` : ''}`
      )
    }
    console.log('')
  }
}

main().catch(e => {
  console.error('ERR', e.message)
  process.exit(1)
})
