import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'

/**
 * The 2026-09-12 outage: PR #2349 replaced `xlsx` with a shim over `exceljs`
 * but left `exceljs` in devDependencies. The Dockerfile installs with
 * `--omit=dev`, so the bot booted into `Cannot find module 'exceljs'` and the
 * healthcheck never came up (Railway deployment bc1ae31c). This test walks
 * every runtime source file and refuses any bare import that only exists in
 * devDependencies. Type-only imports are skipped: they vanish at build time.
 */
const ROOT = join(__dirname, '..', '..')
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const deps = new Set(Object.keys(pkg.dependencies ?? {}))
const devDeps = new Set(Object.keys(pkg.devDependencies ?? {}))

/**
 * Files that never enter the production bundle: standalone scripts started by
 * hand (`bun run src/...`) and per-module test folders. Keep this list short
 * and name the reason next to each entry.
 */
const STANDALONE = new Set([
  'src/inngest_app/mcp-server.ts', // `inngest:mcp-server` script, dev-only stdio server
])

const BUILTINS = new Set([
  ...require('module').builtinModules,
  ...require('module').builtinModules.map((m: string) => `node:${m}`),
])

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (name === '__tests__' || name === 'test' || name === 'node_modules')
        continue
      walk(p, out)
    } else if (
      /\.(ts|tsx|js|cjs|mjs)$/.test(name) &&
      !/\.(test|spec)\.(ts|tsx|js)$/.test(name) &&
      !/\.d\.ts$/.test(name)
    ) {
      out.push(p)
    }
  }
  return out
}

function packageOf(spec: string): string {
  if (spec.startsWith('@')) return spec.split('/').slice(0, 2).join('/')
  return spec.split('/')[0]
}

const IMPORT_RE =
  /(?:^|\n)\s*import\s+(type\s+)?[^'"\n]*?from\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]|\brequire\(\s*['"]([^'"]+)['"]\s*\)|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g

describe('runtime imports are installed in production', () => {
  it('no runtime source file imports a devDependencies-only package', () => {
    const offenders: string[] = []
    for (const file of walk(join(ROOT, 'src'))) {
      if (STANDALONE.has(relative(ROOT, file).split('\\').join('/'))) continue
      const src = readFileSync(file, 'utf8')
      for (const m of src.matchAll(IMPORT_RE)) {
        if (m[1]) continue // import type
        const spec = m[2] ?? m[3] ?? m[4] ?? m[5]
        if (!spec || spec.startsWith('.') || spec.startsWith('@/')) continue
        if (BUILTINS.has(spec)) continue
        const name = packageOf(spec)
        if (devDeps.has(name) && !deps.has(name)) {
          offenders.push(`${relative(ROOT, file)} -> ${name}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('exceljs is a runtime dependency (the excelCompat shim needs it)', () => {
    expect(deps.has('exceljs')).toBe(true)
    expect(devDeps.has('exceljs')).toBe(false)
  })
})
