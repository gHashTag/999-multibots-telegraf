import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Message } from '@/atoms/agentChat'
import { VoiceSession, isNoise } from './session'

function deps() {
  return {
    lang: () => 'en' as const,
    voice: vi.fn((): string | null => null) as (
      lang: 'ru' | 'en'
    ) => string | null,
    send: vi.fn(),
    messages: (): readonly Message[] => [],
    answering: () => false,
    subscribe: (cb: () => void) => {
      void cb
      return () => {}
    },
    warm: vi.fn<(lang: string, voice: string | null) => Promise<void>>(
      async () => {}
    ),
    wakeRoad: vi.fn(),
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

/**
 * A session with no mic, typed into, over a fake conversation: the reply,
 * the answering flag and the store's notification are all in the test's hands.
 */
async function typedSession(extra: Record<string, unknown> = {}) {
  vi.stubGlobal('AudioContext', FakeAudioContext)
  vi.stubGlobal('navigator', {
    mediaDevices: { getUserMedia: () => Promise.reject(new Error('denied')) },
  })
  const c = {
    thread: [] as Message[],
    answering: false,
    changed: () => {},
  }
  const d = {
    ...deps(),
    send: vi.fn(() => {
      c.answering = true
    }),
    stop: vi.fn(() => {
      c.answering = false
    }),
    synthesize: vi.fn(async (): Promise<ArrayBuffer> => {
      throw new Error('offline')
    }),
    messages: () => c.thread,
    answering: () => c.answering,
    subscribe: (cb: () => void) => {
      c.changed = cb
      return () => {}
    },
    ...extra,
  }
  const s = new VoiceSession(d)
  await s.start()
  let n = 0
  const reply = async (text: string) => {
    n++
    c.thread = [
      ...c.thread,
      { id: `u${n}`, role: 'user', text: 'q' },
      { id: `a${n}`, role: 'assistant', text },
    ]
    c.answering = false
    c.changed()
    await flush()
  }
  return { s, d, c, reply }
}

describe('VoiceSession: stopping a slow answer', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('the orb while it thinks stops the answer itself, not only its sound', async () => {
    const { s, d } = await typedSession()
    s.type('a long question')
    expect(s.snapshot.phase).toBe('thinking')
    s.interrupt()
    expect(d.stop).toHaveBeenCalledTimes(1)
    expect(s.snapshot.phase).toBe('error')
  })

  it('a new question replaces the one still answering, it does not queue', async () => {
    const { s, d } = await typedSession()
    s.type('first')
    expect(d.stop).not.toHaveBeenCalled()
    s.type('second')
    expect(d.stop).toHaveBeenCalledTimes(1)
    expect(d.send).toHaveBeenLastCalledWith('second')
    // stop() came before the new send, or the new send would be stopped too.
    expect(d.stop.mock.invocationCallOrder[0]).toBeLessThan(
      d.send.mock.invocationCallOrder[1]
    )
    expect(s.snapshot).toMatchObject({ phase: 'thinking', heard: 'second' })
  })

  it('nothing to stop when the agent is idle', async () => {
    const { s, d } = await typedSession()
    s.interrupt()
    s.type('hello')
    expect(d.stop).not.toHaveBeenCalled()
  })

  it('the instant between leaving the queue and streaming does not end the wait', async () => {
    const { s, c, reply } = await typedSession()
    const said: string[] = []
    s.subscribe(() => {
      if (s.snapshot.saying) said.push(s.snapshot.saying)
    })
    s.type('queued')
    // drainQueue: off the queue (nobody answering, no reply) ...
    c.answering = false
    c.changed()
    // ... and in the same task the stream registers as busy.
    c.answering = true
    await flush()
    expect(s.snapshot.phase).toBe('thinking')
    await reply('Done.')
    expect(said).toContain('Done.')
  })
})

describe('VoiceSession: the language it speaks', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('a Russian answer under an English app is read by the Russian voice', async () => {
    const voice = vi.fn((l: 'ru' | 'en') => (l === 'ru' ? 'irina' : 'heart'))
    const { s, d, reply } = await typedSession({ voice })
    s.type('как дела')
    await reply('Открой Google Docs.')
    s.type('and in English?')
    await reply('Yes, it answers.')
    const calls = d.synthesize.mock.calls as unknown as unknown[][]
    expect(calls.map(c => c.slice(0, 3))).toEqual([
      ['Открой Google Docs.', 'ru', 'irina'],
      ['Yes, it answers.', 'en', 'heart'],
    ])
  })

  it('the device voice too is told the sentence language', async () => {
    const spoken: string[] = []
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        lang = ''
        onend: (() => void) | null = null
        onerror: (() => void) | null = null
        constructor(public text: string) {}
      }
    )
    vi.stubGlobal('speechSynthesis', {
      cancel: () => {},
      speak: (u: { lang: string; onend: () => void }) => {
        spoken.push(u.lang)
        u.onend()
      },
    })
    const { s, reply } = await typedSession()
    s.type('q')
    await reply('Привет.')
    expect(spoken).toEqual(['ru-RU'])
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
    const d = deps()
    const s = new VoiceSession({
      ...d,
      lang: () => ui,
      transcribe: async (_a: Blob, o?: { lang?: string | null }) => {
        hints.push(o?.lang)
        return heard
      },
    })
    await s.start()
    const phrase = () =>
      (s as unknown as { finishUtterance(): Promise<void> }).finishUtterance()
    return { s, d, hints, phrase }
  }

  it('named from the first phrase when the app and the browser agree', async () => {
    const { s, hints, phrase } = await session('ru', ['ru-RU'], 'Привет')
    await phrase()
    expect(hints).toEqual(['ru'])
    s.stop()
  })

  it('otherwise learned from what was heard, and re-checked now and then', async () => {
    const { s, d, hints, phrase } = await session(
      'ru',
      ['en-US'],
      'Открой мой календарь'
    )
    for (let i = 0; i < 7; i++) await phrase()
    expect(hints).toEqual([null, 'ru', 'ru', 'ru', 'ru', null, 'ru'])
    // Learning a language warms its voice once, not on every re-check.
    expect(d.warm.mock.calls.map(c => c[0])).toEqual(['ru', 'ru'])
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

/**
 * A listening session whose answers are read by a device voice the test holds:
 * a sentence is "being said" until `endSentence()`. The transcriber returns
 * the next of `heard` on each utterance.
 */
async function speakingSession(
  heard: string[],
  Recorder: typeof FakeRecorder = FakeRecorder
) {
  const level = { value: 0 }
  class LoudContext extends ListeningAudioContext {
    createAnalyser = () => ({
      fftSize: 2048,
      smoothingTimeConstant: 0,
      connect: () => {},
      getFloatTimeDomainData: ((b: Float32Array) => {
        b.fill(level.value)
      }) as () => void,
    })
  }
  const track = { stop: () => {}, enabled: true }
  vi.stubGlobal('AudioContext', LoudContext)
  vi.stubGlobal('MediaRecorder', Recorder)
  vi.stubGlobal('navigator', {
    languages: ['en-US'],
    mediaDevices: {
      getUserMedia: async () => ({
        getTracks: () => [track],
        getAudioTracks: () => [track],
      }),
    },
  })
  const spoken: string[] = []
  let ending: (() => void) | null = null
  vi.stubGlobal(
    'SpeechSynthesisUtterance',
    class {
      lang = ''
      onend: (() => void) | null = null
      onerror: (() => void) | null = null
      constructor(public text: string) {}
    }
  )
  vi.stubGlobal('speechSynthesis', {
    cancel: () => {
      ending = null
    },
    speak: (u: { text: string; onend: () => void }) => {
      spoken.push(u.text)
      ending = u.onend
    },
  })
  let now = 1000
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  const c = { thread: [] as Message[], answering: false, changed: () => {} }
  const d = {
    ...deps(),
    send: vi.fn(() => {
      c.answering = true
    }),
    stop: vi.fn(() => {
      c.answering = false
    }),
    synthesize: vi.fn(async (): Promise<ArrayBuffer> => {
      throw new Error('offline')
    }),
    transcribe: vi.fn(async () => heard.shift() ?? ''),
    messages: () => c.thread,
    answering: () => c.answering,
    subscribe: (cb: () => void) => {
      c.changed = cb
      return () => {}
    },
  }
  const s = new VoiceSession(d)
  await s.start()
  const inner = s as unknown as {
    tick(): void
    finishUtterance(): Promise<void>
  }
  let n = 0
  return {
    s,
    d,
    spoken,
    level,
    tick: (at: number) => {
      now = at
      inner.tick()
    },
    utterance: async () => {
      await inner.finishUtterance()
      await flush()
    },
    endSentence: async () => {
      const e = ending
      ending = null
      e?.()
      await flush()
    },
    /** A new answer: whole, or (`streaming`) its first part. */
    reply: async (text: string, streaming = false) => {
      n++
      c.thread = [
        ...c.thread,
        { id: `u${n}`, role: 'user', text: 'q' },
        { id: `a${n}`, role: 'assistant', text },
      ]
      c.answering = streaming
      c.changed()
      await flush()
    },
    /** More of the answer streams in. */
    stream: async (text: string) => {
      c.thread = [
        ...c.thread.filter(m => m.id !== `a${n}`),
        { id: `a${n}`, role: 'assistant', text },
      ]
      c.changed()
      await flush()
    },
  }
}

const ANSWER =
  'The first long sentence of the answer. The second long sentence of it.'

describe('VoiceSession: talking over the agent', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  /** Asked, answered, and the first sentence is being said at t=2000. */
  async function midAnswer(heard: string[]) {
    const v = await speakingSession(['what is new', ...heard])
    await v.utterance()
    await v.reply(ANSWER)
    expect(v.s.snapshot).toMatchObject({
      phase: 'speaking',
      saying: 'The first long sentence of the answer.',
    })
    return v
  }

  /** Loud from t=2300 on (the sentence began at t=1000), sampled up to `until`. */
  function talkOver(
    v: { level: { value: number }; tick(at: number): void },
    until: number
  ) {
    v.level.value = 0.5
    for (let t = 2300; t <= until; t += 40) v.tick(t)
  }

  it('a short sound does not stop it; half a second of talking does', async () => {
    const v = await midAnswer([])
    talkOver(v, 2300 + 400)
    expect(v.s.snapshot.phase).toBe('speaking')
    expect(v.d.wakeRoad).not.toHaveBeenCalled()
    talkOver(v, 2300 + 560)
    expect(v.s.snapshot.phase).toBe('listening')
    // Talking over the answer is a new phrase too: its road is woken.
    expect(v.d.wakeRoad).toHaveBeenCalledTimes(1)
  })

  it('a cough held it, and the answer goes on from the cut sentence', async () => {
    const v = await midAnswer(['Угу.'])
    talkOver(v, 2900)
    expect(v.s.snapshot.phase).toBe('listening')
    await v.utterance()
    expect(v.d.send).toHaveBeenCalledTimes(1)
    expect(v.d.stop).not.toHaveBeenCalled()
    expect(v.spoken).toEqual([
      'The first long sentence of the answer.',
      'The first long sentence of the answer.',
    ])
    await v.endSentence()
    expect(v.spoken.at(-1)).toBe('The second long sentence of it.')
  })

  it('its own voice coming back through the speaker is not a question', async () => {
    const v = await midAnswer(['the first long sentence of the answer'])
    talkOver(v, 2900)
    await v.utterance()
    expect(v.d.send).toHaveBeenCalledTimes(1)
    expect(v.s.snapshot.phase).toBe('speaking')
  })

  it('real words over it become the new question, and the old answer stops', async () => {
    const v = await midAnswer(['wait, open my calendar instead'])
    talkOver(v, 2900)
    await v.utterance()
    expect(v.d.send).toHaveBeenLastCalledWith('wait, open my calendar instead')
    expect(v.s.snapshot.phase).toBe('thinking')
    await v.endSentence()
    expect(v.spoken).toEqual(['The first long sentence of the answer.'])
  })

  it("the sentence's own onset in the mic is not the person", async () => {
    const v = await midAnswer([])
    v.level.value = 0.5
    for (let t = 1040; t <= 1800; t += 40) v.tick(t)
    expect(v.s.snapshot.phase).toBe('speaking')
  })

  it('held, it stays quiet while more of the answer streams in', async () => {
    const v = await speakingSession(['what is new', 'Угу.'])
    await v.utterance()
    await v.reply('The first long sentence of the answer. The sec', true)
    expect(v.spoken).toEqual(['The first long sentence of the answer.'])
    talkOver(v, 2900)
    await v.stream(`${ANSWER} And a third one is coming`)
    expect(v.spoken).toHaveLength(1)
    await v.utterance()
    expect(v.spoken).toHaveLength(2)
  })

  it('the orb stops a held answer too', async () => {
    const v = await midAnswer([])
    talkOver(v, 2900)
    v.s.interrupt()
    expect(v.d.stop).toHaveBeenCalledTimes(1)
  })

  it('cards are named at the end, never read as markup', async () => {
    const v = await speakingSession(['what can you do'])
    await v.utterance()
    await v.reply(
      'Two ways to go about this one.\n[[card: Make a reel | from photos]]\n[[card: Write a post | short]]'
    )
    await v.endSentence()
    expect(v.spoken).toEqual([
      'Two ways to go about this one.',
      'You can choose: Make a reel, Write a post.',
    ])
  })
})

describe('isBackchannel and isEcho', () => {
  it('"uh-huh" is listening; a request that starts with "yes" is not', async () => {
    const { isBackchannel } = await import('./session')
    expect(isBackchannel('Угу.')).toBe(true)
    expect(isBackchannel('Mm-hmm, okay.')).toBe(true)
    expect(isBackchannel('Да, да.')).toBe(true)
    expect(isBackchannel('Да, открой календарь')).toBe(false)
    expect(isBackchannel('yes and send it to Anna')).toBe(false)
  })

  it('the transcript of our own sentence is an echo; a new request is not', async () => {
    const { isEcho } = await import('./session')
    const said = 'Сегодня в календаре три встречи, первая в десять.'
    expect(isEcho('сегодня в календаре три встречи', said)).toBe(true)
    expect(isEcho('отмени первую встречу', said)).toBe(false)
    expect(isEcho('anything', '')).toBe(false)
  })
})

describe('VoiceSession: a sound that never ends', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('is given up after its length and a grace, so the answer goes on', async () => {
    vi.useFakeTimers()
    const stopped = vi.fn()
    const src = {
      buffer: null,
      onended: null as null | (() => void),
      connect: () => {},
      start: () => {},
      stop: stopped,
    }
    const s = new VoiceSession(deps())
    const inner = s as unknown as {
      ctx: unknown
      outGain: unknown
      playBuffer(b: { duration: number }): Promise<void>
    }
    // A context the system suspended: start() plays nothing, onended never comes.
    inner.ctx = {
      state: 'suspended',
      resume: async () => {},
      createBufferSource: () => src,
    }
    inner.outGain = {}
    let over = false
    void inner.playBuffer({ duration: 2 }).then(() => (over = true))
    await vi.advanceTimersByTimeAsync(2000 + 1400)
    expect(over).toBe(false)
    await vi.advanceTimersByTimeAsync(200)
    expect(over).toBe(true)
    expect(stopped).toHaveBeenCalled()
  })
})

/** A recorder that hands over what it has whenever it is asked, as browsers do. */
class DeliveringRecorder extends FakeRecorder {
  requestData() {
    ;(this.ondataavailable as ((e: { data: Blob }) => void) | null)?.({
      data: new Blob(['opus']),
    })
  }
}
class SafariRecorder extends DeliveringRecorder {
  mimeType = 'audio/mp4'
}

describe('VoiceSession: a fan is the room, not a phrase', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  /** Every tick from `from` to `to`, at `level(t)`. */
  function hold(
    v: { level: { value: number }; tick(at: number): void },
    from: number,
    to: number,
    level: (t: number) => number
  ) {
    for (let t = from; t <= to; t += 40) {
      v.level.value = level(t)
      v.tick(t)
    }
  }
  const fan = () => 0.3
  /** Syllables over the fan: loud 240 ms, then a dip to the fan. */
  const voice = (t: number) => (t % 320 < 240 ? 1.5 : 0.3)

  it('a fan switched on is never sent to be heard, however long it runs', async () => {
    const made: FakeRecorder[] = []
    class Recorder extends FakeRecorder {
      constructor() {
        super()
        made.push(this)
      }
    }
    const v = await speakingSession(['whirr'], Recorder)
    hold(v, 1100, 4000, fan)
    // The recording that held the fan's first seconds is gone, not kept.
    expect(made.length).toBeGreaterThan(1)
    expect(made[0].state).toBe('inactive')
    hold(v, 4040, 1100 + 31_000, fan)
    await flush()
    expect(v.d.transcribe).not.toHaveBeenCalled()
    expect(v.d.send).not.toHaveBeenCalled()
    expect(v.s.snapshot.phase).toBe('listening')
  })

  it('a question asked over the fan is heard when it ends, not at 30 s', async () => {
    const v = await speakingSession(['open my calendar'])
    hold(v, 1100, 4000, fan)
    hold(v, 4040, 5500, voice)
    hold(v, 5540, 5540 + 1000, fan)
    await flush()
    expect(v.d.transcribe).toHaveBeenCalledTimes(1)
    expect(v.d.send).toHaveBeenCalledWith('open my calendar')
  })

  it('a fan that cut into the answer lets it go on, unheard', async () => {
    const v = await speakingSession(['what is new'])
    await v.utterance()
    await v.reply(ANSWER)
    hold(v, 2300, 2900, fan)
    expect(v.s.snapshot.phase).toBe('listening')
    hold(v, 2940, 5000, fan)
    await flush()
    expect(v.s.snapshot.phase).toBe('speaking')
    expect(v.d.transcribe).toHaveBeenCalledTimes(1)
    expect(v.spoken).toEqual([
      'The first long sentence of the answer.',
      'The first long sentence of the answer.',
    ])
  })
})

describe('VoiceSession: the bytes a phrase costs', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('records speech at 32 kbit/s, not the browser music rate', async () => {
    const made: unknown[] = []
    class Recorder extends FakeRecorder {
      constructor(_s?: unknown, opts?: unknown) {
        super()
        made.push(opts)
      }
    }
    await speakingSession([], Recorder)
    expect(made[0]).toEqual({
      mimeType: 'audio/webm;codecs=opus',
      audioBitsPerSecond: 32_000,
    })
  })

  it('a browser that refuses the rate still records', async () => {
    const made: unknown[] = []
    class Picky extends DeliveringRecorder {
      constructor(_s?: unknown, opts?: { audioBitsPerSecond?: number }) {
        if (opts?.audioBitsPerSecond) throw new Error('NotSupportedError')
        super()
        made.push(opts)
      }
    }
    const v = await speakingSession(['open my calendar'], Picky)
    expect(made[0]).toEqual({ mimeType: 'audio/webm;codecs=opus' })
    expect(v.s.snapshot.error).toBeNull()
  })
})

describe('VoiceSession: hearing the words while the pause is judged', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  /** Loud from `from` to `to`, then quiet up to `until`, one tick each 40 ms. */
  function say(
    v: { level: { value: number }; tick(at: number): void },
    from: number,
    to: number,
    until = to
  ) {
    for (let t = from; t <= until; t += 40) {
      v.level.value = t <= to ? 0.5 : 0
      v.tick(t)
    }
  }

  it('asks for the words early and sends them when the turn ends, heard once', async () => {
    const v = await speakingSession(['open my calendar'], DeliveringRecorder)
    say(v, 1100, 1600, 1600 + 400)
    // The pause is not over yet, and the words are already being heard.
    expect(v.d.transcribe).toHaveBeenCalledTimes(1)
    expect(v.d.send).not.toHaveBeenCalled()
    say(v, 2040, 0, 2040 + 600)
    await flush()
    expect(v.d.transcribe).toHaveBeenCalledTimes(1)
    expect(v.d.send).toHaveBeenCalledWith('open my calendar')
  })

  it('speaking again throws the early words away', async () => {
    const v = await speakingSession(
      ['open my', 'open my calendar'],
      DeliveringRecorder
    )
    say(v, 1100, 1600, 1600 + 400)
    const first = v.d.transcribe.mock.calls[0] as unknown as [
      Blob,
      { signal?: AbortSignal },
    ]
    say(v, 2040, 2400, 2400 + 1000)
    await flush()
    expect(first[1].signal?.aborted).toBe(true)
    expect(v.d.send).toHaveBeenCalledTimes(1)
    expect(v.d.send).toHaveBeenCalledWith('open my calendar')
  })

  it('an early guess that failed is not the end: the whole phrase is heard', async () => {
    const v = await speakingSession(['open my calendar'], DeliveringRecorder)
    v.d.transcribe.mockImplementationOnce(async () => {
      throw new Error('503')
    })
    say(v, 1100, 1600, 1600 + 1000)
    await flush()
    expect(v.d.transcribe).toHaveBeenCalledTimes(2)
    expect(v.d.send).toHaveBeenCalledWith('open my calendar')
    expect(v.s.snapshot.error).toBeNull()
  })

  it('the road is woken as the person starts talking, once a phrase', async () => {
    const v = await speakingSession(['open my calendar'], DeliveringRecorder)
    say(v, 1100, 1200)
    // Not yet: 100 ms of sound may be a click, not a person.
    expect(v.d.wakeRoad).not.toHaveBeenCalled()
    say(v, 1240, 1600)
    // Woken while they still talk -- before the words are asked for.
    expect(v.d.wakeRoad).toHaveBeenCalledTimes(1)
    expect(v.d.transcribe).not.toHaveBeenCalled()
    say(v, 1640, 0, 1640 + 1000)
    await flush()
    expect(v.d.send).toHaveBeenCalledWith('open my calendar')
    expect(v.d.wakeRoad).toHaveBeenCalledTimes(1)
  })

  it("Safari's mp4 cannot be cut short, so it is heard only at the end", async () => {
    const v = await speakingSession(['open my calendar'], SafariRecorder)
    say(v, 1100, 1600, 1600 + 600)
    expect(v.d.transcribe).not.toHaveBeenCalled()
    say(v, 2240, 0, 2240 + 400)
    await flush()
    expect(v.d.transcribe).toHaveBeenCalledTimes(1)
    expect(v.d.send).toHaveBeenCalledWith('open my calendar')
  })
})
