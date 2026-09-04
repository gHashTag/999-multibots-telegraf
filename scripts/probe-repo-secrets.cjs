#!/usr/bin/env node
/**
 * WHAT WOULD THE SECRET GUARD SAY ABOUT EVERYTHING ALREADY IN THE TREE?
 *
 * The guard runs on STAGED DIFFS. That is the right place to stop a new leak,
 * and the wrong place to find an old one: a rule added today has no opinion
 * about a line committed last year, because that line is never staged again.
 *
 * The gap is not hypothetical. Last iteration a rule for passwords embedded in
 * connection strings was added after a live one was found -- and the two OTHER
 * files carrying the same shape were found by a hand-typed grep, not by the
 * guard and not by any tool. That is the population this probe exists to name.
 *
 * It reads the guard's OWN pattern table and runs it through the SAME engine
 * (grep -nEi -e), so the two cannot drift: a rule the guard enforces is a rule
 * this reports, with identical matching semantics. Restating the patterns here
 * would create a twin, and drifting twins are the defect this repo keeps
 * turning up.
 *
 * Findings are a READING QUEUE. An example file, a test container account and
 * a documented placeholder all match legitimately; the point is that nobody
 * has ever been shown the list.
 */

const fs = require('fs')
const path = require('path')
const { execFileSync, spawnSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const GUARD = path.join(ROOT, 'scripts/security-token-guard.sh')

/**
 * The guard's labels and patterns, parsed from the guard itself.
 * Both arrays are positional: LABELS[i] describes PATTERNS[i].
 */
function readGuardRules() {
  const src = fs.readFileSync(GUARD, 'utf8')
  const arrayBody = name => {
    const m = src.match(new RegExp(`declare -a ${name}=\\(([\\s\\S]*?)\\n\\)`))
    if (!m) return null
    return m[1]
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'))
  }
  const labelLines = arrayBody('LABELS') || arrayBody('NAMES')
  const patternLines = arrayBody('PATTERNS')
  if (!patternLines) return null

  const unquote = l => {
    // Shell single-quoted, with '"'"' standing for an embedded quote.
    if (l.startsWith("'") && l.endsWith("'")) {
      return l.slice(1, -1).split(`'"'"'`).join("'")
    }
    if (l.startsWith('"') && l.endsWith('"')) return l.slice(1, -1)
    return null
  }
  const patterns = patternLines.map(unquote).filter(p => p !== null)
  const labels = (labelLines || []).map(unquote).filter(p => p !== null)
  return { patterns, labels }
}

/** grep, exactly as the guard invokes it. */
function grepFiles(pattern, files) {
  const r = spawnSync(
    'grep',
    ['-nEi', '-e', pattern, '--binary-files=without-match', '--', ...files],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  )
  // grep: 0 = matched, 1 = no match, 2 = error. Only 2 is a broken run, and it
  // must not be read as "clean" -- that is how a silent tool reports safety.
  if (r.status === 2) {
    console.error(`самопроверка не прошла: grep отказал на шаблоне ${pattern}`)
    console.error((r.stderr || '').slice(0, 300))
    process.exit(2)
  }
  if (r.status === 1) return []
  return (r.stdout || '').split('\n').filter(Boolean)
}

/**
 * A hit is not yet a secret. The guard's broad rule ends with
 * [A-Za-z0-9_/+=-]{16,}, and an ordinary identifier satisfies that, so
 * `TOKEN: telegramBotTokenValue` matches like a real key. secret-guard-ok:
 * an example identifier -- this comment tripped the rule it documents.
 *
 * That is correct FOR THE GUARD -- on a new line, noisy beats silent. It is
 * wrong for an audit of 3427 committed files, where a queue nobody can read is
 * a queue nobody reads. So hits are split by what stands on the right-hand
 * side: a reference to a variable cannot itself be the secret, a quoted
 * literal can.
 */
function classifyHit(line) {
  const body = line.replace(/^[^:]*:\d+:/, '')
  const m = body.match(
    /(?:SECRET|TOKEN|API_KEY|PASSWORD|SERVICE_KEY|SERVICE_ROLE_KEY|CLIENT_SECRET)[A-Za-z_]*\s*[=:]\s*(.*)$/i
  )
  if (!m) return 'иное'
  const tail = m[1].trim()

  // Reads a value from somewhere else: the file holds a name, not a secret.
  if (
    /^(?:process\.env|Deno\.env|env|config|process|import\.meta)\b/.test(tail)
  )
    return 'ссылка на переменную'
  // A bare identifier, a property access or a call.
  if (
    /^[A-Za-z_$][A-Za-z0-9_$]*\s*[.(,;)]?/.test(tail) &&
    !/^["\'`]/.test(tail)
  )
    return 'ссылка на переменную'

  const quoted = tail.match(/^["\'`]([^"\'`]*)/)
  if (!quoted) return 'иное'
  const value = quoted[1]
  // Placeholders announce themselves.
  if (
    /^(your|my|xxx+|test|example|placeholder|change|dummy|fake|<|\$\{)/i.test(
      value
    ) ||
    // An env-var NAME in quotes is not a secret: `tokenEnvVar: 'BOT_TOKEN_9'`
    // names where the token lives. The first spelling here missed it by
    // requiring letters only, and six of twelve candidates were this.
    /^[A-Z][A-Z0-9_]*$/.test(value) ||
    /^(A|B|X|0|1)\1{8,}/.test(value)
  )
    return 'заглушка'
  return 'ЛИТЕРАЛ'
}

function selfCheck() {
  const rules = readGuardRules()
  if (!rules) {
    console.error(
      'самопроверка не прошла: таблица шаблонов гварда не разобрана -- ' +
        'скорее всего изменилась форма объявления в security-token-guard.sh.'
    )
    process.exit(2)
  }
  if (rules.patterns.length < 5) {
    console.error(
      `самопроверка не прошла: разобрано всего ${rules.patterns.length} шаблонов`
    )
    process.exit(2)
  }

  // The engine, end to end. A sample built at runtime so this file does not
  // itself carry a literal that the sweep below would then report.
  const sample = ['postgresql://u', 'notarealpw123@h.example.com/db'].join(':')
  const hit = rules.patterns.some(p => {
    const r = spawnSync('grep', ['-qEi', '-e', p], { input: sample })
    return r.status === 0
  })
  if (!hit) {
    console.error(
      'самопроверка не прошла: ни один шаблон гварда не узнал заведомый образец'
    )
    process.exit(2)
  }

  const innocent = 'const api = "https://api.example.com/v1/generate"'
  const falseAlarm = rules.patterns.filter(p => {
    const r = spawnSync('grep', ['-qEi', '-e', p], { input: innocent })
    return r.status === 0
  })
  if (falseAlarm.length) {
    console.error(
      `самопроверка не прошла: обычный URL поднял тревогу по ${falseAlarm.length} шаблону(ам)`
    )
    process.exit(2)
  }

  console.log(
    `самопроверка: ${rules.patterns.length} шаблонов гварда прочитаны и проверены в обе стороны`
  )
  return rules
}

// Exported before anything runs, so a test can exercise these functions
// without the sweep -- and without the self-check printing into its output.
module.exports = { readGuardRules, grepFiles, classifyHit, selfCheck }

if (require.main !== module) return

const rules = selfCheck()

const files = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
  .filter(f => fs.existsSync(path.join(ROOT, f)))

console.log(`отслеживаемых файлов: ${files.length}`)

// Chunked: the whole file list overflows the argument limit.
const CHUNK = 400
const byLabel = new Map()
for (let i = 0; i < rules.patterns.length; i++) {
  const label = rules.labels[i] || `шаблон ${i + 1}`
  const lines = []
  for (let j = 0; j < files.length; j += CHUNK) {
    lines.push(...grepFiles(rules.patterns[i], files.slice(j, j + CHUNK)))
  }
  // The guard's own escape hatch, honoured here too.
  const kept = lines.filter(l => !l.includes('secret-guard-ok'))
  if (kept.length) byLabel.set(label, kept)
}

const total = [...byLabel.values()].reduce((n, v) => n + v.length, 0)
console.log(`совпадений по правилам гварда во ВСЁМ дереве: ${total}\n`)

for (const [label, lines] of byLabel) {
  const seen = new Set()
  const buckets = new Map()
  for (const l of lines) {
    // path:line:content -- the content is the secret, so only the address.
    const [file, lineNo] = l.split(':')
    const key = `${file}:${lineNo}`
    if (seen.has(key)) continue
    seen.add(key)
    const kind = classifyHit(l)
    if (!buckets.has(kind)) buckets.set(kind, [])
    buckets.get(kind).push(key)
  }
  console.log(`=== ${label.toUpperCase()}: ${seen.size} ===`)
  // Literals first: they are the only bucket where the file itself can hold
  // the secret. The rest is printed as a count, not a list.
  for (const kind of ['ЛИТЕРАЛ', 'иное', 'заглушка', 'ссылка на переменную']) {
    const rows = buckets.get(kind)
    if (!rows) continue
    if (kind === 'ЛИТЕРАЛ' || kind === 'иное') {
      console.log(`  -- ${kind}: ${rows.length}`)
      for (const r of rows) console.log(`     ${r}`)
    } else {
      console.log(
        `  -- ${kind}: ${rows.length} (не печатаю: значение не здесь)`
      )
    }
  }
  console.log('')
}

if (total === 0) {
  console.log(
    'ни одного совпадения -- проверьте самопроверку выше, прежде чем радоваться.'
  )
}
