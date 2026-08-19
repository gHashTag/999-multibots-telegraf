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
const url = process.env.SUPABASE_URL.replace(/\/$/, '')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: key, Authorization: `Bearer ${key}` }

const TABLES = [
  'assets', 'attachments', 'avatars', 'eleven_labs_transcriptions', 'game',
  'idempotency_keys', 'instagram_apify_reels', 'instagram_scrapings', 'jobs',
  'model_trainings', 'payments_v2', 'pending_messages', 'prompts_history',
  'superhero_generations', 'synclabs_videos', 'templates', 'translations',
  'user_feature_views', 'users',
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
 * Причина: токен лежит внутри `…/file/bot7137641587:AAH…`, и между `t` и `7`
 * границы слова НЕТ — оба символа словесные.
 *
 * Поймал только потому, что знал правильный ответ заранее. Отсюда проверка
 * `самопроверка` ниже: набор заведомо-положительных строк, на которых шаблоны
 * обязаны срабатывать. Без неё «ничего не найдено» читалось бы как хорошая
 * новость.
 */
const PATTERNS = [
  ['токен бота Telegram', /\d{8,10}:[A-Za-z0-9_-]{30,}/g, 'полное управление ботом'],
  ['ключ Replicate', /r8_[A-Za-z0-9]{30,}/g, 'запуск генераций за ваш счёт'],
  ['ключ OpenAI', /sk-[A-Za-z0-9]{20,}/g, 'запросы за ваш счёт'],
  ['ключ ElevenLabs', /sk_[a-f0-9]{40,}/g, 'синтез речи за ваш счёт'],
  ['ключ AWS', /AKIA[0-9A-Z]{16}/g, 'доступ к хранилищу'],
  ['ключ Anthropic', /sk-ant-[A-Za-z0-9_-]{20,}/g, 'запросы за ваш счёт'],
  ['токен GitHub', /gh[pousr]_[A-Za-z0-9]{30,}/g, 'доступ к репозиторию'],
  ['JWT', /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, 'может быть служебным ключом базы'],
  ['ключ в параметре запроса', /[?&](?:api[_-]?key|token|access[_-]?token|secret|password)=[^&\s"']{8,}/gi, 'зависит от сервиса'],
  ['заголовок Authorization', /Bearer\s+[A-Za-z0-9._-]{20,}/g, 'зависит от сервиса'],
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
 */
const SELF_CHECK = [
  ['токен бота Telegram', 'https://api.telegram.org/file/bot7137641587:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/p/f.jpg'],
  ['ключ Replicate', 'token=r8_abcdefghijklmnopqrstuvwxyz0123456789A'],
  ['ключ OpenAI', 'sk-abcdefghijklmnopqrstuvwxyz0123'],
  ['ключ AWS', 'AKIAIOSFODNN7EXAMPLE'],
  ['токен GitHub', 'ghp_abcdefghijklmnopqrstuvwxyz0123456789'],
  ['ключ в параметре запроса', 'https://x.test/a?api_key=supersecretvalue123'],
]

function selfCheck() {
  const broken = []
  for (const [name, sample] of SELF_CHECK) {
    const rule = PATTERNS.find(p => p[0] === name)
    if (!rule) {
      broken.push(`${name}: шаблона нет`)
      continue
    }
    rule[1].lastIndex = 0
    if (!sample.match(rule[1])) broken.push(`${name}: не сработал на образце`)
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
  console.log(`самопроверка пройдена: ${SELF_CHECK.length} образцов\n`)

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
            if (!entry.places.has(place)) entry.places.set(place, { count: 0, prints: new Set() })
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
      console.log(`      ${place}: ${p.count}  ${[...p.prints].slice(0, 3).join(', ')}${p.prints.size > 3 ? ` +${p.prints.size - 3}` : ''}`)
    }
    console.log('')
  }
}

main().catch(e => {
  console.error('ERR', e.message)
  process.exit(1)
})
