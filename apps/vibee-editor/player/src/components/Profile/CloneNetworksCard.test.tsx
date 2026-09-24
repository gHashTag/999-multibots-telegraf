import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CloneNetworksCard } from './CloneNetworksCard'

/**
 * THE CLONE'S NETWORKS CARD (#2963).
 *
 * Each case is a way the card could lie: drawing "connected nowhere" when the
 * browser is simply off, calling a network whose login we cannot see "not
 * connected", showing somebody else's accounts, or drawing an empty box
 * before the server answered.
 */

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      key === 'clone.networks.count' ? `${vars?.n} connected` : key,
  }),
}))

describe('the clone networks card', () => {
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

  const draw = async (
    isOwn: boolean,
    accounts: Record<string, boolean | null> | null | undefined
  ) =>
    act(async () =>
      root.render(
        <MemoryRouter>
          <CloneNetworksCard isOwn={isOwn} accounts={accounts} />
        </MemoryRouter>
      )
    )

  const rowOf = (name: string) =>
    [...host.querySelectorAll('.profile-networks__row')].find(r =>
      r.textContent?.includes(name)
    )

  it('one line per network, in the three states the server can say', async () => {
    await draw(true, { x: true, linkedin: false, hh: null })
    expect(rowOf('X')?.getAttribute('data-state')).toBe('in')
    expect(rowOf('LinkedIn')?.getAttribute('data-state')).toBe('out')
    expect(rowOf('hh.ru')?.getAttribute('data-state')).toBe('unknown')
    expect(rowOf('hh.ru')?.textContent).toContain('clone.networks.unknown')
    expect(host.textContent).toContain('1 connected')
    /* Something is missing: the card says how to ask for the rest. */
    expect(host.textContent).toContain('clone.networks.ask')
  })

  it('a browser that is off is said as such, never as "connected nowhere"', async () => {
    await draw(true, null)
    expect(host.textContent).toContain('clone.networks.off')
    expect(host.querySelectorAll('.profile-networks__row')).toHaveLength(0)
    expect(
      host.querySelector<HTMLAnchorElement>('a[href="/browser"]')
    ).toBeTruthy()
  })

  it("draws nothing before the answer, and nothing on somebody else's profile", async () => {
    await draw(true, undefined)
    expect(host.innerHTML).toBe('')
    await draw(false, { x: true })
    expect(host.innerHTML).toBe('')
  })

  it('an unknown network id is shown as it came, not dropped', async () => {
    await draw(true, { mastodon: true })
    expect(rowOf('mastodon')?.getAttribute('data-state')).toBe('in')
    /* Everything connected: no call to connect the rest. */
    expect(host.textContent).not.toContain('clone.networks.ask')
  })
})
