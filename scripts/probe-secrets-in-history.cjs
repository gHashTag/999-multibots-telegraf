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
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const PATTERNS = [
  ['токен бота Telegram', /(?:bot|token[=:"'\s]+)(\d{8,10}:[A-Za-z0-9_-]{30,})/g, 'полное управление ботом'],
  ['ключ Replicate', /r8_[A-Za-z0-9]{35,}/g, 'генерации за ваш счёт'],
  ['ключ OpenAI', /sk-[A-Za-z0-9]{32,}/g, 'запросы за ваш счёт'],
  ['ключ Anthropic', /sk-ant-[A-Za-z0-9_-]{30,}/g, 'запросы за ваш счёт'],
  ['ключ ElevenLabs', /sk_[a-f0-9]{40,}/g, 'синтез речи за ваш счёт'],
  ['ключ AWS', /AKIA[0-9A-Z]{16}/g, 'доступ к хранилищу'],
  ['токен GitHub', /gh[pousr]_[A-Za-z0-9]{30,}/g, 'доступ к репозиторию'],
  ['служебный ключ Supabase', /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{20,}/g, 'полный доступ к базе'],
  ['токен Fly.io', /fm2_[A-Za-z0-9+/=]{40,}/g, 'управление развёртыванием'],
]

/** Образцы, на которых шаблоны ОБЯЗАНЫ срабатывать. */
const SELF_CHECK = [
  ['токен бота Telegram', 'https://api.telegram.org/file/bot7137641587:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/p.jpg'],
  ['ключ Replicate', 'REPLICATE_API_TOKEN=r8_abcdefghijklmnopqrstuvwxyz0123456789ABCD'],
  ['ключ OpenAI', 'sk-abcdefghijklmnopqrstuvwxyz0123456789AB'],
  ['ключ AWS', 'AKIAIOSFODNN7EXAMPLE'],
  ['токен GitHub', 'ghp_abcdefghijklmnopqrstuvwxyz0123456789'],
  ['токен Fly.io', 'FLY_API_TOKEN=fm2_lJPECAAAAAAAERO3xBBOw6Ug8TSQzgFqM5JlingBwrVodHRwczovL2FwaS5m'],
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
  console.log(`самопроверка пройдена: ${SELF_CHECK.length} образцов`)

  // --- 1. Файлы в рабочем дереве, ОТСЛЕЖИВАЕМЫЕ git ---------------------
  const tracked = execSync('git ls-files', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n')
    .filter(Boolean)
  const inFiles = new Map()
  for (const f of tracked) {
    if (!fs.existsSync(f)) continue
    const st = fs.statSync(f)
    if (!st.isFile() || st.size > 2 * 1024 * 1024) continue
    let text
    try {
      text = fs.readFileSync(f, 'utf8')
    } catch {
      continue
    }
    scanText(text, f, inFiles)
  }
  report('СЕКРЕТЫ В ОТСЛЕЖИВАЕМЫХ ФАЙЛАХ (текущее состояние)', inFiles)

  // --- 2. История коммитов ----------------------------------------------
  const inHistory = new Map()
  const commits = execSync('git rev-list --all --max-count=800', { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
  console.log(`\nпросматриваю коммитов: ${commits.length}`)
  for (const c of commits) {
    let diff
    try {
      diff = execSync(`git show --format= --unified=0 ${c}`, {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      })
    } catch {
      continue
    }
    // Только добавленные строки — удалённые уже не в файлах, но всё равно в
    // истории; их ловит тот же diff со знаком минус, поэтому берём обе.
    scanText(diff, c.slice(0, 10), inHistory)
  }
  report('СЕКРЕТЫ В ИСТОРИИ КОММИТОВ', inHistory)

  // --- 3. Код, который пишет секреты в лог ------------------------------
  const logging = []
  const srcFiles = tracked.filter(f => f.startsWith('src/') && f.endsWith('.ts'))
  const SECRETISH = /(token|apiKey|api_key|secret|password|SERVICE_ROLE|credential)/i
  for (const f of srcFiles) {
    if (!fs.existsSync(f)) continue
    const lines = fs.readFileSync(f, 'utf8').split('\n')
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]
      if (!/(logger\.(info|warn|error|debug)|console\.(log|error|warn))/.test(l)) continue
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
        /(!!|\.length|Boolean\(|\?\s*'есть'|substring|slice\(|\bmask|\*\*\*)/.test(l) ||
        /(не найден|not set|not found|отсутств|skipping|загружен|exists|check in ENV|totalSecrets)/i.test(l)
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
