/**
 * A CUT PREVIEW ALWAYS OFFERS THE WAY IN.
 *
 * The card shows six SOURCE lines of SOUL.md and offered "Читать целиком"
 * only when the file had more than six. On a phone that flag says nothing
 * about what is on screen: one source line wraps to two or three, and
 * Profile.css caps the drawn height at 9.5em there (measured 2026-09-23 in
 * the board frame: six lines came to 416px, more than half the screen). So a
 * four-line file could be cut with no way to open it.
 *
 * jsdom draws nothing, so the two heights are given here. That is the whole
 * mechanism under test: the box compares its own scroll height with its
 * clipped height, which is a fact only the drawn box has.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SoulCard } from './SoulCard'

const SHORT = 'Я делаю рилсы.\nЛюблю монтаж.\nПишите.'

function heights(scroll: number, client: number) {
  for (const [name, value] of [
    ['scrollHeight', scroll],
    ['clientHeight', client],
  ] as const) {
    Object.defineProperty(HTMLElement.prototype, name, {
      configurable: true,
      get() {
        return this.className === 'soul-card__text' ? value : 0
      },
    })
  }
}

describe('the SOUL preview offers the way in when it is cut', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ soul: SHORT }) }))
    )
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
    for (const name of ['scrollHeight', 'clientHeight']) {
      delete (HTMLElement.prototype as unknown as Record<string, unknown>)[name]
    }
  })

  const button = () =>
    [...host.querySelectorAll('button')].find(b =>
      b.className.includes('soul-card__more')
    )

  it('a short file that is cut still gets the button', async () => {
    heights(240, 120)
    await act(async () =>
      root.render(<SoulCard username="t27" isOwn={false} />)
    )
    // Three lines: the old six-line rule would have hidden this button.
    expect(host.querySelectorAll('.soul-card__p')).toHaveLength(3)
    expect(button()?.textContent).toBe('Читать целиком')
  })

  it('a short file that fits gets no button, so nothing is offered twice', async () => {
    heights(120, 120)
    await act(async () =>
      root.render(<SoulCard username="t27" isOwn={false} />)
    )
    expect(button()).toBeUndefined()
  })

  it('opening it marks the box, which is what lifts the cap', async () => {
    heights(240, 120)
    await act(async () =>
      root.render(<SoulCard username="t27" isOwn={false} />)
    )
    await act(async () => button()?.click())
    const box = host.querySelector('.soul-card__text')
    // Profile.css lifts max-height on [data-open='1']; without the mark the
    // text would stay clipped while the button offered to collapse it.
    expect(box?.getAttribute('data-open')).toBe('1')
    expect(button()?.textContent).toBe('Свернуть')
  })
})
