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
    delivery: 'app' as const,
    canResend: true,
    resendAfter: 60,
    round: 1,
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
    draw({ delivery: 'app' })
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
    draw({ delivery: 'sms' })
    expect(host.textContent).toContain('connect.code.viaSms')
    expect(host.textContent).not.toContain('connect.code.viaApp')
  })

  it('a login email is not described as an SMS, and carries its address', () => {
    /*
     * The two-sentence screen said "sent by SMS" for every answer that was
     * not the app -- including a code lying in the person's mailbox. The
     * masked address is what lets them recognise WHICH mailbox.
     */
    draw({ delivery: 'email', emailPattern: 'd***@gmail.com' })
    const where = host.querySelector('.tg-code__where')!.textContent!
    expect(where).toContain('connect.code.viaEmail')
    expect(where).toContain('d***@gmail.com')
    expect(where).not.toContain('connect.code.viaSms')
    // "sent to your login email ... to +7999" would be nonsense.
    expect(where).not.toContain('connect.code.to')
  })

  it('every channel gets a sentence of its own', () => {
    const channels = [
      'app',
      'sms',
      'call',
      'missed_call',
      'email',
      'email_setup',
      'fragment',
      'unknown',
    ] as const
    const sentences = channels.map(delivery => {
      draw({ delivery })
      return host.querySelector('.tg-code__where')!.textContent!.split(' ')[0]
    })
    expect(new Set(sentences).size).toBe(channels.length)
    for (const s of sentences) expect(s).toMatch(/^connect\.code\.via/)
  })

  it('says where an in-app code can arrive -- and only for that channel', () => {
    /*
     * The owner, 2026-09-16: a login from our server gets its code only
     * inside Telegram, on devices ALREADY signed in with that number. He
     * waited for a message that had gone to another account on the same
     * phone. Under an SMS the same sentence would be false.
     */
    draw({ delivery: 'app' })
    expect(host.querySelector('.tg-code__hint')?.textContent).toBe(
      'connect.code.appHint'
    )
    draw({ delivery: 'sms' })
    expect(host.querySelector('.tg-code__hint')).toBeNull()
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
     * before the first code has arrived. Each press moves Telegram on to its
     * next channel and the code already in flight stops being the one to
     * type, so the fastest way to never log in is to keep pressing it.
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

  it("waits Telegram's time, not ours", () => {
    // Sixty seconds was a constant of this screen. Telegram sends its own
    // `timeout`, and asking earlier than that is simply refused.
    draw({ resendAfter: 120 })
    act(() => {
      vi.advanceTimersByTime(61_000)
    })
    expect(host.querySelector('button.tg-code__resend')).toBeNull()
    expect(host.textContent).toContain('connect.code.resendIn')
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(host.querySelector('button.tg-code__resend')).toBeTruthy()
  })

  it('a press does not restart the wait; a code Telegram really sent does', () => {
    /*
     * The countdown used to reset on the press. A resend Telegram refused
     * then cost another full minute of waiting for a code that was never
     * sent. `round` grows only when the server confirms a new code.
     */
    draw()
    act(() => {
      vi.advanceTimersByTime(61_000)
    })
    act(() =>
      host.querySelector<HTMLButtonElement>('button.tg-code__resend')!.click()
    )
    expect(host.querySelector('button.tg-code__resend')).toBeTruthy()

    draw({ round: 2, resendAfter: 30 })
    expect(host.querySelector('button.tg-code__resend')).toBeNull()
    expect(host.textContent).toContain('connect.code.resendIn:30')
  })

  it('no next channel: no countdown, no button, and then the way that works', () => {
    /*
     * For a login from our server Telegram usually offers the app and nothing
     * else. `auth.resendCode` then answers SEND_CODE_UNAVAILABLE, so a
     * countdown would be counting towards a button that is known to fail.
     */
    const p = draw({ canResend: false })
    expect(host.textContent).not.toContain('connect.code.resendIn')
    expect(host.textContent).not.toContain('connect.code.noOtherWay')
    act(() => {
      vi.advanceTimersByTime(61_000)
    })
    expect(host.querySelector('button.tg-code__resend')).toBeNull()
    expect(host.textContent).toContain('connect.code.noOtherWay')
    expect(p.onResend).not.toHaveBeenCalled()
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
