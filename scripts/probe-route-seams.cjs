#!/usr/bin/env node
/**
 * READ-ONLY (по файлам). Сводит объявленные маршруты с точками монтирования.
 *
 * Зачем: адрес обратного вызова — это шов между двумя половинами кода, и он не
 * проверяется ни типами, ни сборкой. Один недостающий префикс `/api` подвесил
 * 17 обучений на полтора года (PR #507). Такие расхождения видны только если
 * положить рядом ДВА списка: где маршрут объявлен и куда роутер примонтирован.
 *
 * Что ищем:
 *   - роутеры, которые никуда не примонтированы (мёртвые маршруты)
 *   - двойной префикс: путь начинается с /api, а монтирование тоже /api
 *   - расхождение между тем, что зовут снаружи, и тем, что отвечает
 *
 * Ничего не пишет и никуда не ходит по сети — это разбор исходников.
 */
const fs = require('fs')
const path = require('path')

const ROOT = 'src/api_server'
const INDEX = path.join(ROOT, 'index.ts')

/**
 * The three patterns this probe reads the seam with, named so the control below
 * exercises the SAME objects the scan uses. Inline literals cannot be pointed at
 * a known case, and a finder that cannot be pointed at one says "nothing found"
 * whether the seam is sound or the pattern stopped matching.
 */
const RE_IMPORT = /import\s+(\w+)\s+from\s+['"](\.[^'"]+)['"]/g
const RE_MOUNT = /app\.use\(\s*['"]([^'"]+)['"]\s*,\s*(\w+)/g
const RE_ROUTE = /router\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g

/**
 * POSITIVE CONTROL: one of each shape -- a relative router import, a mount with
 * a path, and a declared route.
 *
 * NEGATIVE CONTROL: three near-misses, one per pattern, each rejected by a
 * DIFFERENT clause so none can mask another. A package import is not a relative
 * path; app.use with middleware has no path string; and router.use is not one of
 * the HTTP verbs.
 */
const C_POS = [
  "import fooRouter from './routes/foo'",
  "app.use('/api/foo', fooRouter)",
  "router.get('/bar', handler)",
].join('\n')

const C_NEG = [
  "import express from 'express'",
  'app.use(express.json())',
  "router.use('/bar', middleware)",
].join('\n')

const count = (re, text) => [...text.matchAll(re)].length
const posOk =
  count(RE_IMPORT, C_POS) === 1 &&
  count(RE_MOUNT, C_POS) === 1 &&
  count(RE_ROUTE, C_POS) === 1
if (!posOk) {
  console.error(
    'самопроверка не прошла: заведомые импорт/монтирование/маршрут не распознаны' +
      ` (${count(RE_IMPORT, C_POS)}/${count(RE_MOUNT, C_POS)}/${count(RE_ROUTE, C_POS)}).\n` +
      'пустая сводка ниже означала бы сломанный матчер, а не сошедшиеся швы.'
  )
  process.exit(2)
}
const negTotal =
  count(RE_IMPORT, C_NEG) + count(RE_MOUNT, C_NEG) + count(RE_ROUTE, C_NEG)
if (negTotal !== 0) {
  console.error(
    `самопроверка не прошла: матчер сработал на ${negTotal} заведомо-посторонних строках` +
      ' (пакетный импорт, app.use без пути, router.use вместо глагола).'
  )
  process.exit(2)
}
console.log('самопроверка: три формы распознаны, три похожие отвергнуты')

const idx = fs.readFileSync(INDEX, 'utf8')

// import fooRouter from './routes/bar'
const imports = new Map()
for (const m of idx.matchAll(RE_IMPORT)) {
  imports.set(m[1], m[2])
}

// app.use('/mount', fooRouter)
const mounts = []
for (const m of idx.matchAll(RE_MOUNT)) {
  mounts.push({ mount: m[1], varName: m[2] })
}

console.log('=== точки монтирования в api_server/index.ts ===')
for (const { mount, varName } of mounts) {
  console.log(
    `  ${mount.padEnd(16)} <- ${varName}  (${imports.get(varName) || 'не импорт'})`
  )
}

const routeFiles = fs
  .readdirSync(path.join(ROOT, 'routes'))
  .filter(f => f.endsWith('.ts'))
  .map(f => path.join(ROOT, 'routes', f))

const mountedFiles = new Set()
for (const { varName } of mounts) {
  const rel = imports.get(varName)
  if (rel)
    mountedFiles.add(
      path.normalize(path.join(ROOT, rel.replace(/^\.\//, ''))) + '.ts'
    )
}

console.log('\n=== эффективные пути ===')
const problems = []
for (const { mount, varName } of mounts) {
  const rel = imports.get(varName)
  if (!rel) continue
  const file = path.normalize(path.join(ROOT, rel.replace(/^\.\//, ''))) + '.ts'
  if (!fs.existsSync(file)) continue
  const src = fs.readFileSync(file, 'utf8')
  const routes = [...src.matchAll(RE_ROUTE)]
  if (!routes.length) continue
  console.log(`\n  ${path.basename(file)}  (монтирование ${mount})`)
  for (const r of routes) {
    const method = r[1].toUpperCase()
    const decl = r[2]
    const full = (mount === '/' ? '' : mount) + (decl === '/' ? '/' : decl)
    const doubled = mount !== '/' && decl.startsWith(mount + '/')
    console.log(
      `    ${method.padEnd(6)} ${full}${doubled ? '   <-- ДВОЙНОЙ ПРЕФИКС' : ''}`
    )
    if (doubled)
      problems.push({
        kind: 'двойной префикс',
        file,
        method,
        decl,
        mount,
        full,
      })
  }
}

console.log('\n=== роутеры, которые НИКУДА не примонтированы ===')
let orphans = 0
for (const f of routeFiles) {
  const norm = path.normalize(f)
  if (mountedFiles.has(norm)) continue
  const src = fs.readFileSync(f, 'utf8')
  const routes = [
    ...src.matchAll(
      /router\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g
    ),
  ]
  if (!routes.length) continue
  // Файл может подключаться не через app.use в index.ts — проверим по всему src.
  const base = path.basename(f, '.ts')
  const usedElsewhere = fs
    .readdirSync('src', { recursive: true })
    .filter(p => typeof p === 'string' && p.endsWith('.ts'))
    .some(p => {
      const full = path.join('src', p)
      if (path.normalize(full) === norm) return false
      try {
        return fs.readFileSync(full, 'utf8').includes(base)
      } catch {
        return false
      }
    })
  orphans++
  console.log(
    `  ${path.basename(f)}  маршрутов: ${routes.length}  ${usedElsewhere ? '(имя встречается в других файлах)' : '(нигде не упоминается)'}`
  )
  for (const r of routes.slice(0, 6))
    console.log(`      ${r[1].toUpperCase().padEnd(6)} ${r[2]}`)
  problems.push({ kind: 'не примонтирован', file: f, routes: routes.length })
}
if (!orphans) console.log('  нет')

console.log(`\n=== ИТОГО расхождений: ${problems.length} ===`)
for (const p of problems) {
  console.log(
    `  ${p.kind}: ${path.basename(p.file)}${p.full ? ' -> ' + p.full : ''}`
  )
}
