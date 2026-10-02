import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Provider, createStore } from 'jotai'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The card is driven end to end against a fake TON Connect: the press asks
 * the server for a payload, hands it to the wallet as the `ton_proof`
 * request, sends exactly what the wallet signed back to the server, and lets
 * the wallet session go afterwards.
 */

const apiFetch = vi.hoisted(() => vi.fn())
interface FakeTonConnect {
  options: { manifestUrl: string }
  connected: boolean
  params: unknown
  statusCb: ((w: unknown) => void) | null
  disconnect: ReturnType<typeof vi.fn>
  openModal: ReturnType<typeof vi.fn>
}
// The card keeps ONE TonConnectUI per page, so instances outlive a test and
// each test drives the newest.
const ton = vi.hoisted(() => ({
  instances: [] as FakeTonConnect[],
}))
const latest = () => ton.instances[ton.instances.length - 1]

vi.mock('@/lib/apiFetch', () => ({ apiFetch }))
vi.mock('@/config', () => ({ API_BASE: 'https://api.example.test' }))
vi.mock('@tonconnect/ui', () => ({
  TonConnectUI: class {
    connected = false
    params: unknown = null
    statusCb: ((w: unknown) => void) | null = null
    disconnect = vi.fn(async () => {
      this.connected = false
    })
    openModal = vi.fn(async () => undefined)
    constructor(public options: { manifestUrl: string }) {
      ton.instances.push(this)
    }
    setConnectRequestParameters(p: unknown) {
      this.params = p
    }
    onStatusChange(cb: (w: unknown) => void) {
      this.statusCb = cb
      return () => {
        this.statusCb = null
      }
    }
    onModalStateChange() {
      return () => undefined
    }
  },
}))

import { TriWalletCard } from './TriWalletCard'
import { proofBody, type ProvedWallet } from '@/lib/triWallet'

const PROOF = {
  timestamp: 1_790_000_000,
  domain: { lengthBytes: 10, value: 'app.t27.ai' },
  payload: 'ab'.repeat(32),
  signature: 'c2lnbmF0dXJl',
}
const WALLET: ProvedWallet = {
  account: {
    address: '0:' + '11'.repeat(32),
    chain: '-239',
    walletStateInit: 'te6cc...',
    publicKey: 'ffff',
  },
  connectItems: { tonProof: { name: 'ton_proof', proof: PROOF } },
}
const BOUND = {
  chain: 'ton',
  network: '-239',
  address: WALLET.account.address,
  friendly: 'UQAR...',
  boundAt: '2026-10-01T00:00:00Z',
}

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const flush = () =>
  act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve()
  })

describe('proofBody', () => {
  it('sends the address, network, state init and proof -- never the publicKey', () => {
    expect(proofBody(WALLET)).toEqual({
      address: WALLET.account.address,
      network: '-239',
      stateInit: 'te6cc...',
      proof: PROOF,
    })
  })

  it('is null when the wallet connected without signing', () => {
    const refused: ProvedWallet = {
      ...WALLET,
      connectItems: { tonProof: { name: 'ton_proof', error: { code: 400 } } },
    }
    expect(proofBody(refused)).toBeNull()
    expect(proofBody({ account: WALLET.account })).toBeNull()
  })
})

describe('TriWalletCard', () => {
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
  })

  const mount = async (isOwn: boolean) => {
    await act(async () => {
      root.render(
        <Provider store={createStore()}>
          <TriWalletCard isOwn={isOwn} />
        </Provider>
      )
    })
    await flush()
  }

  it("draws nothing on somebody else's profile and asks nothing", async () => {
    await mount(false)
    expect(host.innerHTML).toBe('')
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('draws nothing when the server did not answer', async () => {
    apiFetch.mockRejectedValue(
      Object.assign(new Error('down'), { status: 503 })
    )
    await mount(true)
    expect(host.innerHTML).toBe('')
  })

  it('binds with the signed proof, then lets the wallet session go', async () => {
    let bound = false
    apiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/tri/wallet/challenge'))
        return { payload: PROOF.payload }
      if (init?.method === 'POST') {
        bound = true
        return { wallet: BOUND }
      }
      return { wallets: bound ? [BOUND] : [] }
    })
    await mount(true)
    const button = host.querySelector('button') as HTMLButtonElement
    expect(button).toBeTruthy()

    await act(async () => button.click())
    await flush()
    const ui = latest()
    expect(ui.options.manifestUrl).toMatch(/\/tonconnect-manifest\.json$/)
    expect(ui.params).toEqual({
      state: 'ready',
      value: { tonProof: PROOF.payload },
    })
    expect(ui.openModal).toHaveBeenCalledTimes(1)

    ui.connected = true
    await act(async () => ui.statusCb?.(WALLET))
    await flush()

    const post = apiFetch.mock.calls.find(
      ([u, i]) => u.endsWith('/api/tri/wallet') && i?.method === 'POST'
    )
    expect(JSON.parse(post![1].body)).toEqual(proofBody(WALLET))
    expect(ui.disconnect).toHaveBeenCalled()
    expect(host.textContent).toContain('UQAR...')
  })

  it('says why when the wallet is bound to another account', async () => {
    apiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/challenge')) return { payload: PROOF.payload }
      if (init?.method === 'POST')
        throw Object.assign(new Error('x'), {
          status: 409,
          code: 'wallet_bound_elsewhere',
        })
      return { wallets: [] }
    })
    await mount(true)
    await act(async () =>
      (host.querySelector('button') as HTMLButtonElement).click()
    )
    await flush()
    await act(async () => latest().statusCb?.(WALLET))
    await flush()
    expect(host.querySelector('[role="alert"]')?.textContent).toMatch(
      /another account|другому аккаунту/ // cyrillic-ok: the RU copy is checked too
    )
  })
})
