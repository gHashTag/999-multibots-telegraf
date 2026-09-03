#!/usr/bin/env node
/**
 * READ-ONLY. Ищет места, где идентификатор СОБИРАЕТСЯ из чужого ответа.
 *
 * Повод: ссылка на обученную модель складывалась как
 *   `${username}/${modelName}:${output.version}`
 * а `output.version` от Replicate уже содержал `owner/slug:hash`. Получалась
 * склейка вида `owner/Anneya:owner/anneya-1773…:hash` — путь, которого нет.
 * Старые записи были исправны: раньше поставщик присылал голый хеш, потом
 * формат ответа изменился, а формула осталась (docs/audit/model-weights.md).
 *
 * Признак опасной склейки: в шаблон подставляется значение ИЗ ОТВЕТА (response,
 * result, output, data, event…), и рядом в том же шаблоне стоит разделитель
 * `/` или `:`, который это значение может уже содержать.
 *
 * Инструмент не доказывает дефект — он сужает круг чтения.
 *
 * Ничего не пишет и никуда не ходит.
 */
const fs = require('fs')
const path = require('path')

const strip = s =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const files = []
;(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p)
    else if (p.endsWith('.ts')) files.push(p)
  }
})('src')

// Значения, которые приходят снаружи. Имя переменной — грубый, но рабочий
// признак: своё обычно называют иначе.
const FOREIGN =
  /\b(response|result|output|payload|apiData|data|event|eventData|training|prediction|body|json)\b\s*[.?]/

/**
 * The matcher, callable on a sample.
 *
 * It was inline in the file loop, which meant it could not be pointed at a
 * known case -- and a finder that cannot be pointed at a known case reports
 * "nothing found" identically whether the code is clean or the matcher is
 * broken. Extracted only so the control below can run it; the logic is
 * unchanged.
 */
function scanText(text) {
  const found = []
  const lines = strip(text).split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Шаблонная строка с подстановкой и разделителем.
    const tpl = line.match(/`[^`]*\$\{[^}]+\}[^`]*`/)
    if (!tpl) continue
    const t = tpl[0]
    if (!/[:/]/.test(t.replace(/\$\{[^}]*\}/g, ''))) continue
    // ПРОСЛЕЖИВАЕМ ОДИН ШАГ НАЗАД.
    //
    // Без этого инструмент НЕ ПОЙМАЛ БЫ тот самый дефект, ради которого сделан:
    //   const versionHash = eventData.output.version   // строкой выше
    //   modelUrl = `${username}/${name}:${versionHash}` // а здесь уже своя
    // В самом шаблоне слова из ответа нет — оно осталось в предыдущей строке.
    //
    // Поэтому: берём имена, подставляемые в шаблон, и смотрим, не присвоено ли
    // какое-то из них из чужого ответа в пределах 20 строк выше.
    const names = [...t.matchAll(/\$\{\s*([A-Za-z_$][\w$]*)/g)].map(m => m[1])
    const above = lines.slice(Math.max(0, i - 20), i).join('\n')
    const fromForeignVar = names.some(n =>
      new RegExp(
        `\\b(?:const|let|var)?\\s*${n}\\s*=\\s*[^\n]*` + FOREIGN.source
      ).test(above)
    )
    if (!FOREIGN.test(t) && !fromForeignVar) continue
    // Ссылки на наш собственный сервер уже разобраны отдельно.
    if (/^https?:\/\//.test(t.replace(/^`/, ''))) continue

    // Сообщения об ошибках вида `HTTP ${response.status}` безобидны: результат
    // никуда не подставляется как адрес. Опасно, когда склейка становится
    // ИДЕНТИФИКАТОРОМ — по имени того, куда её кладут.
    const ident =
      /\b([a-zA-Z_]*(?:url|Url|URL|id|Id|ID|key|Key|path|Path|ref|Ref|slug|Slug|destination|Destination|model|Model|bucket|Bucket)[a-zA-Z_]*)\s*[:=]\s*`/.test(
        line
      ) ||
      /\.(eq|match|upload|from|getPublicUrl)\(\s*`/.test(line) ||
      /return\s+`/.test(line)
    if (!ident) continue
    // Явные сообщения человеку — не идентификаторы.
    if (
      /(reply|sendMessage|caption|logger\.|console\.|throw new Error)/.test(
        line
      )
    )
      continue

    found.push({ line: i + 1, text: line.trim().slice(0, 100) })
  }
  return found
}

/**
 * POSITIVE CONTROL: the very defect this probe was built for, from its own
 * docblock -- the model link that came out as owner/name:owner/slug:hash
 * because the value was already a full reference. The foreign value is
 * assigned a line earlier, so this also exercises the one-step-back lookup.
 *
 * NEGATIVE CONTROL: the same shape without a foreign value, plus the harmless
 * error-message case the probe deliberately excludes. Without this half the
 * control would pass for a matcher that simply says yes to everything.
 */
const POSITIVE = [
  'const versionHash = eventData.output.version',
  'const modelUrl = `${username}/${name}:${versionHash}`',
].join('\n')

const NEGATIVE = [
  // No foreign value at all.
  'const label = `${prefix}/${suffix}`',
  // Foreign value, but a message to a human rather than an identifier.
  'logger.info(`HTTP ${response.status}`)',
  // Foreign value in a template with a separator, and NOT a logger line: this
  // one is rejected ONLY by the identifier test. The first two are rejected
  // earlier, so without this line the negative control would pass even with
  // that test deleted -- which is exactly what mutation showed.
  'const message = `${response.data}/${suffix}`',
].join('\n')

const pos = scanText(POSITIVE)
const neg = scanText(NEGATIVE)
if (pos.length === 0) {
  console.error(
    'самопроверка не прошла: заведомо-опасная склейка НЕ найдена.\n' +
      '«ничего не найдено» ниже означало бы сломанный матчер, а не чистый код.'
  )
  process.exit(2)
}
if (neg.length !== 0) {
  console.error(
    'самопроверка не прошла: матчер сработал на заведомо-безобидном образце.\n' +
      'он говорит «да» слишком широко, и список ниже нельзя читать как находки.'
  )
  process.exit(2)
}
console.log('самопроверка: опасный образец найден, безобидный отвергнут')

const hits = []
for (const f of files) {
  if (f.includes('__tests__') || f.includes('/test/')) continue
  for (const h of scanText(fs.readFileSync(f, 'utf8')))
    hits.push({ file: f, ...h })
}

console.log(`просмотрено файлов: ${files.length}`)
console.log(`\n=== СКЛЕЙКИ ИЗ ЧУЖОГО ОТВЕТА: ${hits.length} ===`)
console.log('   (список для чтения глазами, не доказательство)\n')

const byFile = new Map()
for (const h of hits) {
  if (!byFile.has(h.file)) byFile.set(h.file, [])
  byFile.get(h.file).push(h)
}

for (const [file, list] of [...byFile.entries()].sort()) {
  console.log(`  ${file}`)
  for (const h of list)
    console.log(`      :${String(h.line).padStart(4)}  ${h.text}`)
}
