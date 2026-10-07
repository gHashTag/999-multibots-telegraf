import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JotaiProvider } from '@/atoms/Provider'
import { CardChat } from './CardChat'
import { DetentSheet } from '@/components/DetentSheet/DetentSheet'
;(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

/**
 * THE CARD'S SHEET ON A PHONE (tri shot card-chat, 01.10.2026). Three things
 * the phone showed and jsdom can hold: the whole title is reachable (two
 * lines, a tap opens the rest), the repository is said by its name (the
 * owner is every card's), and above PEEK the handle does not say the number
 * and title a second time -- the body is given that height instead.
 */

const TITLE =
  'EPIC: tap any kanban card and its agent conversation opens -- history, composer, A2A sync, mobile-first detent sheet'

// The doors the sheet reads: its history, and GitHub's public API.
let history: unknown[] = []
let github: () => Response = () => new Response('[]')
let live: (() => Response) | null = null
// v7: render's door to the bee's log on the card; `null` = an old render.
let beeDoor: (() => Response) | null = null

describe('CardChat on the board', () => {
  let host: HTMLDivElement
  let root: Root
  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    sessionStorage.clear()
    history = []
    github = () => new Response('[]')
    live = null
    beeDoor = null
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        String(url).startsWith('https://api.github.com/')
          ? github()
          : String(url).includes('/api/agent/history/live') && live
            ? live()
            : String(url).includes('/api/card-work')
              ? beeDoor
                ? beeDoor()
                : new Response('{}', { status: 404 })
              : new Response(JSON.stringify({ messages: history }))
      )
    )
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
  })

  const open = async (column = 'running') => {
    await act(async () => {
      root.render(
        <JotaiProvider>
          <CardChat
            card={{
              task: 'gHashTag/t27#5382',
              repo: 'gHashTag/t27',
              number: 5382,
              title: TITLE,
              column,
            }}
            onClose={() => {}}
          />
        </JotaiProvider>
      )
    })
  }

  // A running card opens on its bee (v7); the chat is one tap away.
  const toChat = async () => {
    const tab = host.querySelector<HTMLButtonElement>('#card-chat-tab-chat')
    await act(async () => tab?.click())
  }

  it('says the whole title in a disclosure the thumb opens', async () => {
    await open()
    const heading = host.querySelector<HTMLButtonElement>('.card-chat__heading')
    expect(heading?.textContent).toBe(TITLE)
    expect(heading?.getAttribute('aria-expanded')).toBe('false')
    await act(async () => heading?.click())
    expect(heading?.getAttribute('aria-expanded')).toBe('true')
    expect(heading?.className).toContain('card-chat__heading--open')
  })

  it('names the repository, not the owner every card shares', async () => {
    await open()
    const repo = host.querySelector('.card-chat__repo')
    expect(repo?.textContent).toBe('t27')
    expect(repo?.getAttribute('title')).toBe('gHashTag/t27')
    expect(host.querySelector('.card-chat__meta')?.textContent).toContain(
      '#5382'
    )
  })

  it('says GitHub did not answer, and when -- never that there is no PR', async () => {
    github = () =>
      new Response('{}', {
        status: 403,
        headers: { 'x-ratelimit-reset': '1790000000' },
      })
    await open()
    const work = host.querySelector('.card-chat__work')
    expect(
      work
        ?.querySelector('.card-chat__work-note--unmeasured')
        ?.getAttribute('data-retry-at')
    ).toBe('1790000000000')
    expect(host.querySelector('.card-chat__pr')).toBeNull()
  })

  it('lists the linked PR with its state as a way out to GitHub', async () => {
    github = () =>
      new Response(
        JSON.stringify([
          {
            event: 'cross-referenced',
            source: {
              issue: {
                number: 5389,
                title: 'spec',
                state: 'closed',
                repository: { full_name: 'gHashTag/t27' },
                pull_request: {
                  html_url: 'https://github.com/gHashTag/t27/pull/5389',
                  merged_at: '2026-10-01T12:00:00Z',
                },
              },
            },
          },
        ])
      )
    await open()
    const pr = host.querySelector<HTMLAnchorElement>('.card-chat__pr')
    expect(pr?.className).toContain('card-chat__pr--merged')
    expect(pr?.href).toBe('https://github.com/gHashTag/t27/pull/5389')
    expect(pr?.textContent).toContain('t27#5389')
  })

  it("draws the agent's proposals as cards and keeps the marker out of the bubble", async () => {
    history = [
      { role: 'user', content: 'Carry this task on' },
      {
        role: 'assistant',
        content: 'Two ways.\n[[card: Write the spec | I will draft it]]',
      },
    ]
    await open()
    await toChat()
    const bubble = host.querySelector('.card-chat__msg--assistant')
    expect(bubble?.textContent).toBe('Two ways.')
    expect(host.querySelector('.agent-cards')?.textContent).toContain(
      'Write the spec'
    )
  })

  it('shows the agent at work by name while the live stream says so (v6)', async () => {
    let feed!: ReadableStreamDefaultController<Uint8Array>
    const body = new ReadableStream<Uint8Array>({
      start: c => {
        feed = c
      },
    })
    let served = false
    live = () => {
      if (served) return new Response('{}', { status: 404 })
      served = true
      return new Response(body, {
        headers: { 'content-type': 'text/event-stream' },
      })
    }
    const say = async (s: string) => {
      await act(async () => {
        feed.enqueue(new TextEncoder().encode(s))
        await new Promise(r => setTimeout(r, 10))
      })
    }
    await open()
    await toChat()
    await act(async () => new Promise(r => setTimeout(r, 10)))
    expect(host.querySelector('.card-chat__doing')).toBeNull()
    await say('event: work\ndata: {"kind":2,"name":"gh_read"}\n\n')
    const line = host.querySelector('.card-chat__doing')
    expect(line?.getAttribute('role')).toBe('status')
    expect(line?.textContent).toBe('The agent is using gh_read…')
    await say('event: work\ndata: {"kind":3}\n\n')
    expect(host.querySelector('.card-chat__doing')?.textContent).toBe(
      'The agent is writing the answer…'
    )
    await say('event: work\ndata: {"kind":4}\n\n')
    expect(host.querySelector('.card-chat__doing')).toBeNull()
  })

  it("offers no move: the column is the Queen's verdict, said as such", async () => {
    await open()
    const column = host.querySelector('.card-chat__column')
    expect(column?.getAttribute('title')).toBeTruthy()
    expect(column?.tagName).toBe('SPAN')
    // Said in the person's words; the board's own name stays on the element.
    expect(column?.getAttribute('data-column')).toBe('running')
    expect(column?.textContent).not.toBe('running')
  })

  const BEE = {
    configured: true,
    measured: true,
    prose: false,
    bee: {
      conversation: '11111111-2222-4333-8444-555555555555',
      branch: 'queen/5382',
      model: 'glm-5.3',
      dispatchedAt: '2026-10-03T10:00:00Z',
      finishedAt: null,
      outcome: null,
      running: true,
    },
    rows: [
      {
        seq: 1,
        at: '2026-10-03T10:00:01Z',
        kind: 'tool',
        tool: 'bash',
        text: 'tri card 5382',
      },
      {
        seq: 2,
        at: '2026-10-03T10:00:02Z',
        kind: 'result',
        ok: true,
        text: 'ok',
        lines: 3,
      },
      {
        seq: 3,
        at: '2026-10-03T10:00:03Z',
        kind: 'tool',
        tool: 'read',
        text: 'specs/x',
      },
      {
        seq: 4,
        at: '2026-10-03T10:00:04Z',
        kind: 'result',
        ok: false,
        text: 'FAILED  no such file',
      },
    ],
    next: 4,
  }

  it('opens a running card on its bee: each call, the CLI picked out, the outcome under it (v7)', async () => {
    beeDoor = () => new Response(JSON.stringify(BEE))
    await open()
    const bee = host.querySelector<HTMLButtonElement>('#card-chat-tab-bee')
    expect(bee?.getAttribute('aria-selected')).toBe('true')
    // A log is read by its height: the bee's face is FULL, not HALF.
    expect(host.querySelector('.card-chat-sheet')?.className).toContain(
      'detent-sheet--full'
    )
    expect(bee?.querySelector('.card-chat__tab-live')).not.toBeNull()
    expect(bee?.querySelector('.card-chat__tab-count')?.textContent).toBe('2')
    const log = host.querySelector('.bee-log')
    expect(log?.getAttribute('data-state')).toBe('running')
    expect(log?.querySelector('.bee-log__meta')?.textContent).toContain(
      'glm-5.3 · queen/5382'
    )
    const rows = log?.querySelectorAll('.bee-log__row') ?? []
    expect(rows).toHaveLength(4)
    expect(rows[0].querySelector('.bee-log__cli')?.textContent).toBe('tri')
    expect(rows[0].querySelector('.bee-log__cmd')?.textContent).toBe(
      'tri card 5382'
    )
    expect(rows[1].className).toContain('bee-log__row--ok')
    expect(rows[1].textContent).toContain('+2 lines')
    expect(rows[2].querySelector('.bee-log__cli')).toBeNull()
    expect(rows[3].className).toContain('bee-log__row--failed')
    // The chat is not drawn behind it, and is one tap away.
    expect(host.querySelector('.card-chat__log')).toBeNull()
    await toChat()
    expect(host.querySelector('.card-chat__log')).not.toBeNull()
    expect(host.querySelector('.bee-log')).toBeNull()
  })

  it("says the bee's log is not connected when render has no door -- not that there is no bee", async () => {
    await open()
    const note = host.querySelector('.bee-log')
    expect(note?.getAttribute('data-state')).toBe('off')
    expect(note?.textContent).toBe(
      "The bee's log is not connected on this server yet"
    )
  })

  it('opens a card no bee is on at its chat, and sending from the bee goes back to it', async () => {
    beeDoor = () =>
      new Response(
        JSON.stringify({ configured: true, measured: true, bee: null })
      )
    await act(async () => {
      root.render(
        <JotaiProvider>
          <CardChat
            card={{
              task: 'gHashTag/t27#5390',
              repo: 'gHashTag/t27',
              number: 5390,
              title: 'A backlog card',
              column: 'backlog',
            }}
            onClose={() => {}}
          />
        </JotaiProvider>
      )
    })
    expect(
      host.querySelector('#card-chat-tab-chat')?.getAttribute('aria-selected')
    ).toBe('true')
    const bee = host.querySelector<HTMLButtonElement>('#card-chat-tab-bee')
    await act(async () => bee?.click())
    expect(host.querySelector('.bee-log')?.getAttribute('data-state')).toBe(
      'none'
    )
    const starter = host.querySelector<HTMLButtonElement>('.card-chat__starter')
    expect(starter).toBeNull()
    const input = host.querySelector<HTMLTextAreaElement>('.card-chat__input')
    const form = host.querySelector<HTMLFormElement>('.card-chat__composer')
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value'
      )?.set
      set?.call(input, 'what is left?')
      input?.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => form?.requestSubmit())
    expect(
      host.querySelector('#card-chat-tab-chat')?.getAttribute('aria-selected')
    ).toBe('true')
  })

  it('opens at HALF with the compact handle: no second, cut title', async () => {
    await open('review')
    const sheet = host.querySelector('.card-chat-sheet')
    expect(sheet?.className).toContain('detent-sheet--half')
    expect(sheet?.className).toContain('detent-sheet--compact')
    expect(host.querySelector('.detent-sheet__peek')).toBeNull()
  })
})

describe('DetentSheet compactHandle', () => {
  let host: HTMLDivElement
  let root: Root
  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  const body = () =>
    host.querySelector<HTMLElement>('.detent-sheet__body')!.style.maxHeight

  it('keeps the peek line at PEEK, where it is the only summary', () => {
    act(() =>
      root.render(
        <DetentSheet
          detent="peek"
          onDetent={() => {}}
          label="s"
          peek="P"
          compactHandle
        >
          body
        </DetentSheet>
      )
    )
    expect(host.querySelector('.detent-sheet__peek')?.textContent).toBe('P')
  })

  it('gives the body the 28px the peek line no longer takes above PEEK', () => {
    act(() =>
      root.render(
        <DetentSheet detent="full" onDetent={() => {}} label="s" peek="P">
          body
        </DetentSheet>
      )
    )
    const plain = parseFloat(body())
    act(() =>
      root.render(
        <DetentSheet
          detent="full"
          onDetent={() => {}}
          label="s"
          peek="P"
          compactHandle
        >
          body
        </DetentSheet>
      )
    )
    expect(parseFloat(body()) - plain).toBe(28)
    expect(host.querySelector('.detent-sheet__peek')).toBeNull()
  })
})
