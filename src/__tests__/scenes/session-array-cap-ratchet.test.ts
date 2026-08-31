/**
 * In-memory OOM regression guard (gated).
 *
 * 999-multibots runs every bot in ONE process on Telegraf's default
 * MemorySessionStore (no store/TTL/eviction). A scene that collects uploaded
 * photos as full Buffers in ctx.session.<array> via .push() with a per-image
 * SIZE cap but no COUNT cap lets a user spam photos until RSS climbs and the
 * container OOM-kills every bot. Closed in three scenes: morphingWizard #1145,
 * aiPhotoshopScene #1147, trainFluxModelWizard #1154.
 *
 * This was previously a MANUAL loop-tooling script (audit-session-array-cap.mjs)
 * that was NOT part of `bun run verify`, so the OOM class could regress on main
 * unnoticed -- unlike the double-charge / scene-id / unbilled-paid classes, all
 * gated by vitest ratchets. This test ports that check into the gate.
 *
 * Rule: every ctx.session.<array>.push site must have a count cap in the same
 * file -- a `session.<array> ... >= MAX_...` guard -- or be allowlisted (an
 * array that is genuinely bounded / not a raw Buffer), with a reason.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// array name -> why it is safe without a count cap
const ALLOWLIST = new Map<string, string>([
  // Pushed once per PAID generation (balance-gated, not free spam); each entry is
  // small metadata (prompt/URLs), not a 10MB upload Buffer, and it self-trims to
  // the last 10 (slice(-10)). Not the OOM class.
  [
    'savedAiPhotoshopResults',
    'paid-generation-bounded metadata, not a raw Buffer',
  ],
])

const PUSH = /ctx\.session\.([A-Za-z0-9_]+)\.push\(/g

const walk = (d: string): string[] =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
    const p = path.join(d, e.name)
    if (e.isDirectory()) return e.name === '__tests__' ? [] : walk(p)
    return e.isFile() && p.endsWith('.ts') && !p.endsWith('.test.ts') ? [p] : []
  })

// (file, array) push collectors across src
const collectors = (): { file: string; arr: string; capped: boolean }[] => {
  const out: { file: string; arr: string; capped: boolean }[] = []
  for (const f of walk('src')) {
    const src = fs.readFileSync(f, 'utf8')
    const arrays = new Set([...src.matchAll(PUSH)].map(m => m[1]))
    for (const arr of arrays) {
      const capped = new RegExp(
        `session\\.${arr}\\b[\\s\\S]{0,200}>=\\s*MAX_`
      ).test(src)
      out.push({ file: f.split(path.sep).join('/'), arr, capped })
    }
  }
  return out
}

describe('in-memory OOM: every session-array push collector is count-capped (#1145/#1147/#1154)', () => {
  const found = collectors()

  it('finds session-array push collectors (a broken matcher fails, not passes)', () => {
    expect(
      found.length,
      'the ctx.session.<array>.push matcher found nothing — it likely broke'
    ).toBeGreaterThanOrEqual(3)
  })

  it('every push collector is count-capped or allowlisted', () => {
    const uncapped = found
      .filter(c => !c.capped && !ALLOWLIST.has(c.arr))
      .map(
        c =>
          `${c.file} -> ctx.session.${c.arr}.push (no "session.${c.arr} ... >= MAX_" cap)`
      )
    expect(
      uncapped,
      'these session-array push collectors have NO count cap (in-memory OOM class). ' +
        'Add a MAX_ count cap that rejects before the push (see #1145/#1147/#1154), ' +
        'or allowlist a genuinely-bounded array with a reason:\n' +
        uncapped.join('\n')
    ).toEqual([])
  })

  it('no allowlist entry is stale (each allowlisted array is still pushed somewhere)', () => {
    const pushedArrays = new Set(found.map(c => c.arr))
    const stale = [...ALLOWLIST.keys()].filter(a => !pushedArrays.has(a))
    expect(
      stale,
      'these allowlisted arrays are no longer pushed anywhere (remove them):\n' +
        stale.join('\n')
    ).toEqual([])
  })
})
