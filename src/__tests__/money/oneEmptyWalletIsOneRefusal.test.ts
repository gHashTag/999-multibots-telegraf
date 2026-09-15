/**
 * ONE EMPTY WALLET IS ONE REFUSAL, NOT A TOUR OF EVERY PROVIDER.
 *
 * 2026-09-15 08:56, from the production alert channel. A person with a balance
 * of 0 tapped one avatar transform costing 4 stars. The scene runs a fallback
 * chain -- gpt-image-25, seedream45, flux-kontext, nano-banana -- and its catch
 * was unconditional: it logged "trying next model" and asked the next one.
 *
 * Every model in that chain reads the SAME balance against a price that is the
 * same or higher. The first refusal had already decided the outcome. What the
 * three retries produced instead:
 *
 *   - four owner alerts for one event (the throttle cannot collapse them,
 *     because each message text names a different model and so fingerprints as
 *     a different incident);
 *   - one of those alerts carrying the person's entire creative prompt;
 *   - a price ESCALATION after the refusal -- told they cannot afford 4 stars,
 *     the chain asked for 8;
 *   - and, at the end, this sentence: "все AI модели временно недоступны",
 *     sent with `remove_keyboard`.
 *
 * That last line is the part worth naming. It was false in both halves. The
 * models were up. The only thing between that person and their picture was a
 * top-up -- and the message that told them otherwise also took away the
 * keyboard they could have topped up from. A refusal that hides the reason and
 * removes the remedy is worse for the business than no answer at all: it is the
 * moment of highest intent to pay in the whole product.
 *
 * Read as source rather than executed: the scene is a 3000-line Telegraf wizard
 * whose failure path needs four providers, a database and a photo before it can
 * be reached. What is pinned here is structure and ORDER, which is where this
 * defect lived -- see avatarTransformQuotaGuard.test.ts for the same technique.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { isBalanceRefusal } from '@/price/helpers/isBalanceRefusal'

const FILE = path.resolve(
  __dirname,
  '../../scenes/avatarTransformScene/index.ts'
)

/** Blank comments, keeping offsets, so prose cannot satisfy a code assertion. */
const stripComments = (text: string) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(/^([^'"`\n]*?)\/\/.*$/gm, (_m, keep) => keep)

const src = stripComments(fs.readFileSync(FILE, 'utf8'))

describe('the fallback chain stops at the first money refusal', () => {
  it('asks whether the failure was money before trying the next model', () => {
    expect(src, 'the scene does not consult the predicate at all').toContain(
      'isBalanceRefusal(modelError)'
    )
  })

  it('breaks out of the loop instead of continuing', () => {
    const at = src.indexOf('isBalanceRefusal(modelError)')
    expect(at, 'the guard is missing').toBeGreaterThan(-1)
    // The `break` must be inside the guard, not somewhere after it: the guard
    // opens a block and the loop's own `if (result) break` sits far above.
    const block = src.slice(at, at + 700)
    const breaks = block.indexOf('break')
    expect(breaks, 'the guard does not leave the loop').toBeGreaterThan(-1)

    // And it leaves BEFORE the "trying next model" line that follows it,
    // which is the branch this defect took every time.
    const next = block.indexOf('trying next model')
    if (next > -1)
      expect(
        breaks,
        'the next model is asked before the guard can stop it'
      ).toBeLessThan(next)
  })

  it('does not fall through to the legacy FLUX service for want of stars', () => {
    /*
     * The inner handler caught FLUX Kontext Max and retried the legacy service
     * as a fallback. That second call is where `prompt: params.prompt` was
     * logged -- alert four, the one that published what the person wrote.
     */
    const guard = src.indexOf('isBalanceRefusal(fluxMaxError)')
    expect(guard, 'the inner FLUX fallback is unguarded').toBeGreaterThan(-1)
    const legacy = src.indexOf('generateFluxKontext({', guard)
    expect(legacy, 'the legacy call should still exist').toBeGreaterThan(guard)
    expect(
      src.slice(guard, legacy),
      'the guard must hand the refusal upward before the legacy call'
    ).toContain('throw fluxMaxError')
  })

  it('raises the flag it later reads, in that order', () => {
    // A flag set after it is read guards nothing -- the failure mode that
    // refusalOffersAWayToPay.test.ts had to pin by hand for the flux services.
    const set = src.indexOf('refusedForMoney = true')
    const read = src.indexOf('if (refusedForMoney)')
    expect(set, 'the flag is never raised').toBeGreaterThan(-1)
    expect(read, 'the flag is never read').toBeGreaterThan(set)
  })
})

describe('the ending tells the truth and hands over the button', () => {
  // Anchored on code, not on the comment above it: comments are blanked before
  // any of this is read, so a prose anchor silently slices nothing -- which is
  // exactly how the first version of this file passed while asserting on ''.
  const failure = src.slice(src.indexOf('if (!result) {'))
  it('has a failure branch to read at all', () => {
    expect(src.indexOf('if (!result) {')).toBeGreaterThan(-1)
    expect(failure.length).toBeGreaterThan(500)
  })

  it('no longer blames the providers for an empty wallet', () => {
    const money = failure.indexOf('if (refusedForMoney)')
    const lie = failure.indexOf('все AI модели временно недоступны')
    expect(money, 'the money branch is missing').toBeGreaterThan(-1)
    expect(lie, 'the outage sentence should still exist').toBeGreaterThan(-1)
    expect(
      money,
      'the outage sentence is reached before the money branch'
    ).toBeLessThan(lie)
    // And the money branch must return, or it falls into the outage sentence.
    expect(failure.slice(money, lie)).toContain('return')
  })

  it('offers the top-up keyboard rather than removing the keyboard', () => {
    const money = failure.indexOf('if (refusedForMoney)')
    const branch = failure.slice(money, failure.indexOf('console.error', money))
    expect(branch).toContain('standardButtons(isRu)')
    expect(
      branch,
      'the refusal still strips the keyboard from the person it just charged nothing'
    ).not.toContain('remove_keyboard')
  })

  it('the genuine outage keeps its buttons too', () => {
    // The person whose providers really are down still needs the one button
    // that always works -- "call a human" lives in the same keyboard.
    const lie = failure.indexOf('все AI модели временно недоступны')
    const after = failure.slice(lie, lie + 400)
    expect(after).toContain('standardButtons(isRu)')
    expect(after).not.toContain('remove_keyboard')
  })

  it('does not page the owner about a person who is simply out of stars', () => {
    const money = failure.indexOf('if (refusedForMoney)')
    const branch = failure.slice(money, failure.indexOf('console.error', money))
    expect(branch).toContain('logger.warn')
    expect(
      branch,
      'a short balance is not an incident; only logger.error rings the owner'
    ).not.toContain('logger.error')
  })
})

describe('the predicate the scene depends on', () => {
  it('recognises what the generators in this chain actually throw', () => {
    // Not a duplicate of the predicate's own suite: these are the exact
    // strings the four models in THIS chain raise, so the guard above cannot
    // be satisfied by a predicate that stopped matching them.
    expect(isBalanceRefusal(new Error('Insufficient balance'))).toBe(true)
    expect(isBalanceRefusal(new Error('Not enough stars'))).toBe(true)
    expect(isBalanceRefusal(new Error('Insufficient balance: 0 < 4'))).toBe(
      true
    )
  })

  it('does not stop the chain for a provider outage', () => {
    // The dangerous direction: a false positive ends the chain AND silences the
    // owner, so a real outage would look like a customer with an empty wallet.
    expect(isBalanceRefusal(new Error('Failed to fetch user balance'))).toBe(
      false
    )
    expect(isBalanceRefusal(new Error('fetch failed'))).toBe(false)
    expect(isBalanceRefusal(new Error('Provider returned 503'))).toBe(false)
  })
})
