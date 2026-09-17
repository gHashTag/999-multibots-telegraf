import { describe, expect, it } from 'vitest'
import { DEFAULT_RESEND_S, readSentCode } from './connectDelivery'

/**
 * READING WHAT THE SERVER SAID ABOUT THE CODE.
 *
 * The screen acts on three facts: the channel, whether another one exists, and
 * how long Telegram asks to wait. Each of them used to be a constant or a guess
 * on this side. What is pinned here is that none of them is invented when the
 * server is silent, old, or newer than this screen.
 */

describe('the answer of a current render is taken as said', () => {
  it('channel, address, next channel and wait all come from the answer', () => {
    expect(
      readSentCode(
        {
          delivery: 'email',
          emailPattern: 'd***@gmail.com',
          next: 'sms',
          timeout: 120,
          viaApp: false,
        },
        3
      )
    ).toEqual({
      delivery: 'email',
      emailPattern: 'd***@gmail.com',
      canResend: true,
      resendAfter: 120,
      round: 3,
    })
  })

  it('a null next channel means no resend is offered', () => {
    // The usual answer for a login from our server: in the app, nothing else.
    const sent = readSentCode({ delivery: 'app', next: null, viaApp: true }, 1)
    expect(sent.canResend).toBe(false)
    expect(sent.delivery).toBe('app')
  })

  it('the address is kept only for the channel it belongs to', () => {
    const sent = readSentCode(
      { delivery: 'sms', emailPattern: 'd***@gmail.com', next: 'call' },
      1
    )
    expect('emailPattern' in sent).toBe(false)
  })

  it('a wait Telegram did not name falls back, and a fraction rounds UP', () => {
    expect(readSentCode({ delivery: 'app' }, 1).resendAfter).toBe(
      DEFAULT_RESEND_S
    )
    expect(readSentCode({ delivery: 'app', timeout: 0 }, 1).resendAfter).toBe(
      DEFAULT_RESEND_S
    )
    expect(
      readSentCode({ delivery: 'app', timeout: 'soon' }, 1).resendAfter
    ).toBe(DEFAULT_RESEND_S)
    // Rounding down would offer the button before Telegram accepts the press.
    expect(
      readSentCode({ delivery: 'app', timeout: 29.2 }, 1).resendAfter
    ).toBe(30)
  })
})

describe('a render that is older or newer than this screen', () => {
  it('an old render says only viaApp: its bit is honoured, no resend offered', () => {
    // The two services deploy separately. The old one has no resend route, so
    // offering the button would send the person to a 404.
    expect(readSentCode({ handle: 'h', viaApp: false }, 1)).toEqual({
      delivery: 'sms',
      canResend: false,
      resendAfter: DEFAULT_RESEND_S,
      round: 1,
    })
    expect(readSentCode({ handle: 'h', viaApp: true }, 1).delivery).toBe('app')
    expect(readSentCode({ handle: 'h' }, 1).delivery).toBe('app')
  })

  it('a channel this screen has never heard of is unknown, not guessed', () => {
    /*
     * `viaApp: false` rides along with every non-app channel. Falling back to
     * it here would turn a channel added tomorrow into "SMS" -- the very fault
     * this file was written to remove.
     */
    const sent = readSentCode({ delivery: 'passkey', viaApp: false }, 1)
    expect(sent.delivery).toBe('unknown')
  })

  it('an inherited property name is not a channel', () => {
    expect(readSentCode({ delivery: 'toString' }, 1).delivery).toBe('unknown')
  })

  it('no answer at all still gives the screen something true to draw', () => {
    expect(readSentCode(undefined, 0)).toEqual({
      delivery: 'app',
      canResend: false,
      resendAfter: DEFAULT_RESEND_S,
      round: 0,
    })
  })
})
