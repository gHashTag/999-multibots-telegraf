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

/*
 * EVERY SPELLING, NOT ONE.
 *
 * This matched `import.meta.env.VITE_X` only. lib/appSession.ts read
 * VITE_AUTH_ORIGIN as `(import.meta.env as Record<...>).VITE_AUTH_ORIGIN`, the
 * census could not see it, the Dockerfile never declared it, and setting it on
 * Railway would have changed nothing -- the very failure this file exists for.
 * A cast, optional chaining, a bracket, a destructure: each hides the name
 * from a pattern anchored on `import.meta.env.`. So any VITE_ name that shipped
 * source mentions counts as read. A mention in a comment is counted too; that
 * costs a declaration at worst, and a miss costs a silent production switch.
 */
function namesIn(text: string): string[] {
  return [...text.matchAll(/\bVITE_[A-Z0-9_]+\b/g)].map(m => m[0])
}

function namesReadBySource(): Set<string> {
  const names = new Set<string>()
  for (const file of everyFile(SRC)) {
    // Tests do not ship; their fixtures name variables on purpose.
    if (/\.test\.tsx?$/.test(file) || file.includes('__tests__')) continue
    for (const name of namesIn(readFileSync(file, 'utf8'))) names.add(name)
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

  it('sees a name however the source spells the read', () => {
    const spellings = [
      'import.meta.env.VITE_ONE',
      '(import.meta.env as Record<string, string>).VITE_TWO',
      'import.meta.env?.VITE_THREE',
      "import.meta.env['VITE_FOUR']",
      'const { VITE_FIVE } = import.meta.env',
    ].join('\n')
    expect(namesIn(spellings)).toEqual([
      'VITE_ONE',
      'VITE_TWO',
      'VITE_THREE',
      'VITE_FOUR',
      'VITE_FIVE',
    ])
  })

  it('counts the sign-in door, the name the old pattern missed', () => {
    expect(namesReadBySource().has('VITE_AUTH_ORIGIN')).toBe(true)
    expect(declared.has('VITE_AUTH_ORIGIN')).toBe(true)
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
