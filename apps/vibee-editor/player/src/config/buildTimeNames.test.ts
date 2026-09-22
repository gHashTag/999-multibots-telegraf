/*
 * A NAME THE DOCKERFILE DOES NOT DECLARE DOES NOT EXIST AT BUILD TIME.
 *
 * Measured 2026-09-22: `VITE_ADMIN_IDS` was set on the Railway service, the
 * service rebuilt, and the bundle still carried the fallback -- because Vite
 * inlines `import.meta.env.VITE_*` during `vite build`, and a Dockerfile build
 * only receives the variables it declares as ARG. Nothing failed; the value
 * was simply absent, so the second admin account saw no badge and the setting
 * looked ignored.
 *
 * That failure is silent by construction, which is why it is a test rather
 * than a comment: every name the source reads must either be declared in the
 * Dockerfile or be listed here as deliberately build-less.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = join(HERE, '..')
const DOCKERFILE = join(HERE, '..', '..', '..', 'Dockerfile')

/**
 * Names read only behind `import.meta.env.DEV`, which never run in a shipped
 * bundle. VITE_AGENT_KEY is the owner's own key: passing it into a production
 * build would inline a secret into a public file.
 */
const DEV_ONLY = new Set(['VITE_AGENT_KEY', 'VITE_MOCK', 'VITE_BUILD_ID'])

function everyFile(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...everyFile(full))
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full)
  }
  return out
}

function namesReadBySource(): Set<string> {
  const names = new Set<string>()
  for (const file of everyFile(SRC)) {
    const text = readFileSync(file, 'utf8')
    for (const m of text.matchAll(/import\.meta\.env\.(VITE_[A-Z0-9_]+)/g))
      names.add(m[1])
  }
  return names
}

describe('every build-time name reaches the build', () => {
  const dockerfile = readFileSync(DOCKERFILE, 'utf8')
  const declared = new Set(
    [...dockerfile.matchAll(/^ARG\s+(VITE_[A-Z0-9_]+)/gm)].map(m => m[1])
  )

  it('finds the names at all (the scan itself can rot)', () => {
    const read = namesReadBySource()
    expect(read.size).toBeGreaterThan(5)
    expect(read.has('VITE_API_URL')).toBe(true)
  })

  it('declares every name the source reads, or marks it dev-only', () => {
    const missing = [...namesReadBySource()].filter(
      n => !declared.has(n) && !DEV_ONLY.has(n)
    )
    expect(missing).toEqual([])
  })

  it('passes each declared name on to vite via ENV', () => {
    for (const name of declared) {
      expect(dockerfile).toMatch(new RegExp(`${name}=\\$${name}`))
    }
  })

  it('keeps the admin list among them: this is the case that failed', () => {
    expect(declared.has('VITE_ADMIN_IDS')).toBe(true)
  })
})
