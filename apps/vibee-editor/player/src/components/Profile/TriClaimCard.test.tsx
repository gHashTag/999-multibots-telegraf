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
    await act(async () => button(/^(Withdraw|Вывести)$/).click()) // cyrillic-ok: the RU copy is checked too
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
    expect(button(/^(Withdraw|Вывести)$/).disabled).toBe(true) // cyrillic-ok: the RU copy is checked too

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
    await act(async () => button(/^(Withdraw|Вывести)$/).click()) // cyrillic-ok: the RU copy is checked too
    await flush()
    expect(host.querySelector('[role="alert"]')?.textContent).toMatch(
      /already been minted|уже выпущены/ // cyrillic-ok: the ru UI string under test
    )
  })
})

describe('TriClaimCard: withdraw all (spec tri-claim-batch v2)', () => {
  let host: HTMLDivElement
  let root: Root
  const at = (d: string, id: string, revoked = false) => ({
    ...EARNING,
    workId: id.repeat(64),
    acceptedAt: d,
    revokedAt: revoked ? '2026-10-01T00:00:00Z' : null,
  })
  const MANY = {
    ...LINKED,
    batchMax: 16,
    mintValueMilliton: 100,
    confirmations: { w5: 1, v4: 1 },
    earnings: [
      at('2026-10-03T00:00:00Z', 'c'),
      at('2026-10-01T00:00:00Z', 'a'),
      at('2026-10-02T00:00:00Z', 'b', true),
      at('2026-10-02T00:00:00Z', 'd'),
    ],
  }
  const msg = (workId: string) => ({
    workId,
    address: 'kQBtPS1b...',
    amount: '100000000',
    payload: `p-${workId.slice(0, 4)}`,
  })
  const batch = (over: Record<string, unknown>) => ({
    network: '-3',
    status: LINKED.status,
    validUntil: 1_790_000_300,
    perTx: 4,
    messages: [],
    refused: [],
    left: 0,
    ...over,
  })

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

  const mount = async () => {
    await act(async () => {
      root.render(
        <Provider store={createStore()}>
          <TriClaimCard isOwn />
        </Provider>
      )
    })
    await flush()
  }
  const press = async () => {
    await act(async () =>
      (
        host.querySelector(
          '[data-testid="tri-claim-all"] button'
        ) as HTMLButtonElement
      ).click()
    )
    await flush()
  }
  const connect = async (maxMessages?: number) => {
    const ui = latest() as FakeTonConnect & { wallet?: unknown }
    ui.connected = true
    ui.wallet = {
      device: {
        features:
          maxMessages === undefined
            ? ['SendTransaction']
            : [{ name: 'SendTransaction', maxMessages }],
      },
    }
    await act(async () => ui.statusCb?.({ account: { address: '0:11' } }))
    for (let i = 0; i < 12; i++) await flush()
    return ui
  }
  const batches = () =>
    apiFetch.mock.calls
      .filter(([u]) => String(u).endsWith('/claim/batch'))
      .map(([, init]) => JSON.parse(String(init.body)))

  it('says how many, how much TON and how many confirmations before the press', async () => {
    apiFetch.mockResolvedValue({ ...MANY, confirmations: { w5: 55, v4: 219 } })
    await mount()
    const all = host.querySelector('[data-testid="tri-claim-all"]')
    expect(all?.textContent).toContain('Withdraw all (3)')
    expect(all?.textContent).toContain('about 0.3 TON')
    expect(all?.textContent).toContain('about 55 confirmations on a W5 wallet')
    expect(all?.textContent).toContain('219 on a v4 wallet')
  })

  it('874 earnings on a W5 wallet are 55 wallet confirmations, each earning once', async () => {
    const ids = Array.from({ length: 874 }, (_, i) =>
      i.toString(16).padStart(64, '0')
    )
    const big = {
      ...MANY,
      confirmations: { w5: 55, v4: 219 },
      earnings: ids.map((id, i) => ({
        ...EARNING,
        workId: id,
        acceptedAt: `2026-09-${String(1 + (i % 28)).padStart(2, '0')}T00:00:00Z`,
      })),
    }
    apiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/claim/batch')) {
        const body = JSON.parse(String(init?.body))
        return batch({ perTx: 255, messages: body.workIds.map(msg) })
      }
      return big
    })
    const before = latest()?.sent.length ?? 0
    await mount()
    await press()
    const ui = await connect(255)
    for (let i = 0; i < 40; i++) await flush()
    const sent = ui.sent.slice(before) as { messages: { payload: string }[] }[]
    // The same number the card showed before the press: 55, not 4.
    expect(sent).toHaveLength(55)
    expect(sent.reduce((n, tx) => n + tx.messages.length, 0)).toBe(874)
    const asked = batches().flatMap(b => b.workIds)
    expect(asked).toHaveLength(874)
    expect(new Set(asked).size).toBe(874)
    expect(host.textContent).toContain('Sent to the wallet: 874 of 874')
  })

  it('keeps every refusal and its reason, retries the passing ones twice, never loops', async () => {
    const ids = Array.from({ length: 16 }, (_, i) =>
      (i + 1).toString(16).padStart(64, '0')
    )
    const sixteen = {
      ...MANY,
      earnings: ids.map(id => ({ ...EARNING, workId: id })),
    }
    apiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/claim/batch')) {
        const body = JSON.parse(String(init?.body))
        // The server's spec: a passing refusal is retried while round < 2.
        return batch({
          refused: body.workIds.map((workId: string) => ({
            workId,
            code: 'quorum_not_reached',
            kind: 2,
            retry: body.round < 2,
          })),
        })
      }
      return sixteen
    })
    const before = latest()?.sent.length ?? 0
    await mount()
    await press()
    const ui = await connect()
    expect(ui.sent.slice(before)).toEqual([])
    // Rounds 0, 1, 2 -- then it stops, with the reason on screen.
    expect(batches().map(b => [b.round, b.workIds.length])).toEqual([
      [0, 16],
      [1, 16],
      [2, 16],
    ])
    const box = host.querySelector('[data-testid="tri-claim-refused"]')
    expect(box?.getAttribute('role')).toBe('alert')
    expect(box?.textContent).toContain('Not withdrawn: 16')
    expect(
      box?.querySelector('[data-code="quorum_not_reached"]')?.textContent
    ).toContain('x16')
    expect(host.textContent).toContain('Sent to the wallet: 0 of 16')
  })

  it('shows the partial result: sent, minted before, and what stays with its reason', async () => {
    apiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/claim/batch')) {
        const [a, d, c] = JSON.parse(String(init?.body)).workIds
        return batch({
          messages: [msg(a)],
          refused: [
            { workId: d, code: 'already_minted', kind: 1, retry: false },
            { workId: c, code: 'not_merged', kind: 3, retry: false },
          ],
        })
      }
      return MANY
    })
    await mount()
    await press()
    await connect(4)
    expect(host.textContent).toContain(
      'Sent to the wallet: 2 of 3. Not withdrawn: 1.'
    )
    expect(
      host.querySelector(
        '[data-testid="tri-claim-refused"] [data-code="not_merged"]'
      )?.textContent
    ).toContain('x1')
    expect(batches()).toHaveLength(1)
  })

  it('a passing refusal that clears on the next round is sent and leaves no reason behind', async () => {
    apiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/claim/batch')) {
        const body = JSON.parse(String(init?.body))
        if (body.round === 0)
          return batch({
            messages: body.workIds.slice(1).map(msg),
            refused: [
              {
                workId: body.workIds[0],
                code: 'signer_unreachable',
                kind: 2,
                retry: true,
              },
            ],
          })
        return batch({ messages: body.workIds.map(msg) })
      }
      return MANY
    })
    await mount()
    await press()
    await connect(4)
    expect(batches().map(b => [b.round, b.workIds.length])).toEqual([
      [0, 3],
      [1, 1],
    ])
    expect(host.textContent).toContain(
      'Sent to the wallet: 3 of 3. Not withdrawn: 0.'
    )
    expect(host.querySelector('[data-testid="tri-claim-refused"]')).toBeNull()
  })

  it('stops quietly when the wallet is cancelled, counting what was minted before', async () => {
    apiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/claim/batch')) {
        const ids = JSON.parse(String(init?.body)).workIds as string[]
        return batch({
          messages: ids.slice(1).map(msg),
          refused: [
            { workId: ids[0], code: 'already_minted', kind: 1, retry: false },
          ],
        })
      }
      return MANY
    })
    await mount()
    await press()
    const ui = latest() as FakeTonConnect & {
      sendTransaction: (tx: unknown) => Promise<unknown>
    }
    const real = ui.sendTransaction
    ui.sendTransaction = async () => {
      throw new Error('Reject request')
    }
    await connect()
    ui.sendTransaction = real
    expect(host.textContent).toContain('Sent to the wallet: 1 of 3')
    expect(host.querySelector('[role="alert"]')).toBeNull()
    expect(batches()).toHaveLength(1)
  })
})
