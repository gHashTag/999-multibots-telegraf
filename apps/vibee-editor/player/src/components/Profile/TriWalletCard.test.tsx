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
  paid: true,
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

describe('TriWalletCard on EVM, Solana and TRON', () => {
  let host: HTMLDivElement
  let root: Root
  const NONCE = 'cd'.repeat(32)
  const EVM_ADDRESS = '0x2c7536E3605D9C16a7a3D7b1898e529396a65c23'
  let announce: ((e: Event) => void) | null = null

  beforeEach(() => {
    apiFetch.mockReset()
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    if (announce)
      window.removeEventListener('eip6963:requestProvider', announce)
    announce = null
    delete (window as { ethereum?: unknown }).ethereum
    vi.restoreAllMocks()
  })

  const mount = async () => {
    await act(async () => {
      root.render(
        <Provider store={createStore()}>
          <TriWalletCard isOwn />
        </Provider>
      )
    })
    await flush()
  }
  const button = (chain: string) =>
    host.querySelector(`button[data-chain="${chain}"]`) as HTMLButtonElement

  it('offers TON first, then EVM, Solana and TRON', async () => {
    apiFetch.mockResolvedValue({ wallets: [], proposals: [] })
    await mount()
    const labels = [
      ...host.querySelectorAll('.profile-topup__others button'),
    ].map(b => b.textContent)
    expect(labels).toEqual([
      'Bind a TON wallet',
      'Bind an EVM wallet',
      'Bind a Solana wallet',
      'Bind a TRON wallet',
    ])
  })

  it('says which bound address is paid today and which waits for the bridge', async () => {
    apiFetch.mockResolvedValue({
      wallets: [
        BOUND,
        {
          chain: 'evm',
          network: 'eip155',
          address: EVM_ADDRESS,
          friendly: EVM_ADDRESS,
          boundAt: '2026-10-09T00:00:00Z',
          paid: false,
        },
      ],
      proposals: [],
    })
    await mount()
    const rows = [...host.querySelectorAll('li')].map(li => li.textContent)
    expect(rows[0]).toContain('TRI is paid here')
    expect(rows[1]).toContain('EVM, every EVM chain')
    expect(rows[1]).toContain('TRI arrives here once the bridge is live')
  })

  it('binds an EVM wallet this browser holds: the server prints, the wallet signs', async () => {
    const provider = {
      request: vi.fn(async ({ method }: { method: string }) => {
        if (method === 'eth_requestAccounts') return [EVM_ADDRESS.toLowerCase()]
        if (method === 'personal_sign') return '0xsig'
        throw new Error(method)
      }),
    }
    announce = () =>
      window.dispatchEvent(
        Object.assign(new Event('eip6963:announceProvider'), {
          detail: { provider },
        })
      )
    window.addEventListener('eip6963:requestProvider', announce)
    apiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/challenge')) return { payload: NONCE }
      if (url.endsWith('/message'))
        return {
          message: 'the text',
          issuedAt: '2026-10-09T12:00:00.000Z',
          address: EVM_ADDRESS,
        }
      if (init?.method === 'POST') return { wallet: {} }
      return { wallets: [], proposals: [] }
    })
    await mount()
    await act(async () => button('evm').click())
    await flush()
    await flush()

    const asked = apiFetch.mock.calls.find(([u]) => u.endsWith('/message'))
    expect(JSON.parse(asked![1].body)).toEqual({
      chain: 'evm',
      address: EVM_ADDRESS.toLowerCase(),
      nonce: NONCE,
    })
    expect(provider.request).toHaveBeenCalledWith({
      method: 'personal_sign',
      params: [
        '0x' + Buffer.from('the text', 'utf8').toString('hex'),
        EVM_ADDRESS.toLowerCase(),
      ],
    })
    const post = apiFetch.mock.calls.find(
      ([u, i]) => u.endsWith('/api/tri/wallet') && i?.method === 'POST'
    )
    expect(JSON.parse(post![1].body)).toEqual({
      chain: 'evm',
      address: EVM_ADDRESS,
      nonce: NONCE,
      issuedAt: '2026-10-09T12:00:00.000Z',
      signature: '0xsig',
    })
  })

  it("without a wallet here, opens the wallet app's browser with the nonce in the fragment", async () => {
    const opened = vi.spyOn(window, 'open').mockReturnValue(null)
    apiFetch.mockImplementation(async (url: string) => {
      if (url.endsWith('/challenge')) return { payload: NONCE }
      return { wallets: [], proposals: [] }
    })
    await mount()
    await act(async () => {
      button('solana').click()
      await new Promise(r => setTimeout(r, 0))
    })
    await flush()
    const panel = host.querySelector('[data-testid="tri-wallet-open"]')
    expect(panel).toBeTruthy()
    const apps = [...panel!.querySelectorAll('button')].map(b => b.textContent)
    expect(apps).toEqual([
      'Phantom',
      'Solflare',
      'Trust Wallet',
      'OKX Wallet',
      'Copy link',
    ])
    await act(async () =>
      (panel!.querySelector('button') as HTMLButtonElement).click()
    )
    const link = String(opened.mock.calls[0][0])
    expect(link.startsWith('https://phantom.app/ul/browse/')).toBe(true)
    expect(decodeURIComponent(link)).toContain(`/tri/bind#c=solana&n=${NONCE}`)
    // Nothing was bound: only the challenge was asked for.
    expect(
      apiFetch.mock.calls.some(
        ([u, i]) => u.endsWith('/api/tri/wallet') && i?.method === 'POST'
      )
    ).toBe(false)
  })

  it('binds a proposal only when the person presses yes', async () => {
    let confirmed = false
    apiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        confirmed = JSON.parse(String(init.body)).confirm === NONCE
        return { wallet: {} }
      }
      return {
        wallets: [],
        proposals: confirmed
          ? []
          : [
              {
                nonce: NONCE,
                chain: 'tron',
                network: 'tron',
                address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
                proposedAt: '2026-10-09T12:00:00.000Z',
              },
            ],
      }
    })
    await mount()
    const card = host.querySelector('[data-testid="tri-wallet-proposal"]')
    expect(card?.textContent).toContain(
      'A TRON wallet signed: TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'
    )
    expect(confirmed).toBe(false)
    await act(async () =>
      (card!.querySelector('button') as HTMLButtonElement).click()
    )
    await flush()
    expect(confirmed).toBe(true)
    expect(host.querySelector('[data-testid="tri-wallet-proposal"]')).toBeNull()
  })
})
