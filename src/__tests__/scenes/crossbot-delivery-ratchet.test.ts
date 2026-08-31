/**
 * Cross-bot misdelivery regression guard (gated) — #1150 class.
 *
 * 999-multibots runs MANY bots in ONE process. A SINGLETON module (getInstance /
 * private static instance) holding one mutable this.bot, set by a setter on EVERY
 * bot's startup (last-writer-wins), that then delivers a per-user RESULT via
 * this.bot.telegram.send* routes the job to the WRONG bot (wrong sender / failed
 * send). Closed in #1150 (async-lipsync-manager resolves the per-job bot via
 * getBotByNameAdapter(job.botInfo.username)).
 *
 * asyncLipsyncCrossBot.test.ts is the BEHAVIORAL test for that one fixed
 * instance; it does not stop a NEW singleton from reintroducing the class. This
 * ratchet is the STRUCTURAL regression gate, ported from the manual loop-tooling
 * script audit-crossbot-delivery.mjs (which was NOT in bun run verify — the same
 * ungated-guard gap #1387/#1388 fixed for the OOM class).
 *
 * Rule: no file that is a singleton (getInstance / private static instance) may
 * also deliver a per-user result via the shared this.bot.telegram.send*. A
 * correct singleton delivers through the RESOLVED per-job bot. Non-singletons
 * (per-bot constructor: notificationHandler, telegram-*.service) bind this.bot to
 * one bot and are fine -- they never match the singleton signature.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SINGLETON = /getInstance\s*\(|private static instance\b/
const DELIVERS = /this\.bot\.telegram\.send/

// file -> why a singleton legitimately delivers via the shared this.bot (none yet).
const ALLOWLIST = new Map<string, string>([])

const walk = (d: string): string[] =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
    const p = path.join(d, e.name)
    if (e.isDirectory()) return e.name === '__tests__' ? [] : walk(p)
    return e.isFile() && p.endsWith('.ts') && !p.endsWith('.test.ts') ? [p] : []
  })

const files = walk('src').map(f => ({
  file: f.split(path.sep).join('/'),
  src: fs.readFileSync(f, 'utf8'),
}))

describe('cross-bot misdelivery: no singleton delivers per-user via the shared this.bot (#1150)', () => {
  const singletons = files.filter(f => SINGLETON.test(f.src))
  const deliverers = files.filter(f => DELIVERS.test(f.src))

  it('both matchers find code (a broken matcher fails, not passes)', () => {
    expect(
      singletons.length,
      'singleton matcher found too few'
    ).toBeGreaterThanOrEqual(5)
    expect(
      deliverers.length,
      'this.bot.telegram.send matcher found too few'
    ).toBeGreaterThanOrEqual(2)
  })

  it('no singleton also delivers via the shared this.bot', () => {
    const violations = files
      .filter(f => SINGLETON.test(f.src) && DELIVERS.test(f.src))
      .map(f => f.file)
      .filter(f => !ALLOWLIST.has(f))
    expect(
      violations,
      'these SINGLETON modules deliver a per-user result via the shared ' +
        'this.bot.telegram.send -> cross-bot misdelivery. Resolve the per-job ' +
        'bot instead: getBotByNameAdapter(job.botInfo?.username).bot (see #1150). ' +
        'If a singleton legitimately uses a default bot, add it to ALLOWLIST ' +
        'with a reason:\n' +
        violations.join('\n')
    ).toEqual([])
  })

  it('no allowlist entry is stale (each still is a singleton that delivers)', () => {
    const offenders = new Set(
      files
        .filter(f => SINGLETON.test(f.src) && DELIVERS.test(f.src))
        .map(f => f.file)
    )
    const stale = [...ALLOWLIST.keys()].filter(f => !offenders.has(f))
    expect(
      stale,
      'these allowlist entries no longer match a singleton-that-delivers — remove them:\n' +
        stale.join('\n')
    ).toEqual([])
  })
})
