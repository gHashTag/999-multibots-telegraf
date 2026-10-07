import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MetaConnectCard,
  WAIT_EVERY_MS,
  WAIT_FOR_MS,
  type MetaStatus,
} from './MetaConnectCard'

/**
 * THE META API CARD (meta-connect.t27).
 *
 * Each case is a way it could mislead the owner: a Connect button when the
 * server has no Meta app to connect with, "connected" for a token that ran
 * out, or a card at all on somebody else's profile.
 */

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${vars.n}` : key,
  }),
}))

describe('the Meta API card', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
  })

  const draw = async (isOwn: boolean, status: MetaStatus) => {
    await act(async () =>
      root.render(<MetaConnectCard isOwn={isOwn} status={status} />)
    )
    return [...host.querySelectorAll('li')]
  }

  it('offers no Connect button where the server has no Meta app', async () => {
    const rows = await draw(true, {
      apps: { threads: false, facebook: true },
      networks: [],
    })
    expect(rows[0].textContent).toContain('meta.card.noApp')
    expect(rows[0].querySelector('button')).toBeNull()
    expect(rows[1].textContent).toContain('meta.card.out')
    expect(rows[1].querySelector('button')?.textContent).toBe(
      'meta.card.connect'
    )
  })

  it('names the account and its days, and a run-out token is not connected', async () => {
    const rows = await draw(true, {
      apps: { threads: true, facebook: true },
      networks: [
        {
          network: 'threads',
          account: 'neuro',
          instagram: null,
          daysLeft: 0,
          usable: false,
        },
        {
          network: 'facebook',
          account: 'Page',
          instagram: 'neuro_ig',
          daysLeft: null,
          usable: true,
        },
      ],
    })
    expect(rows[0].dataset.state).toBe('out')
    expect(rows[1].dataset.state).toBe('in')
    expect(rows[1].textContent).toContain('Page · @neuro_ig')
    expect(rows[1].querySelector('button')?.textContent).toBe('meta.card.again')
  })

  it('X renews itself, LinkedIn warns a week before it ends (social-api.t27)', async () => {
    const rows = await draw(true, {
      apps: { threads: true, facebook: true, linkedin: true, x: true },
      networks: [
        {
          network: 'linkedin',
          account: 'Dmitrii',
          instagram: null,
          daysLeft: 5,
          usable: true,
        },
        {
          network: 'x',
          account: 'neuro',
          instagram: null,
          daysLeft: 0,
          usable: true,
        },
      ],
    })
    expect(rows).toHaveLength(4)
    expect(rows[2].dataset.state).toBe('in')
    expect(rows[2].textContent).toContain('meta.card.soon:5')
    expect(rows[3].dataset.state).toBe('in')
    expect(rows[3].textContent).toContain('meta.card.renews')
  })

  it('a LinkedIn token with more than a week left gives no warning', async () => {
    const rows = await draw(true, {
      apps: { linkedin: true },
      networks: [
        {
          network: 'linkedin',
          account: 'Dmitrii',
          instagram: null,
          daysLeft: 8,
          usable: true,
        },
      ],
    })
    expect(rows[2].textContent).not.toContain('meta.card.soon')
  })

  it('offers no LinkedIn or X button without their apps', async () => {
    const rows = await draw(true, { apps: {}, networks: [] })
    expect(rows[2].querySelector('button')).toBeNull()
    expect(rows[3].querySelector('button')).toBeNull()
  })

  it("draws nothing on somebody else's profile", async () => {
    await draw(false, { apps: { threads: true, facebook: true }, networks: [] })
    expect(host.innerHTML).toBe('')
  })
})

/*
 * "I connected and the card did not change" (owner, 2026-10-03): the card
 * asked once, on open, and the sign-in happens in another window.
 */
describe('the Meta API card after Connect', () => {
  let host: HTMLDivElement
  let root: Root
  let answers: MetaStatus[]
  let statusCalls: number

  const out: MetaStatus = { apps: { facebook: true }, networks: [] }
  const inFb: MetaStatus = {
    apps: { facebook: true },
    networks: [
      {
        network: 'facebook',
        account: 'Trinity',
        instagram: null,
        daysLeft: 60,
        usable: true,
      },
    ],
  }

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.useFakeTimers()
    statusCalls = 0
    answers = [out]
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/meta/start'))
          return {
            ok: true,
            json: async () => ({ ok: true, url: 'https://x' }),
          }
        const a = answers[Math.min(statusCalls, answers.length - 1)]
        statusCalls++
        return { ok: true, json: async () => ({ ok: true, ...a }) }
      })
    )
    vi.spyOn(window, 'open').mockImplementation(() => null)
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  const fbRow = () => host.querySelectorAll('li')[1] as HTMLLIElement
  const flush = () => act(async () => {})

  it('asks again when the app comes back into view', async () => {
    await act(async () => root.render(<MetaConnectCard isOwn />))
    await flush()
    expect(fbRow().dataset.state).toBe('out')
    answers = [inFb]
    statusCalls = 0
    await act(async () => window.dispatchEvent(new Event('focus')))
    await flush()
    expect(fbRow().dataset.state).toBe('in')
  })

  it('after Connect it polls until the row turns connected, then stops', async () => {
    await act(async () => root.render(<MetaConnectCard isOwn />))
    await flush()
    await act(async () => fbRow().querySelector('button')!.click())
    await flush()
    expect(window.open).toHaveBeenCalledOnce()
    expect(host.querySelector('[data-testid="meta-waiting"]')).not.toBeNull()

    answers = [out, out, inFb]
    statusCalls = 0
    for (let i = 0; i < 3; i++) {
      await act(async () => vi.advanceTimersByTime(WAIT_EVERY_MS))
      await flush()
    }
    expect(fbRow().dataset.state).toBe('in')
    expect(host.querySelector('[data-testid="meta-waiting"]')).toBeNull()

    const asked = statusCalls
    await act(async () => vi.advanceTimersByTime(WAIT_EVERY_MS * 5))
    await flush()
    expect(statusCalls).toBe(asked)
  })

  it('gives up after two minutes if the sign-in never finished', async () => {
    await act(async () => root.render(<MetaConnectCard isOwn />))
    await flush()
    await act(async () => fbRow().querySelector('button')!.click())
    await flush()
    await act(async () => vi.advanceTimersByTime(WAIT_FOR_MS + WAIT_EVERY_MS))
    await flush()
    expect(host.querySelector('[data-testid="meta-waiting"]')).toBeNull()
    const asked = statusCalls
    await act(async () => vi.advanceTimersByTime(WAIT_EVERY_MS * 5))
    await flush()
    expect(statusCalls).toBe(asked)
    expect(fbRow().dataset.state).toBe('out')
  })
})
