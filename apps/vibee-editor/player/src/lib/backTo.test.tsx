import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  Link,
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useNavigationType,
  type InitialEntry,
} from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cameFrom, isFirstEntry, useBackTo } from './backTo'

/**
 * THE BACK LOOP (CRM mobile loop, tick 6). Tick 4 made the card's crumb a
 * real Back; the chat's "to the client" still pushed the card. A chat opened
 * from the thread list then went chat -> card -> Back -> chat -> card ... and
 * the list was never reached. The card here keeps the real crumb's rule:
 * step back unless this is the app's first entry.
 */
;(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root

function Card() {
  const location = useLocation()
  const navigate = useNavigate()
  return (
    <>
      <p className="at">card {useNavigationType()}</p>
      <Link
        className="crumb"
        to="/list"
        onClick={e => {
          if (isFirstEntry(location)) return
          e.preventDefault()
          navigate(-1)
        }}
      >
        back
      </Link>
      <Link className="chat" to="/card/chat" state={cameFrom('/card')}>
        chat
      </Link>
    </>
  )
}

function Chat() {
  const back = useBackTo('/card')
  return (
    <>
      <p className="at">chat</p>
      <Link className="to-card" to="/card" onClick={back}>
        to the card
      </Link>
    </>
  )
}

const Elsewhere = ({ name }: { name: string }) => <p className="at">{name}</p>

async function draw(entries: InitialEntry[]) {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
        <Routes>
          <Route path="/list" element={<Elsewhere name="list" />} />
          <Route path="/threads" element={<Elsewhere name="threads" />} />
          <Route path="/card" element={<Card />} />
          <Route path="/card/chat" element={<Chat />} />
        </Routes>
      </MemoryRouter>
    )
  })
}

async function tap(selector: string, init: MouseEventInit = {}) {
  await act(async () => {
    host
      .querySelector<HTMLElement>(selector)!
      .dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, ...init })
      )
  })
  await act(async () => {
    await new Promise(r => setTimeout(r, 0))
  })
}

const at = () => host.querySelector('.at')?.textContent

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('useBackTo', () => {
  it('came from the card: steps back to that very entry', async () => {
    await draw(['/list', '/card'])
    await tap('.chat')
    expect(at()).toBe('chat')
    await tap('.to-card')
    expect(at()).toBe('card POP')
    await tap('.crumb')
    expect(at()).toBe('list')
  })

  it("came from elsewhere: the card takes the chat's place, and Back leaves both", async () => {
    await draw(['/threads', '/card/chat'])
    await tap('.to-card')
    expect(at()).toBe('card REPLACE')
    await tap('.crumb')
    expect(at()).toBe('threads') // not the chat again: no loop
  })

  it('a chat opened straight from a link hands "first entry" on to the card', async () => {
    await draw(['/card/chat'])
    await tap('.to-card')
    expect(at()).toBe('card REPLACE')
    // Nothing of the app is behind: the crumb keeps its plain link.
    await tap('.crumb')
    expect(at()).toBe('list')
  })

  it('a state from another card does not count as this one', async () => {
    await draw([
      '/threads',
      { pathname: '/card/chat', state: cameFrom('/elsewhere') },
    ])
    await tap('.to-card')
    expect(at()).toBe('card REPLACE')
  })

  it('a modifier key keeps the plain link for a new tab', async () => {
    await draw(['/threads', '/card/chat'])
    // Past React, the browser would open the tab; jsdom cannot, so the
    // default is noted and then stopped here.
    let leftToBrowser = false
    const browser = (e: Event) => {
      leftToBrowser = !e.defaultPrevented
      e.preventDefault()
    }
    document.addEventListener('click', browser)
    try {
      await tap('.to-card', { metaKey: true })
    } finally {
      document.removeEventListener('click', browser)
    }
    expect(leftToBrowser).toBe(true)
    expect(at()).toBe('chat')
  })
})
