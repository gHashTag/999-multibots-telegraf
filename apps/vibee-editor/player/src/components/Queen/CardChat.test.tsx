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
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        String(url).startsWith('https://api.github.com/')
          ? github()
          : String(url).includes('/api/agent/history/live') && live
            ? live()
            : new Response(JSON.stringify({ messages: history }))
      )
    )
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
  })

  const open = async () => {
    await act(async () => {
      root.render(
        <JotaiProvider>
          <CardChat
            card={{
              task: 'gHashTag/t27#5382',
              repo: 'gHashTag/t27',
              number: 5382,
              title: TITLE,
              column: 'running',
            }}
            onClose={() => {}}
          />
        </JotaiProvider>
      )
    })
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

  it('opens at HALF with the compact handle: no second, cut title', async () => {
    await open()
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
