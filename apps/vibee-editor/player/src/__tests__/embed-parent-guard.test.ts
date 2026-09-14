import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { detectEmbed, type EmbedWindow } from '@/lib/embed'

/**
 * telegram-web-app.js, loaded in index.html <head>, listens to its parent
 * frame and turns any JSON {eventType} message into a Telegram WebView event
 * (invoice_closed, popup_closed, main_button_pressed, ... and reload_iframe,
 * which reloads the page). Inside Telegram Web the parent is Telegram. Inside
 * the game's TRI frame the parent is t27.ai, which must not be able to fake
 * those events. An inline script before telegram-web-app.js stops parent
 * messages from reaching it, in embed only.
 *
 * The guard runs before any bundle, so it cannot import embed.ts; it repeats
 * the decision in a few lines of ES5. The parity case below fails the moment
 * the two disagree.
 */

const HTML = fs.readFileSync(
  path.resolve(__dirname, '../../index.html'),
  'utf8'
)

function guardSource(): string {
  const match = HTML.match(
    /<script id="embed-parent-guard">([\s\S]*?)<\/script>/
  )
  if (!match)
    throw new Error('index.html has no <script id="embed-parent-guard">')
  return match[1]
}

type Listener = (event: unknown) => void

interface FakeWindow extends EmbedWindow {
  parent: object
  listeners: Array<{ type: string; fn: Listener }>
  addEventListener(type: string, fn: Listener): void
}

function fake({
  framed = true,
  search = '',
  name = '',
  ancestors = ['https://t27.ai'] as string[] | null,
  referrer = '',
} = {}): FakeWindow {
  const top = {}
  const self = framed ? {} : top
  const w: FakeWindow = {
    self,
    top,
    parent: framed ? {} : top,
    name,
    location: { search, ...(ancestors ? { ancestorOrigins: ancestors } : {}) },
    document: { referrer },
    listeners: [],
    addEventListener(type, fn) {
      w.listeners.push({ type, fn })
    },
  }
  return w
}

function runGuard(w: FakeWindow): Listener | null {
  new Function('window', guardSource())(w)
  return w.listeners.find(l => l.type === 'message')?.fn ?? null
}

const MARK =
  't27-embed:' + JSON.stringify({ parent: 'https://t27.ai', lang: 'ru' })

const CASES: Array<{
  label: string
  opts: Parameters<typeof fake>[0]
  guard: boolean
}> = [
  {
    label: 'TRI frame, first load',
    opts: { search: '?embed=1&lang=ru' },
    guard: true,
  },
  {
    label: 'TRI frame after a reload, marker only',
    opts: { name: MARK },
    guard: true,
  },
  {
    label: 'the game at app.t27.ai/game/',
    opts: { search: '?embed=1', ancestors: ['https://app.t27.ai'] },
    guard: true,
  },
  {
    label: 'top level with ?embed=1',
    opts: { framed: false, search: '?embed=1', ancestors: [] },
    guard: false,
  },
  {
    label: 'Telegram Web Mini App',
    opts: { ancestors: ['https://web.telegram.org'] },
    guard: false,
  },
  {
    label: 'Telegram Web with ?embed=1',
    opts: { search: '?embed=1', ancestors: ['https://web.telegram.org'] },
    guard: false,
  },
  {
    label: 'marker under a Telegram parent',
    opts: { name: MARK, ancestors: ['https://web.telegram.org'] },
    guard: false,
  },
  {
    label: 'Firefox first load',
    opts: { search: '?embed=1', ancestors: null, referrer: 'https://t27.ai/' },
    guard: true,
  },
  {
    label: 'Firefox after an in-frame navigation',
    opts: { name: MARK, ancestors: null, referrer: 'https://app.t27.ai/feed' },
    guard: true,
  },
  {
    label: 'Firefox, Telegram referrer, no marker',
    opts: { ancestors: null, referrer: 'https://web.telegram.org/' },
    guard: false,
  },
  {
    label: 'forged marker',
    opts: {
      name: 't27-embed:{"parent":"https://evil.example"}',
      ancestors: null,
    },
    guard: false,
  },
]

describe('index.html keeps the parent away from telegram-web-app.js in embed', () => {
  it('the guard runs before telegram-web-app.js', () => {
    const guard = HTML.indexOf('<script id="embed-parent-guard">')
    const tg = HTML.indexOf('src="https://telegram.org/js/telegram-web-app.js"')
    expect(guard).toBeGreaterThan(0)
    expect(tg).toBeGreaterThan(guard)
  })

  for (const c of CASES) {
    it(`${c.label}: ${c.guard ? 'guarded' : 'untouched'}, same verdict as detectEmbed`, () => {
      expect(runGuard(fake(c.opts)) !== null).toBe(c.guard)
      expect(detectEmbed(fake(c.opts)) !== null).toBe(c.guard)
    })
  }

  it('stops messages from the parent and lets everything else through', () => {
    const w = fake({ search: '?embed=1' })
    const listener = runGuard(w)!
    const fromParent = { source: w.parent, stopImmediatePropagation: vi.fn() }
    listener(fromParent)
    expect(fromParent.stopImmediatePropagation).toHaveBeenCalled()
    const fromElsewhere = { source: {}, stopImmediatePropagation: vi.fn() }
    listener(fromElsewhere)
    expect(fromElsewhere.stopImmediatePropagation).not.toHaveBeenCalled()
  })
})
