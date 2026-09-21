import { describe, expect, it, vi } from 'vitest'

vi.mock('./telegram', () => ({ getInitData: () => '' }))
const { boardSignInHref, framedByAppBoard } = await import('./embedGuest')
const { returnTargetOf } = await import('./returnTarget')

/**
 * Inside the board on app.t27.ai the guest panel signs in at the top of THIS
 * tab and comes back: a new tab would keep the session in its own
 * sessionStorage, where neither the board nor its frame can see it.
 */
describe('the guest panel inside the app board', () => {
  const win = (ancestors: string[] | undefined) => ({
    self: 1,
    top: 2,
    location: { ancestorOrigins: ancestors },
  })
  it('knows the board frames it only when every ancestor is the app', () => {
    expect(framedByAppBoard(win(['https://app.t27.ai']))).toBe(true)
    expect(
      framedByAppBoard(win(['https://app.t27.ai', 'https://app.t27.ai']))
    ).toBe(true)
    expect(framedByAppBoard(win(['https://t27.ai']))).toBe(false)
    expect(
      framedByAppBoard(win(['https://app.t27.ai', 'https://t27.ai']))
    ).toBe(false)
    expect(framedByAppBoard(win(undefined))).toBe(false)
    expect(framedByAppBoard({ self: 1, top: 1, location: {} })).toBe(false)
  })
  it('signs in with a return the app accepts, to the same screen of the board', () => {
    const href = new URL(boardSignInHref('profile'))
    expect(href.origin).toBe('https://app.t27.ai')
    const back = href.searchParams.get('return')
    expect(back).toBe('https://app.t27.ai/queen/#/queen?tab=tri&screen=profile')
    expect(returnTargetOf(back)).toBe(back)
  })
})
