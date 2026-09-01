/**
 * Ratchet: morphingWizard creates its upload-progress card under a synchronous
 * reject-before-set guard, so a media-group (album) upload -- several concurrent
 * photo updates for the same user on the lock-less in-memory session -- produces
 * ONE progress card, not a duplicate per photo.
 *
 * The card id is written only AFTER `await ctx.reply(...)`, so the check-then-set
 * straddles the await; without the guard every concurrent album photo reads no id
 * and creates a fresh card (only the last id survives; the rest are orphaned).
 * Found by the iter235 concurrency wave (session-check-then-act lens),
 * adversarially + hand verified. LOW/cosmetic (no charge on this step). NOTE: the
 * naive reject-before-set alone would leave the card stale at count 1 (all album
 * photos skip during the first create), so the guarded branch also REFRESHES the
 * card with the current count after creating it.
 *
 * This pins: a `!morphingProgressCreating` check, a `= true` set, and a `= false`
 * clear must all exist, and the set precedes the create-and-assign. floor +
 * self-check + real-source mutation.
 *
 * loop-fable iter235.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const FILE = path.resolve(__dirname, '../../scenes/morphingWizard/index.ts')

const strip = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

function analyze(source: string) {
  const s = strip(source)
  return {
    guardIdx: s.search(
      /if\s*\(\s*!\s*ctx\.session\.morphingProgressCreating\s*\)/
    ),
    setIdx: s.search(/ctx\.session\.morphingProgressCreating\s*=\s*true/),
    clearIdx: s.search(/ctx\.session\.morphingProgressCreating\s*=\s*false/),
    clears: /ctx\.session\.morphingProgressCreating\s*=\s*false/.test(s),
    createIdx: s.search(
      /ctx\.session\.morphingProgressMessageId\s*=\s*sentMessage\.message_id/
    ),
  }
}

describe('morphingWizard progress-card create is guarded against album duplicates', () => {
  const source = fs.readFileSync(FILE, 'utf8')
  const a = analyze(source)

  it('floor: the wizard still creates a progress card (assigns the id)', () => {
    expect(a.createIdx).toBeGreaterThan(-1)
  })

  it('the create is behind a reject-before-set !morphingProgressCreating guard, cleared afterwards', () => {
    expect(
      a.guardIdx,
      'no `if (!ctx.session.morphingProgressCreating)` guard'
    ).toBeGreaterThan(-1)
    expect(
      a.setIdx,
      'no `morphingProgressCreating = true` set'
    ).toBeGreaterThan(-1)
    expect(
      a.clears,
      'no `morphingProgressCreating = false` clear (finally)'
    ).toBe(true)
    // reject-before-set + finally-clear order: guard opens the branch, set=true
    // is first inside it, clear=false runs after (the finally). (Ordering vs the
    // create-assign is not asserted -- the catch-branch recovery also assigns the
    // id, which would confound a positional compare.)
    expect(a.guardIdx).toBeLessThan(a.setIdx)
    expect(a.setIdx).toBeLessThan(a.clearIdx)
  })

  it('self-check: detector distinguishes a guarded create from a bare one', () => {
    const bad = `
      else {
        const sentMessage = await ctx.reply(m)
        if ('message_id' in sentMessage) { ctx.session.morphingProgressMessageId = sentMessage.message_id }
      }`
    const good = `
      else if (!ctx.session.morphingProgressCreating) {
        ctx.session.morphingProgressCreating = true
        try {
          const sentMessage = await ctx.reply(m)
          if ('message_id' in sentMessage) { ctx.session.morphingProgressMessageId = sentMessage.message_id }
        } finally { ctx.session.morphingProgressCreating = false }
      }`
    const b = analyze(bad)
    expect(b.createIdx).toBeGreaterThan(-1)
    expect(b.setIdx).toBe(-1)
    const g = analyze(good)
    expect(g.setIdx).toBeGreaterThan(-1)
    expect(g.setIdx).toBeLessThan(g.createIdx)
    expect(g.clears).toBe(true)
  })

  it('mutation: removing the real set turns the check RED', () => {
    const mutated = source.replace(
      /ctx\.session\.morphingProgressCreating = true\n/,
      ''
    )
    expect(mutated).not.toEqual(source)
    expect(analyze(mutated).setIdx).toBe(-1)
  })
})
