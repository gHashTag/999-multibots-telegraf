import { afterEach, describe, expect, it, vi } from 'vitest'
import { VoiceSession, isNoise } from './session'

function deps() {
  return {
    lang: () => 'en' as const,
    voice: () => null,
    send: vi.fn(),
    messages: () => [],
    answering: () => false,
    subscribe: () => () => {},
  }
}

class FakeAudioContext {
  resume = vi.fn(async () => {})
  close = vi.fn(async () => {})
}

describe('VoiceSession.start', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('closed while the browser asks for the mic: the mic is given back', async () => {
    let grant!: (s: MediaStream) => void
    const track = { stop: vi.fn(), enabled: true }
    const stream = {
      getTracks: () => [track],
      getAudioTracks: () => [track],
    } as unknown as MediaStream
    vi.stubGlobal('AudioContext', FakeAudioContext)
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: () => new Promise<MediaStream>(r => (grant = r)),
      },
    })
    const s = new VoiceSession(deps())
    const started = s.start()
    expect(s.snapshot.phase).toBe('starting')
    s.stop()
    grant(stream)
    await started
    expect(track.stop).toHaveBeenCalled()
    expect(s.snapshot.phase).toBe('off')
  })

  it('a refused mic is an error the person can read', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext)
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: () => Promise.reject(new Error('denied')) },
    })
    const s = new VoiceSession(deps())
    await s.start()
    expect(s.snapshot.phase).toBe('error')
    expect(s.snapshot.error).toBe('voice.error.mic')
  })

  it('a mic blocked by permission says so, not "no access"', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext)
    const denied = Object.assign(new Error('x'), { name: 'NotAllowedError' })
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: () => Promise.reject(denied) },
    })
    const s = new VoiceSession(deps())
    await s.start()
    expect(s.snapshot.error).toBe('voice.error.mic.denied')
  })

  it('a window with no microphone API is told to open a browser', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext)
    vi.stubGlobal('navigator', {})
    const s = new VoiceSession(deps())
    await s.start()
    expect(s.snapshot.phase).toBe('error')
    expect(s.snapshot.error).toBe('voice.error.mic.unsupported')
  })
})

describe('isNoise', () => {
  it('drops what whisper invents out of silence, keeps real words', () => {
    expect(isNoise('')).toBe(true)
    expect(isNoise('Thank you for watching!')).toBe(true)
    expect(isNoise('Продолжение следует...')).toBe(true)
    expect(isNoise('Open my calendar for tomorrow')).toBe(false)
    expect(isNoise('Thank you, now open my calendar')).toBe(false)
  })
})
