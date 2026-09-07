import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConnectCode } from './ConnectCode'

/**
 * THE LOGIN SCREEN, WHERE THE PRODUCT EITHER STARTS OR STOPS.
 *
 * The owner, 2026-09-08: "the login needs a separately laid out screen for the
 * code, so people are not scared off by the complexity -- this is the main
 * functionality, a personal assistant and a CRM".
 *
 * Nothing downstream works until somebody finishes this screen, so what is
 * checked here is not decoration but the two ways it can fail a person: it
 * takes an action they did not ask for, or it leaves them with no way out.
 */

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({
    // The key itself is returned, so these tests never depend on the wording
    // in the dictionary -- only on which key the screen chose to render.
    t: (key: string, vars?: Record<string, string | number>) =>
      vars ? `${key}:${Object.values(vars).join(',')}` : key,
  }),
}))

// Without this React prints "not configured to support act(...)" on every
// render. The warning is noise, and noise is what hides the next real one.
;(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root

function draw(extra: Partial<Parameters<typeof ConnectCode>[0]> = {}) {
  const props = {
    phone: '+79991234567',
    viaApp: true,
    code: '',
    onCode: vi.fn(),
    busy: false,
    error: null,
    onSubmit: vi.fn(),
    onBack: vi.fn(),
    onResend: vi.fn(),
    ...extra,
  }
  act(() => {
    root.render(<ConnectCode {...props} />)
  })
  return props
}

beforeEach(() => {
  vi.useFakeTimers()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.useRealTimers()
})

describe('nothing leaves this screen on its own', () => {
  it('a full code does not submit itself', () => {
    /*
     * A five-digit code is the common case, not a rule: Telegram sends four to
     * seven, and the server's own `нормализоватьКод` accepts that whole range.
     * GramJS does not report the length, so auto-submitting at five digits
     * would be a guess -- and a wrong guess paints a red error over somebody
     * who typed correctly, on the screen where fear costs the most.
     */
    const p = draw({ code: '12345' })
    expect(p.onSubmit).not.toHaveBeenCalled()
  })

  it('typing does not submit either', () => {
    const p = draw({ code: '1234' })
    const input = host.querySelector('input')!
    act(() => {
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: '5', bubbles: true })
      )
    })
    expect(p.onSubmit).not.toHaveBeenCalled()
  })

  it('the button is the only thing that submits', () => {
    const p = draw({ code: '12345' })
    const go = host.querySelector<HTMLButtonElement>('.tg-code__go')!
    act(() => go.click())
    expect(p.onSubmit).toHaveBeenCalledTimes(1)
  })
})

describe('there is always a way back', () => {
  it('a mistyped number can be corrected', () => {
    /*
     * Without this the screen is a trap: the code never arrives, because it
     * went to a number with a typo in it, and the only visible control asks
     * for that code. Two ways back on purpose -- the arrow at the top for
     * people who look there, and the explicit "change the number".
     */
    const p = draw()
    act(() => host.querySelector<HTMLButtonElement>('.tg-code__back')!.click())
    act(() =>
      host.querySelector<HTMLButtonElement>('.tg-code__change')!.click()
    )
    expect(p.onBack).toHaveBeenCalledTimes(2)
  })

  it('the number is shown, so the typo is visible before the wait', () => {
    draw({ phone: '+79991234567' })
    expect(host.textContent).toContain('+79991234567')
  })
})

describe('the screen says where the code actually went', () => {
  it('in-app delivery is named as such', () => {
    draw({ viaApp: true })
    expect(host.textContent).toContain('connect.code.viaApp')
    expect(host.textContent).not.toContain('connect.code.viaSms')
  })

  it('an SMS is not described as a Telegram message', () => {
    /*
     * The old screen asserted "the code was sent to Telegram" regardless.
     * Telegram picks the channel itself; when it picked SMS, the sentence was
     * false and people scrolled their chats hunting for something that was
     * sitting in the notification shade.
     */
    draw({ viaApp: false })
    expect(host.textContent).toContain('connect.code.viaSms')
    expect(host.textContent).not.toContain('connect.code.viaApp')
  })
})

describe('one real input under the cells', () => {
  it('there is exactly one field, not one per digit', () => {
    /*
     * Five separate inputs break everything people actually do: pasting drops
     * one digit into one box, one-time-code autofill has nothing to fill, and
     * a screen reader announces five unlabelled fields. The cells are display
     * only -- hence aria-hidden -- and one real input spans the row.
     */
    draw({ code: '123' })
    expect(host.querySelectorAll('input')).toHaveLength(1)
    const cells = host.querySelectorAll('.tg-code__cell')
    expect(cells.length).toBeGreaterThanOrEqual(5)
    for (const c of cells) expect(c.getAttribute('aria-hidden')).toBe('true')
  })

  it('the field is announced despite being invisible', () => {
    // opacity, not display:none -- a hidden input cannot be focused and is
    // dropped from the accessibility tree entirely.
    draw()
    expect(host.querySelector('input')!.getAttribute('aria-label')).toBe(
      'connect.code.label'
    )
  })

  it('a pasted code with spaces still lands as digits', () => {
    const p = draw()
    const input = host.querySelector<HTMLInputElement>('input')!
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value'
      )!.set!
      setter.call(input, '1 2-3 4 5')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(p.onCode).toHaveBeenCalledWith('12345')
  })

  it('a longer code is not silently cut to five', () => {
    // The server accepts four to seven. Truncating at five here would refuse
    // a valid code and blame the person for it.
    const p = draw()
    const input = host.querySelector<HTMLInputElement>('input')!
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value'
      )!.set!
      setter.call(input, '1234567')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(p.onCode).toHaveBeenCalledWith('1234567')
  })
})

describe('asking for another code', () => {
  it('is not offered instantly -- and says when it will be', () => {
    /*
     * A resend button live from the first second gets pressed immediately,
     * before the first code has arrived. Each press starts a fresh login on
     * Telegram's side and invalidates the code already in flight, so the
     * fastest way to never log in is to keep pressing it.
     */
    draw()
    expect(host.querySelector('.tg-code__resend.is-waiting')).toBeTruthy()
    expect(host.textContent).toContain('connect.code.resendIn')
    expect(
      host.querySelector('button.tg-code__resend:not(.is-waiting)')
    ).toBeNull()
  })

  it('becomes available once the wait is over', () => {
    const p = draw()
    act(() => {
      vi.advanceTimersByTime(61_000)
    })
    const again = host.querySelector<HTMLButtonElement>(
      'button.tg-code__resend'
    )!
    expect(again.className).not.toContain('is-waiting')
    act(() => again.click())
    expect(p.onResend).toHaveBeenCalledTimes(1)
  })
})

describe('the error is readable', () => {
  it('shown in its own box rather than as bare text', () => {
    draw({ error: 'Код не подошёл. Проверьте цифры и попробуйте снова.' })
    const box = host.querySelector('.tg-code__error')!
    expect(box.textContent).toContain('Код не подошёл')
  })

  it('the button stops the second press while a check is running', () => {
    // Two sign-in attempts with the same code is how a valid code is burned.
    const p = draw({ code: '12345', busy: true })
    const go = host.querySelector<HTMLButtonElement>('.tg-code__go')!
    expect(go.disabled).toBe(true)
    act(() => go.click())
    expect(p.onSubmit).not.toHaveBeenCalled()
  })
})
