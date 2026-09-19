import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConnectQr } from './ConnectQr'
import { qrModules } from './qrMatrix'

/**
 * THE QR SCREEN.
 *
 * It exists for the person whose code never came. What can fail them here: a
 * code that does not match the link the server issued, a stale code left on
 * screen after the server renewed it, no way back, and -- on their only phone
 * -- no word that a code cannot be scanned by the screen it is shown on.
 */

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({
    t: (key: string, vars?: Record<string, string | number>) =>
      vars ? `${key}:${Object.values(vars).join(',')}` : key,
  }),
}))
;(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root

// Links of the real length from a short seed: a long literal that looks like
// a token is what the secret guard exists to stop, even when it is made up.
const link = (seed: string) => `tg://login?token=${seed.repeat(16)}`
const URL_A = link('AQJm')
const URL_B = link('AQJn')

function draw(extra: Partial<Parameters<typeof ConnectQr>[0]> = {}) {
  const props = {
    url: URL_A,
    error: null,
    onBack: vi.fn(),
    canOpenHere: false,
    ...extra,
  }
  act(() => {
    root.render(<ConnectQr {...props} />)
  })
  return props
}

const drawnSquares = () =>
  (host.querySelector('svg path')!.getAttribute('d') ?? '').split('M').length -
  1

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('the code on screen is the link the server issued', () => {
  it('draws that link: as many squares as its grid has dark modules', () => {
    draw()
    expect(drawnSquares()).toBe(qrModules(URL_A).flat().filter(Boolean).length)
  })

  it('a renewed link replaces the code -- a stale one cannot be scanned', () => {
    draw({ url: URL_A })
    const before = host.querySelector('svg path')!.getAttribute('d')
    draw({ url: URL_B })
    expect(host.querySelector('svg path')!.getAttribute('d')).not.toBe(before)
  })

  it('is dark on white whatever the theme, and announced to a screen reader', () => {
    draw()
    const svg = host.querySelector('svg')!
    expect(svg.querySelector('rect')!.getAttribute('fill')).toBe('#fff')
    expect(svg.querySelector('path')!.getAttribute('fill')).toBe('#000')
    expect(svg.getAttribute('role')).toBe('img')
    expect(svg.getAttribute('aria-label')).toBe('connect.qr.alt')
  })
})

describe('the person is told what to do, and what cannot work', () => {
  it('three steps, in order', () => {
    draw()
    const steps = [...host.querySelectorAll('.tg-qr__steps li')].map(
      li => li.textContent
    )
    expect(steps).toEqual([
      'connect.qr.step1',
      'connect.qr.step2',
      'connect.qr.step3',
    ])
  })

  it('says a second screen is needed, before they find out the hard way', () => {
    draw()
    expect(host.textContent).toContain('connect.qr.secondScreen')
  })

  it('there is a way back', () => {
    const p = draw()
    act(() => host.querySelector<HTMLButtonElement>('.tg-qr__back')!.click())
    expect(p.onBack).toHaveBeenCalledTimes(1)
  })
})

describe('approving on the same phone', () => {
  it('is offered only where Telegram accepts the link, and points at the link itself', () => {
    draw({ canOpenHere: true })
    const here = host.querySelector<HTMLAnchorElement>('.tg-qr__here')!
    expect(here.getAttribute('href')).toBe(URL_A)
    expect(here.textContent).toBe('connect.qr.openHere')
  })

  it('is not offered on iOS, where the link answers "go and scan it"', () => {
    draw({ canOpenHere: false })
    expect(host.querySelector('.tg-qr__here')).toBeNull()
  })
})

describe('what is said while waiting', () => {
  it('waiting, until something goes wrong -- then the error instead, not both', () => {
    draw()
    expect(host.textContent).toContain('connect.qr.waiting')
    draw({ error: 'Failed to fetch' })
    expect(host.querySelector('.tg-qr__error')!.textContent).toBe(
      'Failed to fetch'
    )
    expect(host.textContent).not.toContain('connect.qr.waiting')
  })
})
