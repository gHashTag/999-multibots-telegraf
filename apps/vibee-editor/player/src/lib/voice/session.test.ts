import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Message } from '@/atoms/agentChat'
import { VoiceSession, isNoise } from './session'

function deps() {
  return {
    lang: () => 'en' as const,
    voice: () => null,
    send: vi.fn(),
    messages: (): readonly Message[] => [],
    answering: () => false,
    subscribe: (_cb: () => void) => () => {},
    warm: vi.fn(async () => {}),
  }
}

const flush = async () => {
  for (let i = 0; i < 10; i++) await new Promise(r => setTimeout(r, 0))
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

describe('VoiceSession: no microphone, the person types', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('a typed question is sent, answered aloud, and the field comes back', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext)
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: () => Promise.reject(new Error('denied')) },
    })
    let thread: Message[] = []
    let answering = false
    let changed = () => {}
    const d = {
      ...deps(),
      // Like sendOrQueue: the conversation is answering from the send on.
      send: vi.fn(() => {
        answering = true
      }),
      // Our voice unreachable: the device reads it (here, instantly).
      synthesize: vi.fn(async (): Promise<ArrayBuffer> => {
        throw new Error('offline')
      }),
      messages: () => thread,
      answering: () => answering,
      subscribe: (cb: () => void) => {
        changed = cb
        return () => {}
      },
    }
    const s = new VoiceSession(d)
    const said: string[] = []
    s.subscribe(() => {
      if (s.snapshot.saying) said.push(s.snapshot.saying)
    })
    await s.start()
    expect(s.snapshot).toMatchObject({ phase: 'error', keyboard: true })

    s.type('  what time is it ')
    expect(d.send).toHaveBeenCalledWith('what time is it')
    expect(s.snapshot).toMatchObject({
      phase: 'thinking',
      heard: 'what time is it',
    })

    thread = [
      { id: 'u', role: 'user', text: 'what time is it' },
      { id: 'a', role: 'assistant', text: 'It is noon.' },
    ]
    answering = false
    changed()
    await flush()
    expect(said).toContain('It is noon.')
    // Answered: back to the mic's error and the field, not to a dead "listening".
    expect(s.snapshot).toMatchObject({
      phase: 'error',
      error: 'voice.error.mic',
      keyboard: true,
    })
  })

  it('with a working microphone there is nothing to type into', () => {
    const d = deps()
    const s = new VoiceSession(d)
    s.type('hello')
    expect(d.send).not.toHaveBeenCalled()
  })

  it('the server is asked to warm the voice as the session opens', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext)
    vi.stubGlobal('navigator', {})
    const d = deps()
    await new VoiceSession(d).start()
    expect(d.warm).toHaveBeenCalledWith('en', null)
  })
})

/** Enough of Web Audio and MediaRecorder for a session to listen. */
class ListeningAudioContext extends FakeAudioContext {
  destination = {}
  createAnalyser = () => ({
    fftSize: 2048,
    smoothingTimeConstant: 0,
    connect: () => {},
    getFloatTimeDomainData: () => {},
  })
  createMediaStreamSource = () => ({ connect: () => {} })
  createGain = () => ({ connect: () => {} })
}
class FakeRecorder {
  static isTypeSupported = () => true
  state = 'recording'
  mimeType = 'audio/webm'
  ondataavailable: unknown = null
  onstop: (() => void) | null = null
  start() {}
  requestData() {}
  stop() {
    this.state = 'inactive'
    this.onstop?.()
  }
}

describe('VoiceSession: the spoken language', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  async function session(ui: 'ru' | 'en', browser: string[], heard: string) {
    const track = { stop: () => {}, enabled: true }
    vi.stubGlobal('AudioContext', ListeningAudioContext)
    vi.stubGlobal('MediaRecorder', FakeRecorder)
    vi.stubGlobal('navigator', {
      languages: browser,
      mediaDevices: {
        getUserMedia: async () => ({
          getTracks: () => [track],
          getAudioTracks: () => [track],
        }),
      },
    })
    const hints: Array<string | null | undefined> = []
    const s = new VoiceSession({
      ...deps(),
      lang: () => ui,
      transcribe: async (_a: Blob, o?: { lang?: string | null }) => {
        hints.push(o?.lang)
        return heard
      },
    })
    await s.start()
    const phrase = () =>
      (s as unknown as { finishUtterance(): Promise<void> }).finishUtterance()
    return { s, hints, phrase }
  }

  it('named from the first phrase when the app and the browser agree', async () => {
    const { s, hints, phrase } = await session('ru', ['ru-RU'], 'Привет')
    await phrase()
    expect(hints).toEqual(['ru'])
    s.stop()
  })

  it('otherwise learned from what was heard, and re-checked now and then', async () => {
    const { s, hints, phrase } = await session(
      'ru',
      ['en-US'],
      'Открой мой календарь'
    )
    for (let i = 0; i < 7; i++) await phrase()
    expect(hints).toEqual([null, 'ru', 'ru', 'ru', 'ru', null, 'ru'])
    s.stop()
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
