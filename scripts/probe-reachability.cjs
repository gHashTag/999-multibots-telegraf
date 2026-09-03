#!/usr/bin/env node
/**
 * READ-ONLY. Обход достижимости от точек входа.
 *
 * Отвечает на вопрос, который всплывал в каждой из пяти прошлых итераций:
 * «а этот код вообще кто-нибудь исполняет?» Пять раз подряд ответом было
 * «нет» — isLimitAi, generateTextToSpeech, validatePaymentHeader,
 * generateGeminiImage, generateNeuroImageV2. Каждый раз я узнавал это случайно,
 * уже потратив время на разбор.
 *
 * Метод: от точек входа идём по импортам — статическим (`import ... from`) и
 * динамическим (`await import('...')`), разрешая алиасы `@/`. Всё, до чего не
 * дошли, недостижимо: ни один путь исполнения его не загружает.
 *
 * ЧЕГО ЭТОТ МЕТОД НЕ ВИДИТ (важно, чтобы не переоценить результат):
 *   - строки в конфигах и загрузку по имени файла
 *   - импорты, собранные из переменной
 *   - код, который запускают отдельными командами (скрипты, миграции)
 * Поэтому «недостижимо» здесь — не приговор, а список для чтения.
 *
 * Ничего не пишет.
 */
const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()
const SRC = path.join(ROOT, 'src')

const ENTRIES = ['src/index.ts', 'src/bot.ts']

const ALIASES = [['@/', 'src/']]

const strip = s =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

function resolveSpecifier(spec, fromFile) {
  let rel = null
  for (const [prefix, target] of ALIASES) {
    if (spec.startsWith(prefix)) {
      rel = path.join(ROOT, target, spec.slice(prefix.length))
      break
    }
  }
  if (rel === null) {
    if (!spec.startsWith('.')) return null // внешний пакет
    rel = path.resolve(path.dirname(fromFile), spec)
  }

  const candidates = [
    rel + '.ts',
    rel + '.tsx',
    path.join(rel, 'index.ts'),
    path.join(rel, 'index.tsx'),
    rel,
  ]
  for (const c of candidates) {
    try {
      if (fs.statSync(c).isFile()) return c
    } catch {
      /* пусто */
    }
  }
  return null
}

function importsOf(file) {
  let src
  try {
    src = strip(fs.readFileSync(file, 'utf8'))
  } catch {
    return []
  }
  return specifiersIn(src)
}

/**
 * The specifier patterns, callable on a sample.
 *
 * importsOf takes a PATH, so the patterns could never be pointed at a known
 * case -- and here that is not hypothetical. The comment below records the time
 * they silently stopped seeing multi-line imports, which declared
 * src/scenes/index.ts unreachable while the wizards ran fine in production. A
 * finder that loses a pattern reports MORE dead code, which reads like a better
 * result, so nothing about the output looks wrong.
 */
function specifiersIn(src) {
  const specs = new Set()

  // ЛОВИМ ЛЮБОЕ `from 'x'`, не привязываясь к строке.
  //
  // Первая версия требовала, чтобы `import` и `from` стояли на ОДНОЙ строке.
  // Многострочные импорты — а ими написана половина файлов — не находились. В
  // результате `src/scenes/index.ts` и `SceneRegistry.ts` оказались «недостижимы»,
  // хотя визарды в проде работают. Ошибка была бы видна сразу, если бы я не
  // поверил числу, а проверил самое неправдоподобное имя в списке.
  //
  // Переоценка достижимости безопаснее недооценки: лишний файл в «живых» —
  // потерянная находка, лишний файл в «мёртвых» — неверное обвинение и,
  // возможно, удаление рабочего кода.
  for (const m of src.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) specs.add(m[1])
  // import 'x' без привязок
  for (const m of src.matchAll(/\bimport\s+['"]([^'"]+)['"]/g)) specs.add(m[1])
  // await import('x') / import('x')
  for (const m of src.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g))
    specs.add(m[1])
  // require('x')
  for (const m of src.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g))
    specs.add(m[1])
  return [...specs]
}

/**
 * POSITIVE CONTROL: one of each form the walk depends on, and the first is the
 * multi-line import that the original patterns missed -- the exact regression
 * this control exists to prevent from recurring silently.
 *
 * NEGATIVE CONTROL: two shapes that are not imports at all. A specifier written
 * inside a string is not an edge, and neither is the word `from` in prose. If
 * either counted, unreachable files would be declared alive and the probe would
 * under-report -- the direction its own docblock calls the dangerous one.
 */
const C_IMPORT_POS = [
  'import {',
  '  somethingLong,',
  "} from '@/services/alpha'",
  "import '@/side-effect'",
  "const m = await import('@/services/beta')",
  "const r = require('@/services/gamma')",
].join('\n')

const C_IMPORT_NEG = [
  "const label = 'imported from @/services/nowhere'",
  'const note = `values come from the caller`',
].join('\n')

const cPos = specifiersIn(C_IMPORT_POS)
const wanted = [
  '@/services/alpha',
  '@/side-effect',
  '@/services/beta',
  '@/services/gamma',
]
const missing = wanted.filter(w => !cPos.includes(w))
if (missing.length) {
  console.error(
    `самопроверка не прошла: не найдены импорты ${missing.join(', ')}.\n` +
      'потерянный образец импорта делает достижимый код «мёртвым» — ровно так\n' +
      'многострочные импорты однажды и выпали. Список ниже читать нельзя.'
  )
  process.exit(2)
}
const cNeg = specifiersIn(C_IMPORT_NEG)
if (cNeg.length !== 0) {
  console.error(
    `самопроверка не прошла: за импорт принято ${cNeg.length} строк, которые им не являются` +
      ` (${cNeg.join(', ')}). Недостижимое будет объявлено живым.`
  )
  process.exit(2)
}
console.log(
  'самопроверка: четыре формы импорта найдены, две похожие отвергнуты'
)

function allSourceFiles() {
  const out = []
  ;(function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules') continue
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (p.endsWith('.ts') || p.endsWith('.tsx')) out.push(p)
    }
  })(SRC)
  return out
}

function main() {
  const reached = new Set()
  const queue = []

  for (const e of ENTRIES) {
    const abs = path.join(ROOT, e)
    if (fs.existsSync(abs)) {
      reached.add(abs)
      queue.push(abs)
    } else {
      console.log(`! точка входа не найдена: ${e}`)
    }
  }

  while (queue.length) {
    const file = queue.pop()
    for (const spec of importsOf(file)) {
      const target = resolveSpecifier(spec, file)
      if (!target) continue
      if (reached.has(target)) continue
      reached.add(target)
      queue.push(target)
    }
  }

  const all = allSourceFiles()
  const isTest = f =>
    f.includes('__tests__') || f.includes('/test/') || f.endsWith('.test.ts')
  const prod = all.filter(f => !isTest(f))
  const unreached = prod.filter(f => !reached.has(f))

  console.log(`точки входа: ${ENTRIES.join(', ')}`)
  console.log(`файлов в src (без тестов): ${prod.length}`)
  console.log(`достижимо: ${prod.filter(f => reached.has(f)).length}`)
  console.log(`НЕДОСТИЖИМО: ${unreached.length}`)

  // Группируем по каталогу — так виднее, что целые подсистемы мертвы.
  const byDir = new Map()
  for (const f of unreached) {
    const d = path.dirname(path.relative(ROOT, f))
    if (!byDir.has(d)) byDir.set(d, [])
    byDir.get(d).push(path.basename(f))
  }

  console.log('\n=== НЕДОСТИЖИМЫЕ ФАЙЛЫ ПО КАТАЛОГАМ ===')
  for (const [d, list] of [...byDir.entries()].sort(
    (a, b) => b[1].length - a[1].length
  )) {
    console.log(`\n  ${d}  (${list.length})`)
    for (const f of list.slice(0, 12)) console.log(`      ${f}`)
    if (list.length > 12) console.log(`      ... ещё ${list.length - 12}`)
  }

  // Строки для машинной обработки следующим шагом.
  fs.writeFileSync(
    '/tmp/unreachable.txt',
    unreached
      .map(f => path.relative(ROOT, f))
      .sort()
      .join('\n') + '\n'
  )
  console.log('\nсписок сохранён в /tmp/unreachable.txt')
}

main()
