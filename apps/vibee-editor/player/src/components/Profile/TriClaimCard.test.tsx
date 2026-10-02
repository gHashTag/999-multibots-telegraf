import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Provider, createStore } from 'jotai'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The claim card against a fake server and a fake TON Connect: GitHub is
 * linked by device code (the card shows the code and polls), and Withdraw
 * sends exactly the message the server built -- from the person's own
 * wallet, on testnet -- then lets the wallet session go.
 */

const apiFetch = vi.hoisted(() => vi.fn())
interface FakeTonConnect {
  connected: boolean
  params: unknown
  statusCb: ((w: unknown) => void) | null
  sent: unknown[]
  disconnect: ReturnType<typeof vi.fn>
  openModal: ReturnType<typeof vi.fn>
}
const ton = vi.hoisted(() => ({ instances: [] as FakeTonConnect[] }))
const latest = () => ton.instances[ton.instances.length - 1]

vi.mock('@/lib/apiFetch', () => ({ apiFetch }))
vi.mock('@/config', () => ({ API_BASE: 'https://api.example.test' }))
vi.mock('@tonconnect/ui', () => ({
  TonConnectUI: class {
    connected = false
    params: unknown = 'unset'
    statusCb: ((w: unknown) => void) | null = null
    sent: unknown[] = []
    disconnect = vi.fn(async () => {
      this.connected = false
    })
    openModal = vi.fn(async () => undefined)
    constructor() {
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
    async sendTransaction(tx: unknown) {
      this.sent.push(tx)
      return { boc: 'te6' }
    }
  },
}))

import { TriClaimCard } from './TriClaimCard'

const WORK_ID = 'e'.repeat(64)
const EARNING = {
  workId: WORK_ID,
  repo: 'gHashTag/t27',
  issue: 5429,
  commit: '7808383a3ca84c8a7ec813ae0869d8f3f7dc6309',
  specPaths: ['specs/x.t27'],
  acceptedAt: '2026-09-30T00:00:00Z',
  revokedAt: null,
  requested: false,
}
const LINKED = {
  github: { login: 'gHashTag' },
  wallet: '0:' + 'ab'.repeat(32),
  network: '-3',
  status: 'testnet only -- V1, signer quorum, NOT trustless',
  triPerSpec: 27,
  earnings: [EARNING],
}
const BUILT = {
  network: '-3',
  status: LINKED.status,
  validUntil: 1_790_000_300,
  message: {
    address: 'kQBtPS1b...',
    amount: '100000000',
    payload: 'te6cckEB...',
  },
  attestation: {
    payee: '0QCr...',
    workId: WORK_ID,
    amountMtri: '27000',
    epoch: 1,
    signers: [0, 1],
  },
}

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const flush = () =>
  act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve()
  })

describe('TriClaimCard', () => {
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
    vi.useRealTimers()
  })

  const mount = async (isOwn = true) => {
    await act(async () => {
      root.render(
        <Provider store={createStore()}>
          <TriClaimCard isOwn={isOwn} />
        </Provider>
      )
    })
    await flush()
  }
  const button = (text: RegExp) =>
    [...host.querySelectorAll('button')].find(b =>
      text.test(b.textContent ?? '')
    ) as HTMLButtonElement

  it("draws nothing on somebody else's profile and asks nothing", async () => {
    await mount(false)
    expect(host.innerHTML).toBe('')
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('says on its face that it is testnet and NOT trustless', async () => {
    apiFetch.mockResolvedValue(LINKED)
    await mount()
    expect(host.textContent).toMatch(/NOT trustless|НЕ trustless/) // cyrillic-ok: the RU copy is checked too
  })

  it('links GitHub by device code: shows the code, polls, then lists the earnings', async () => {
    vi.useFakeTimers()
    let linked = false
    let polls = 0
    apiFetch.mockImplementation(async (url: string) => {
      if (url.endsWith('/api/tri/github/start'))
        return {
          userCode: 'ABCD-1234',
          verificationUri: 'https://github.com/login/device',
          expiresIn: 899,
          interval: 5,
        }
      if (url.endsWith('/api/tri/github/poll')) {
        polls += 1
        if (polls < 2) return { pending: true, interval: 5 }
        linked = true
        return { github: { login: 'gHashTag' } }
      }
      return linked ? LINKED : { ...LINKED, github: null, earnings: [] }
    })
    await mount()
    await act(async () => button(/GitHub/).click())
    await flush()
    expect(
      host.querySelector('[data-testid="tri-github-code"]')?.textContent
    ).toContain('ABCD-1234')
    expect(host.querySelector('a')?.getAttribute('href')).toBe(
      'https://github.com/login/device'
    )

    await act(async () => vi.advanceTimersByTime(5000))
    await flush()
    expect(polls).toBe(1)
    await act(async () => vi.advanceTimersByTime(5000))
    await flush()
    expect(polls).toBe(2)
    expect(host.textContent).toContain('@gHashTag')
    expect(host.textContent).toContain('t27 #5429')
    expect(host.textContent).toContain('27 TRI')
  })

  it('Withdraw sends the built message from the own wallet on testnet, then lets go', async () => {
    apiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/tri/claim')) {
        expect(JSON.parse(String(init?.body))).toEqual({ workId: WORK_ID })
        return BUILT
      }
      return LINKED
    })
    await mount()
    await act(async () => button(/Withdraw|Вывести/).click()) // cyrillic-ok: the RU copy is checked too
    await flush()
    const ui = latest()
    // Connected without a proof request: the payee is already bound.
    expect(ui.params).toBeNull()
    expect(ui.openModal).toHaveBeenCalledTimes(1)
    ui.connected = true
    await act(async () => ui.statusCb?.({ account: { address: '0:11' } }))
    await flush()
    expect(ui.sent).toEqual([
      {
        validUntil: BUILT.validUntil,
        network: '-3',
        messages: [BUILT.message],
      },
    ])
    expect(ui.disconnect).toHaveBeenCalled()
  })

  it('cannot Withdraw without a bound wallet, and says why the server refused', async () => {
    apiFetch.mockResolvedValue({ ...LINKED, wallet: null })
    await mount()
    expect(button(/Withdraw|Вывести/).disabled).toBe(true) // cyrillic-ok: the RU copy is checked too

    apiFetch.mockImplementation(async (url: string) => {
      if (url.endsWith('/api/tri/claim'))
        throw Object.assign(new Error('x'), {
          status: 409,
          code: 'already_minted',
        })
      return LINKED
    })
    await act(async () => root.unmount())
    root = createRoot(host)
    await mount()
    await act(async () => button(/Withdraw|Вывести/).click()) // cyrillic-ok: the RU copy is checked too
    await flush()
    expect(host.querySelector('[role="alert"]')?.textContent).toMatch(
      /already been minted|уже выпущены/ // cyrillic-ok: the ru UI string under test
    )
  })
})
