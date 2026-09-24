/**
 * ONE FACT, NOT FIVE COPIES OF IT.
 *
 * A panel that could not load says so -- rendering zeros for an unreachable
 * server would tell the owner their business is dead. But when EVERY panel
 * fails the same way, which is what an expired session looks like, the
 * screen said one sentence five times: measured at 375px, 5 x 91 = 455
 * pixels on an 812px phone, and not one of them said what to do.
 *
 * The step was already known and wired to ONE surface -- inside the game's
 * frame a 401 swaps the CRM for a sign-in panel. In the ordinary app the
 * same 401 just printed five times. After: one notice of 72px that names
 * the step.
 *
 * THE GUARD THAT MATTERS is not that the notice appears. It is that a LONE
 * broken panel still speaks in its own place: quieting panels is only ever
 * right when the notice above has already said their exact words.
 */
import { describe, expect, it } from 'vitest'
import { coveredByNotice, isSignInReason, oneReasonForAll } from './AllRefused'

const bad = (error: string) => ({ reachable: false, error })
const good = { reachable: true }

describe('one reason for all of them', () => {
  it('found when every panel failed the same way', () => {
    expect(
      oneReasonForAll([bad('сервер ответил 401'), bad('сервер ответил 401')])
    ).toBe('сервер ответил 401')
  })

  it('THE GUARD: not found when one of them worked', () => {
    // A single broken panel among working ones is the case the panel rule
    // exists for. Silencing it would hide a real failure behind a screen
    // that otherwise looks fine.
    expect(oneReasonForAll([good, bad('сервер ответил 500')])).toBeNull()
    /*
     * And asked DIRECTLY, because the line above passes by a second route:
     * a working panel carries no error, so the set of reasons has two
     * members and the answer is null whether or not anything checks
     * `reachable`. Removing that check left every test green -- an
     * equivalent mutant only because of what the other field happens to
     * hold. This state should not occur, and the type allows it: one
     * working panel means there is a screen to look at, so there is no
     * screen-wide notice.
     */
    const odd = { reachable: true, error: 'сервер ответил 401' }
    expect(oneReasonForAll([odd, bad('сервер ответил 401')])).toBeNull()
  })

  it('not found when they disagree', () => {
    expect(
      oneReasonForAll([bad('сервер ответил 401'), bad('сервер ответил 500')])
    ).toBeNull()
  })

  it('not found for one panel, or none: there is nothing to de-duplicate', () => {
    expect(oneReasonForAll([bad('x')])).toBeNull()
    expect(oneReasonForAll([])).toBeNull()
  })

  it('not found when the failures carry no reason at all', () => {
    // A notice that says "could not load: " helps nobody.
    expect(oneReasonForAll([bad(''), bad('')])).toBeNull()
  })
})

describe('what the notice says, and who stays quiet', () => {
  it('a refused credential asks for a sign-in, a broken server does not', () => {
    expect(isSignInReason('сервер ответил 401')).toBe(true)
    expect(isSignInReason('сервер ответил 403')).toBe(true)
    expect(isSignInReason('сервер ответил 500')).toBe(false)
    expect(isSignInReason('нет сети')).toBe(false)
  })

  it('a panel is quiet only when the notice said its exact words', () => {
    const reason = 'сервер ответил 401'
    expect(coveredByNotice(bad(reason), reason)).toBe(true)
    // Same screen, different failure: this one still speaks.
    expect(coveredByNotice(bad('сервер ответил 500'), reason)).toBe(false)
    // No notice at all: nobody is quieted.
    expect(coveredByNotice(bad(reason), null)).toBe(false)
    // And a panel that LOADED is not "quiet", it has content to show.
    expect(coveredByNotice(good, reason)).toBe(false)
  })
})
