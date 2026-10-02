import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MetaConnectCard, type MetaStatus } from './MetaConnectCard'

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

  it("draws nothing on somebody else's profile", async () => {
    await draw(false, { apps: { threads: true, facebook: true }, networks: [] })
    expect(host.innerHTML).toBe('')
  })
})
