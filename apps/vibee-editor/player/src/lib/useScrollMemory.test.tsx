import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  Link,
  MemoryRouter,
  Route,
  Routes,
  useNavigate,
} from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  appScroller,
  useScrollMemory,
  useScrollTopOnPush,
} from './useScrollMemory'

/**
 * WHERE THE LIST WAS, AFTER A VISIT TO A CARD (CRM mobile loop, tick 5).
 *
 * Measured at 390x844 before the fix: the card opened 497 px down, its crumb
 * above the screen, and Back returned the list to the top. jsdom has no
 * layout, so the scroller's height is played by a clamp where a test needs
 * one; the real numbers are in the loop journal.
 */

let host: HTMLDivElement
let root: Root
let ready = true

function List({ drawn }: { drawn: boolean }) {
  useScrollMemory(drawn)
  return <Link to="/card/1">open</Link>
}

function Card() {
  useScrollTopOnPush('1')
  const navigate = useNavigate()
  return (
    <>
      <button className="back" onClick={() => navigate(-1)}>
        back
      </button>
      <Link className="to-list" to="/list">
        list
      </Link>
    </>
  )
}

// Rendering the same tree again keeps the router's history; only `ready`
// reaches the list anew.
async function draw(entries = ['/list']) {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
        <Routes>
          <Route path="/list" element={<List drawn={ready} />} />
          <Route path="/card/:id" element={<Card />} />
        </Routes>
      </MemoryRouter>
    )
  })
}

async function tap(selector: string) {
  await act(async () => {
    host.querySelector<HTMLElement>(selector)!.click()
  })
  await act(async () => {
    await new Promise(r => setTimeout(r, 0))
  })
}

beforeEach(() => {
  ready = true
  window.sessionStorage.clear()
  document.documentElement.scrollTop = 0
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  document.documentElement.removeAttribute('data-tg')
  document.getElementById('root')?.remove()
  document.documentElement.scrollTop = 0
})

describe('useScrollTopOnPush', () => {
  it('a card opened by a tap starts at its top', async () => {
    await draw()
    document.documentElement.scrollTop = 500
    await tap('a')
    expect(host.querySelector('.back')).not.toBeNull()
    expect(document.documentElement.scrollTop).toBe(0)
  })

  it('Back or Forward into a card is left alone', async () => {
    document.documentElement.scrollTop = 300
    await draw(['/card/1']) // the first entry arrives as POP
    expect(document.documentElement.scrollTop).toBe(300)
  })
})

describe('useScrollMemory', () => {
  it('Back returns the list to where it was left', async () => {
    await draw()
    document.documentElement.scrollTop = 640
    await tap('a')
    await tap('.back')
    expect(host.querySelector('a')).not.toBeNull()
    expect(document.documentElement.scrollTop).toBe(640)
  })

  it('a fresh visit to the list does not jump to an old place', async () => {
    await draw()
    document.documentElement.scrollTop = 640
    await tap('a')
    await tap('.to-list') // a tap forward, not Back: a new entry
    expect(host.querySelector('a')?.textContent).toBe('open')
    expect(document.documentElement.scrollTop).toBe(0)
  })

  it('waits until the list is drawn, then puts it back', async () => {
    await draw()
    document.documentElement.scrollTop = 640
    await tap('a')
    ready = false // the list is re-read on mount: nothing to scroll to yet
    await draw()
    await tap('.back')
    expect(document.documentElement.scrollTop).toBe(0)
    ready = true
    await draw()
    expect(document.documentElement.scrollTop).toBe(640)
  })

  it('keeps trying while the list is still growing into its old height', async () => {
    let max = 200
    let top = 0
    Object.defineProperty(document.documentElement, 'scrollTop', {
      configurable: true,
      get: () => top,
      set: (v: number) => {
        top = Math.min(v, max)
      },
    })
    try {
      await draw()
      max = 900
      top = 640
      await tap('a')
      max = 200 // the list is re-read: at first it is short
      await tap('.back')
      expect(top).toBe(200)
      max = 900 // the rows arrive
      await act(async () => {
        await new Promise(r => requestAnimationFrame(() => r(null)))
        await new Promise(r => requestAnimationFrame(() => r(null)))
      })
      expect(top).toBe(640)
    } finally {
      delete (document.documentElement as unknown as { scrollTop?: number })
        .scrollTop
    }
  })

  it('inside Telegram it is #root that scrolls, and #root that is kept', async () => {
    const box = document.createElement('div')
    box.id = 'root'
    document.body.appendChild(box)
    document.documentElement.setAttribute('data-tg', '1')
    expect(appScroller()).toBe(box)
    await draw()
    box.scrollTop = 720
    await tap('a')
    expect(box.scrollTop).toBe(0)
    await tap('.back')
    expect(box.scrollTop).toBe(720)
  })
})
