import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * A function that registers bot or process handlers must be called somewhere.
 * One that is defined, wires up handlers, and is never invoked is a dead
 * registrar: the handlers it would attach never attach.
 *
 * Companion to no-phantom-setup (#1016), which catches setup functions imported
 * into index.ts but not called there. This catches the other shape — a
 * registrar never called ANYWHERE, whether or not the entry point imports it:
 * Foundation's initializeFoundation (its global rejection handlers were never
 * armed, #1015), setupGroupMemberHandler (chat_member access), setupLevelHandlers
 * (14 level_/go_ callbacks superseded by the text-based buttonMatcher menu).
 *
 * Call sites are searched AFTER stripping comments and string literals — the
 * first pass at this missed initializeFoundation because the string
 * "Call initializeFoundation() first" counted as a call. A gate that reads
 * source must read the code, not the prose or the strings inside it.
 */

const SRC = 'src'

// Drop comments and the CONTENTS of string / template literals, so a name that
// only appears inside a message is not mistaken for a call site. Strings are
// removed in ONE alternation pass, not three sequential ones: a ' inside a
// "double" string must be consumed as part of the double-quoted run, or the
// single-quote pass pairs it with a later apostrophe and eats real code between
// (it silently swallowed a registerMultiPhotoActions(bot) call the first time).
function strip(s: string): string {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(
      /`(?:[^`\\]|\\.)*`|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g,
      m => m[0] + m[0]
    )
}

const REGISTERS = /\bbot\.(on|action|command|use|hears)\s*\(|\bprocess\.on\s*\(/
const DEF =
  /export\s+(?:async\s+)?(?:function|const)\s+((?:setup|register|initialize|init)[A-Z]\w*)/g

/**
 * Dead registrars kept on purpose. Each says why it is not wired and who owns
 * the decision — not a free pass.
 */
const ALLOWLIST: Record<string, string> = {
  initializeFoundation:
    'Foundation is never wired in production (nothing imports it outside ' +
    'examples). Its global rejection handlers were re-armed directly in ' +
    'errorHandler.ts (#1015). Left as dead code pending owner cleanup.',
  setupGroupMemberHandler:
    'chat_member auto-grant of NEUROTESTER access — wiring it is an ' +
    'access/revenue decision and needs allowed_updates (owner, #1017).',
  setupLevelHandlers:
    '14 level_/go_ inline callbacks, superseded by the text-based ' +
    'buttonMatcher menu (the live menu matches button text, not level_N ' +
    'callback_data). Appears obsolete; owner to confirm remove-vs-wire.',
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

function hasCallSite(name: string, stripped: string[]): boolean {
  const callRe = new RegExp(`\\b${name}\\s*\\(`)
  const defRe = new RegExp(`(function|const)\\s+${name}\\b`)
  for (const src of stripped) {
    if (!callRe.test(src)) continue
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

describe('no dead handler-registrars', () => {
  const files = collectSrcFiles()
  const stripped = files.map(f => strip(fs.readFileSync(f, 'utf8')))

  // Every setup/register/init function whose file registers handlers.
  const registrars = new Set<string>()
  files.forEach((_, i) => {
    if (!REGISTERS.test(stripped[i])) return
    for (const m of stripped[i].matchAll(DEF)) registrars.add(m[1])
  })

  it('finds handler-registrars — otherwise the check is empty', () => {
    expect(registrars.size).toBeGreaterThan(0)
  })

  it('every handler-registrar is called, except the known allowlist', () => {
    const dead = [...registrars].filter(n => !hasCallSite(n, stripped))
    expect(dead.sort()).toEqual(Object.keys(ALLOWLIST).sort())
  })

  it('the allowlist has no stale entries', () => {
    const stale = Object.keys(ALLOWLIST).filter(n => !registrars.has(n))
    expect(stale).toEqual([])
  })
})
