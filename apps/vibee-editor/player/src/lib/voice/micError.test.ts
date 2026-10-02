import { describe, expect, it } from 'vitest'
import { isMicError, micErrorKey, micErrorText } from './micError'

const named = (name: string) => Object.assign(new Error('x'), { name })

describe('micErrorKey', () => {
  it('names each cause getUserMedia reports', () => {
    expect(micErrorKey(named('NotAllowedError'), true)).toBe(
      'voice.error.mic.denied'
    )
    expect(micErrorKey(named('SecurityError'), true)).toBe(
      'voice.error.mic.denied'
    )
    expect(micErrorKey(named('NotFoundError'), true)).toBe(
      'voice.error.mic.none'
    )
    expect(micErrorKey(named('OverconstrainedError'), true)).toBe(
      'voice.error.mic.none'
    )
    expect(micErrorKey(named('NotReadableError'), true)).toBe(
      'voice.error.mic.busy'
    )
  })

  it('no API at all wins over whatever was thrown', () => {
    expect(micErrorKey(named('NotAllowedError'), false)).toBe(
      'voice.error.mic.unsupported'
    )
  })

  it('an unknown failure keeps the general message', () => {
    expect(micErrorKey(new Error('boom'), true)).toBe('voice.error.mic')
    expect(micErrorKey('weird', true)).toBe('voice.error.mic')
    expect(micErrorKey(null, true)).toBe('voice.error.mic')
  })

  it('every microphone key is recognised as one, other errors are not', () => {
    expect(isMicError('voice.error.mic')).toBe(true)
    expect(isMicError('voice.error.mic.busy')).toBe(true)
    expect(isMicError('voice.error.hear')).toBe(false)
    expect(isMicError(null)).toBe(false)
  })
})

describe('micErrorText', () => {
  it('outside Telegram every key keeps its own words', () => {
    expect(micErrorText('voice.error.mic.denied', false)).toBe(
      'voice.error.mic.denied'
    )
    expect(micErrorText('voice.error.hear', false)).toBe('voice.error.hear')
  })

  it('inside Telegram a refusal points at the phone and the browser', () => {
    for (const key of [
      'voice.error.mic',
      'voice.error.mic.denied',
      'voice.error.mic.unsupported',
    ])
      expect(micErrorText(key, true)).toBe('voice.mic.inTelegram')
  })

  it('inside Telegram a missing or busy mic is still named as such', () => {
    expect(micErrorText('voice.error.mic.none', true)).toBe(
      'voice.error.mic.none'
    )
    expect(micErrorText('voice.error.mic.busy', true)).toBe(
      'voice.error.mic.busy'
    )
    expect(micErrorText('voice.error.recorder', true)).toBe(
      'voice.error.recorder'
    )
  })
})
