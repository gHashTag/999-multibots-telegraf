import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * A setup/register/init function imported into the entry point must actually be
 * called somewhere. Imported-but-never-invoked is a phantom: the code looks
 * wired, but the handler it would register never runs.
 *
 * This class has bitten twice. Foundation.ts holds the global rejection
 * handlers, yet nothing imports Foundation in production, so they were never
 * armed (fixed in #1015). And setupGroupMemberHandler is imported by index.ts
 * but never called — the chat_member handler that auto-grants NEUROTESTER
 * access on group join never registers.
 *
 * Prose notes rot (the marketplace header proved it), so this is a tripwire
 * instead: it reads index.ts's setup / register / init imports and, for each,
 * looks for a real call site anywhere in src (outside tests). The ones with no
 * call site are phantoms, and the set must equal the allowlist below. A new
 * phantom — someone imports a setup function into index.ts and forgets to call
 * it — grows the set and fails here.
 */

const SRC = 'src'
const strip = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

/**
 * Known phantoms. Each entry is a decision, not a free pass: it says why the
 * function is imported but not wired, and who owns turning it on.
 */
const ALLOWLIST: Record<string, string> = {
  setupGroupMemberHandler:
    'Auto-grants/revokes NEUROTESTER access on group join/leave. Wiring it is ' +
    'an access/revenue decision (owner), and chat_member updates also need ' +
    'allowed_updates configured on the bot. Left off until the owner decides; ' +
    'not silently armed, not silently deleted.',
}

function collectSrcFiles(): string[] {
  const out: string[] = []
  ;(function walk(dir: string) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules') continue
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (p.endsWith('.ts')) out.push(p)
    }
  })(SRC)
  return out.filter(f => !f.includes('__tests__') && !f.includes('/test/'))
}

/** Names index.ts imports that match a setup/register/init verb. */
function importedSetupNames(): string[] {
  const idx = fs.readFileSync(path.join(SRC, 'index.ts'), 'utf8')
  const names = new Set<string>()
  for (const m of idx.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from/g)) {
    for (const raw of m[1].split(',')) {
      const name = raw
        .trim()
        .split(/\s+as\s+/)[0]
        .trim()
      if (/^(setup|register|initialize|init)[A-Z]\w*$/.test(name))
        names.add(name)
    }
  }
  return [...names]
}

/** True if some non-test src file calls `name(` outside its own definition. */
function hasCallSite(name: string, files: string[]): boolean {
  const callRe = new RegExp(`\\b${name}\\s*\\(`)
  const defRe = new RegExp(`(function|const)\\s+${name}\\b`)
  for (const f of files) {
    const src = strip(fs.readFileSync(f, 'utf8'))
    if (!callRe.test(src)) continue
    // The definition file also matches callRe (function NAME(...)); it counts
    // as a call site only if a call exists beyond the definition line.
    if (!defRe.test(src)) return true
    const withoutDef = src.replace(
      new RegExp(
        `(export\\s+)?(async\\s+)?(function\\s+${name}\\s*\\(|const\\s+${name}\\s*=)`
      ),
      ''
    )
    if (callRe.test(withoutDef)) return true
  }
  return false
}

describe('no phantom setup/register/init imports in index.ts', () => {
  const files = collectSrcFiles()
  const imported = importedSetupNames()

  it('finds the setup imports — otherwise the check is empty', () => {
    expect(imported.length).toBeGreaterThan(3)
  })

  it('every imported setup function is called, except the known allowlist', () => {
    const phantoms = imported.filter(n => !hasCallSite(n, files))
    expect(phantoms.sort()).toEqual(Object.keys(ALLOWLIST).sort())
  })

  it('the allowlist has no stale entries', () => {
    const stale = Object.keys(ALLOWLIST).filter(n => !imported.includes(n))
    expect(stale).toEqual([])
  })
})
