import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Provider, createStore } from 'jotai'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The wallet app's own browser: the page reads chain and nonce from its
 * fragment, has the injected wallet sign the server's text, and sends a
 * PROPOSAL -- never a binding (render tri-wallet.test.ts "a wallet browser
 * proposes once, binds nothing, and the person confirms").
 */

const apiFetch = vi.hoisted(() => vi.fn())
vi.mock('@/lib/apiFetch', () => ({ apiFetch }))
vi.mock('@/config', () => ({ API_BASE: 'https://api.example.test' }))

import TriBindPage from './TriBind'
import { handoffUrl, readHandoff } from '@/lib/triChains'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const NONCE = 'ef'.repeat(32)
const SOL = '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin'

const flush = () =>
  act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve()
  })

describe('readHandoff', () => {
  it('reads what handoffUrl writes, and nothing else', () => {
    const url = new URL(handoffUrl('tron', NONCE, 'https://app.t27.ai'))
    expect(url.pathname).toBe('/tri/bind')
    expect(url.search).toBe('')
    expect(readHandoff(url.hash)).toEqual({ chain: 'tron', nonce: NONCE })
    expect(readHandoff('#c=bitcoin&n=' + NONCE)).toBeNull()
    expect(readHandoff('#c=evm&n=<script>')).toBeNull()
    expect(readHandoff('')).toBeNull()
  })
})

describe('TriBindPage', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    apiFetch.mockReset()
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    delete (window as { phantom?: unknown }).phantom
    window.location.hash = ''
  })

  const mount = async () => {
    await act(async () => {
      root.render(
        <Provider store={createStore()}>
          <TriBindPage />
        </Provider>
      )
    })
    await flush()
  }

  it('says the link is incomplete and asks nothing without a nonce', async () => {
    await mount()
    expect(host.querySelector('[role="alert"]')?.textContent).toMatch(
      /incomplete/
    )
    expect(host.querySelector('button')).toBeNull()
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it("signs the server's text with the wallet here and only proposes", async () => {
    window.location.hash = `#c=solana&n=${NONCE}`
    const signMessage = vi.fn<
      (message: Uint8Array) => Promise<{ signature: Uint8Array }>
    >(async () => ({
      signature: new Uint8Array([1, 2, 3]),
    }))
    Object.assign(window, {
      phantom: {
        solana: {
          connect: async () => ({ publicKey: { toString: () => SOL } }),
          signMessage,
        },
      },
    })
    apiFetch.mockImplementation(async (url: string) => {
      if (url.endsWith('/message'))
        return {
          message: 'the text',
          issuedAt: '2026-10-09T12:00:00.000Z',
          address: SOL,
        }
      return { proposed: true }
    })
    await mount()
    await act(async () =>
      (host.querySelector('button') as HTMLButtonElement).click()
    )
    await flush()

    expect(new TextDecoder().decode(signMessage.mock.calls[0][0])).toBe(
      'the text'
    )
    const urls = apiFetch.mock.calls.map(([u]) => u)
    expect(urls).toEqual([
      'https://api.example.test/api/tri/wallet/message',
      'https://api.example.test/api/tri/wallet/propose',
    ])
    expect(JSON.parse(apiFetch.mock.calls[1][1].body)).toEqual({
      chain: 'solana',
      address: SOL,
      nonce: NONCE,
      issuedAt: '2026-10-09T12:00:00.000Z',
      signature: 'AQID',
    })
    expect(host.querySelector('[role="status"]')?.textContent).toMatch(
      /Go back to Telegram/
    )
  })

  it('names the missing wallet instead of failing silently', async () => {
    window.location.hash = `#c=tron&n=${NONCE}`
    await mount()
    await act(async () =>
      (host.querySelector('button') as HTMLButtonElement).click()
    )
    await flush()
    expect(host.querySelector('[role="alert"]')?.textContent).toMatch(
      /No TRON wallet in this browser/
    )
    expect(apiFetch).not.toHaveBeenCalled()
  })
})
