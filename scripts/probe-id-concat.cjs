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

const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

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

const hits = []

for (const f of files) {
  if (f.includes('__tests__') || f.includes('/test/')) continue
  const lines = strip(fs.readFileSync(f, 'utf8')).split('\n')

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
      new RegExp(`\\b(?:const|let|var)?\\s*${n}\\s*=\\s*[^\n]*` + FOREIGN.source).test(above)
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
    if (/(reply|sendMessage|caption|logger\.|console\.|throw new Error)/.test(line)) continue

    hits.push({ file: f, line: i + 1, text: line.trim().slice(0, 100) })
  }
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
  for (const h of list) console.log(`      :${String(h.line).padStart(4)}  ${h.text}`)
}
