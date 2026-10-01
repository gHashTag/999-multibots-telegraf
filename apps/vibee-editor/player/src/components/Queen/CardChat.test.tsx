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

describe('CardChat on the board', () => {
  let host: HTMLDivElement
  let root: Root
  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ messages: [] })))
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
