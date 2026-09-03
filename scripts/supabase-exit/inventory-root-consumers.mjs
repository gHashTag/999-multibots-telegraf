#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.cjs', '.mjs'])
const SKIP_SEGMENTS = new Set([
  'node_modules',
  'dist',
  'coverage',
  'test-results',
  '__tests__',
  'test',
  'tests',
])

function extension(path) {
  const match = path.match(/(\.[a-z0-9]+)$/i)
  return match?.[1] ?? ''
}

function compareText(left, right) {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function walk(root) {
  const files = []
  const visit = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort(
      (a, b) => compareText(a.name, b.name)
    )) {
      if (entry.name.startsWith('.') || SKIP_SEGMENTS.has(entry.name)) continue
      const path = resolve(directory, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (entry.isFile() && SOURCE_EXTENSIONS.has(extension(entry.name)))
        files.push(path)
    }
  }
  visit(root)
  return files
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, match => match.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/gm, match => match.replace(/[^\n]/g, ' '))
}

function lineAt(source, offset) {
  let line = 1
  for (let i = 0; i < offset; i += 1) if (source.charCodeAt(i) === 10) line += 1
  return line
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function literalArgument(raw) {
  const value = raw.trim()
  const quote = value[0]
  if (!['"', "'", '`'].includes(quote)) return null
  const end = value.indexOf(quote, 1)
  if (end < 1) return null
  const literal = value.slice(1, end)
  if (quote === '`' && literal.includes('${')) return null
  return literal
}

function hashExpression(raw) {
  return createHash('sha256').update(raw.trim()).digest('hex')
}

function addMatches({
  source,
  file,
  identifier,
  suffix,
  kind,
  values,
  dynamic,
}) {
  const pattern = new RegExp(
    `\\b${escapeRegex(identifier)}\\s*\\.\\s*${suffix}\\s*\\(\\s*([^,\\n\\)]*)`,
    'g'
  )
  for (const match of source.matchAll(pattern)) {
    const literal = literalArgument(match[1])
    if (literal !== null) values.add(literal)
    else {
      dynamic.push({
        kind,
        file,
        line: lineAt(source, match.index),
        expressionSha256: hashExpression(match[1]),
      })
    }
  }
}

function clientIdentifiers(source) {
  const identifiers = new Set(['supabase', 'supabaseAdmin'])
  for (const match of source.matchAll(
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s*)?createClient\s*\(/g
  )) {
    identifiers.add(match[1])
  }
  for (const match of source.matchAll(
    /\b(supabase(?:Admin)?)\s+as\s+([A-Za-z_$][\w$]*)/g
  )) {
    identifiers.add(match[2])
  }
  return [...identifiers].sort(compareText)
}

function normalizeFile(root, path) {
  return relative(root, path).split(sep).join('/')
}

function parseArgs(args) {
  let source = 'src'
  const allowed = new Set()
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--source') {
      source = args[++index]
      if (!source) throw new Error('--source requires a directory')
    } else if (arg === '--allow-dynamic') {
      const value = args[++index]
      if (!value) throw new Error('--allow-dynamic requires kind:file')
      allowed.add(value)
    } else {
      throw new Error('unknown inventory argument')
    }
  }
  return { source: resolve(source), allowed }
}

export function buildManifest(sourceRoot, allowed = new Set()) {
  if (!isAbsolute(sourceRoot) || !statSync(sourceRoot).isDirectory()) {
    throw new Error('source root must be an existing absolute directory')
  }

  const tables = new Set()
  const rpc = new Set()
  const storageBuckets = new Set()
  const edgeFunctions = new Set()
  const features = new Set()
  const dynamic = []

  for (const path of walk(sourceRoot)) {
    const file = normalizeFile(sourceRoot, path)
    const source = stripComments(readFileSync(path, 'utf8'))
    for (const identifier of clientIdentifiers(source)) {
      addMatches({
        source,
        file,
        identifier,
        suffix: 'storage\\s*\\.\\s*from',
        kind: 'storage',
        values: storageBuckets,
        dynamic,
      })
      addMatches({
        source,
        file,
        identifier,
        suffix: 'from',
        kind: 'table',
        values: tables,
        dynamic,
      })
      addMatches({
        source,
        file,
        identifier,
        suffix: 'rpc',
        kind: 'rpc',
        values: rpc,
        dynamic,
      })
      const prefix = `\\b${escapeRegex(identifier)}\\s*\\.\\s*`
      if (new RegExp(`${prefix}auth\\b`).test(source)) features.add('auth')
      if (new RegExp(`${prefix}(?:channel|removeChannel)\\b`).test(source)) {
        features.add('realtime')
      }
      if (new RegExp(`${prefix}functions\\b`).test(source))
        features.add('edge-functions-client')
    }

    for (const match of source.matchAll(/\/functions\/v1\/([a-z0-9_-]+)/gi)) {
      edgeFunctions.add(match[1])
    }
  }

  const unclassifiedDynamic = dynamic
    .filter(item => !allowed.has(`${item.kind}:${item.file}`))
    .sort(
      (a, b) =>
        compareText(a.kind, b.kind) ||
        compareText(a.file, b.file) ||
        a.line - b.line ||
        compareText(a.expressionSha256, b.expressionSha256)
    )

  return {
    schemaVersion: 1,
    tables: [...tables].sort(compareText),
    rpc: [...rpc].sort(compareText),
    storageBuckets: [...storageBuckets].sort(compareText),
    edgeFunctions: [...edgeFunctions].sort(compareText),
    features: [...features].sort(compareText),
    unclassifiedDynamic,
  }
}

function main() {
  const { source, allowed } = parseArgs(process.argv.slice(2))
  const manifest = buildManifest(source, allowed)
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`)
  if (manifest.unclassifiedDynamic.length) {
    process.stderr.write('unclassified dynamic Supabase seams detected\n')
    process.exitCode = 2
  }
}

try {
  main()
} catch {
  process.stderr.write('root consumer inventory failed\n')
  process.exitCode = 1
}
