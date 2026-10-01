/**
 * VOICE MODE: a hands-free conversation with the agent.
 *
 *   listening --(speech, then a pause)--> hearing --(words)--> thinking
 *       ^                                                         |
 *       +--------- speaking <--(first finished sentence)----------+
 *
 * - The mic stays open the whole time. Voice activity is detected on the
 *   device from the mic's own level against an adaptive noise floor, so no
 *   audio leaves the phone until somebody actually spoke.
 * - Each utterance is transcribed by OUR whisper (render /api/voice/transcribe)
 *   and then sent as an ordinary chat message: the agent keeps every tool it
 *   has, and the transcript in the chat shows the turn like any other.
 * - The answer is spoken sentence by sentence while it is still being written
 *   (lib/voice/sentences.ts), up to two sentences synthesised ahead.
 * - Speaking over the agent interrupts it (barge-in): playback stops at once
 *   and the new words are recorded.
 * - The mic and the voice each feed an AnalyserNode, which is what the logo
 *   visual reads (components/Voice/VoiceOrb.tsx).
 * - Opening voice mode asks the server to load the transcriber and the voice
 *   (warm), and once the session knows which language is spoken it names it
 *   to the transcriber (lib/voice/spokenLang.ts) -- the two biggest waits
 *   measured on 2026-10-02.
 * - No microphone is not the end of the conversation: the person can type,
 *   and the agent still answers aloud (`keyboard`, `type`).
 *
 * Nothing here is React. The page creates a session on a tap -- browsers,
 * and iOS above all, only open the mic and the speaker from a user gesture.
 */
import type { Language } from '@/atoms/language'
import type { Message } from '@/atoms/agentChat'
import { ReplyFollower } from './replyFollower'
import { hasMicApi, micErrorKey } from './micError'
import { RELEARN_EVERY, guessSpokenLang, seedSpokenLang } from './spokenLang'
import {
  synthesize as httpSynthesize,
  transcribe as httpTranscribe,
  warmVoice as httpWarm,
} from './voiceApi'

export type VoicePhase =
  | 'off'
  | 'starting'
  | 'listening'
  | 'hearing'
  | 'thinking'
  | 'speaking'
  | 'error'

export interface VoiceSnapshot {
  phase: VoicePhase
  /** What the person said last, as the transcriber heard it. */
  heard: string
  /** The sentence being spoken right now. */
  saying: string
  muted: boolean
  /** A dictionary key, never a raw message. */
  error: string | null
  /** True when the device's own voice is speaking because ours was unreachable. */
  fallbackVoice: boolean
  /** The microphone failed: the person types instead, and is still answered aloud. */
  keyboard: boolean
}

export interface VoiceDeps {
  lang: () => Language
  voice: () => string | null
  /** Send the words as a chat message in the current conversation. */
  send: (text: string) => void
  /** The current conversation's messages. */
  messages: () => readonly Message[]
  /** Is the current conversation answering (or has something queued)? */
  answering: () => boolean
  /** Call back whenever messages or the answering state change. */
  subscribe: (cb: () => void) => () => void
  transcribe?: typeof httpTranscribe
  synthesize?: typeof httpSynthesize
  warm?: typeof httpWarm
}

const TICK_MS = 40
const SPEECH_ONSET_MS = 160
const END_OF_TURN_MS = 850
const MAX_UTTERANCE_MS = 30_000
const IDLE_RESTART_MS = 12_000
const BARGE_IN_MS = 280
const SYNTH_AHEAD = 2

interface Spoken {
  text: string
  audio: Promise<AudioBuffer | null> | null
}

function pickMime(): string {
  const options = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg',
  ]
  if (typeof MediaRecorder === 'undefined') return ''
  return options.find(t => MediaRecorder.isTypeSupported?.(t)) || ''
}

export class VoiceSession {
  private snap: VoiceSnapshot = {
    phase: 'off',
    heard: '',
    saying: '',
    muted: false,
    error: null,
    fallbackVoice: false,
    keyboard: false,
  }
  private listeners = new Set<() => void>()

  private ctx: AudioContext | null = null
  private stream: MediaStream | null = null
  private micAnalyser: AnalyserNode | null = null
  private outAnalyser: AnalyserNode | null = null
  private outGain: GainNode | null = null
  private recorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private recordStartedAt = 0
  private timer: number | null = null
  private unsub: (() => void) | null = null
  /** Why the microphone failed, kept while the person types. */
  private micError: string | null = null

  // The language being spoken, once known (spokenLang.ts).
  private spokenLang: Language | null = null
  private phrases = 0

  // Voice activity state.
  private floor = 0.01
  private loudSince = 0
  private quietSince = 0
  private spoke = false

  // The answer being spoken.
  private follower: ReplyFollower | null = null
  private queue: Spoken[] = []
  private playing: AudioBufferSourceNode | null = null
  private utterance: SpeechSynthesisUtterance | null = null
  private pumping = false
  private generation = 0
  private readonly level = new Float32Array(2048)

  constructor(private readonly deps: VoiceDeps) {}

  // ---- the outside --------------------------------------------------------

  get snapshot(): VoiceSnapshot {
    return this.snap
  }

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  /**
   * The analyser the visual should read: the agent's voice while it speaks,
   * the person's mic otherwise.
   */
  analyser(): AnalyserNode | null {
    return this.snap.phase === 'speaking' && this.playing
      ? this.outAnalyser
      : this.micAnalyser
  }

  async start(): Promise<void> {
    if (this.snap.phase !== 'off' && this.snap.phase !== 'error') return
    // A retry after typing: the old audio graph goes before a new one.
    if (this.ctx) this.teardown()
    this.micError = null
    this.set({ phase: 'starting', error: null, keyboard: false })
    const gen = this.generation
    const lang = this.deps.lang()
    // Before the mic prompt: the person reading it is time the server can use.
    void (this.deps.warm || httpWarm)(lang, this.deps.voice())
    this.spokenLang = seedSpokenLang(
      lang,
      typeof navigator !== 'undefined' ? navigator.languages : undefined
    )
    this.phrases = 0
    let stream: MediaStream
    try {
      // Resumed inside the same tap that started us, or iOS keeps it silent.
      this.openContext()
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
    } catch (err) {
      if (gen !== this.generation) return
      this.teardown()
      this.micError = micErrorKey(err, hasMicApi())
      this.set({ phase: 'error', error: this.micError, keyboard: true })
      return
    }
    // Closed while the browser was still asking for the microphone: give
    // the microphone straight back instead of listening on a dead session.
    if (gen !== this.generation || !this.ctx) {
      stream.getTracks().forEach(t => t.stop())
      return
    }
    this.stream = stream
    const ctx = this.ctx
    this.micAnalyser = ctx.createAnalyser()
    this.micAnalyser.fftSize = 2048
    this.micAnalyser.smoothingTimeConstant = 0.6
    ctx.createMediaStreamSource(this.stream).connect(this.micAnalyser)
    this.openOutput()

    this.unsub = this.deps.subscribe(() => this.onThread())
    this.timer = window.setInterval(() => this.tick(), TICK_MS)
    this.listen()
  }

  /**
   * A typed question, for when there is no microphone. It goes to the chat
   * like a spoken one and the answer is spoken the same way. Called from the
   * form's submit, which is the gesture iOS wants before it plays sound.
   */
  type(text: string): void {
    const words = text.trim()
    if (!words || !this.snap.keyboard) return
    // A new question replaces whatever was still being said.
    this.silence()
    try {
      this.openContext()
      this.openOutput()
    } catch {
      // No Web Audio at all: the device's own voice reads the answer.
    }
    if (!this.unsub) this.unsub = this.deps.subscribe(() => this.onThread())
    this.set({ heard: words, saying: '', error: null })
    this.follower = new ReplyFollower(this.deps.messages())
    this.deps.send(words)
    this.set({ phase: 'thinking' })
    this.onThread()
  }

  stop(): void {
    this.generation++
    this.teardown()
    this.set({
      phase: 'off',
      saying: '',
      fallbackVoice: false,
      keyboard: false,
    })
  }

  toggleMute(): void {
    const muted = !this.snap.muted
    this.stream?.getAudioTracks().forEach(t => (t.enabled = !muted))
    if (muted) this.dropRecording()
    this.set({ muted })
    if (!muted && this.snap.phase === 'listening') this.listen()
  }

  /** Tap on the orb while it speaks: be quiet and listen. */
  interrupt(): void {
    if (this.snap.phase === 'speaking' || this.snap.phase === 'thinking') {
      this.silence()
      this.idle()
    }
  }

  // ---- listening ----------------------------------------------------------

  /** Nothing to say: listen, or -- with no microphone -- wait for typing. */
  private idle(): void {
    if (this.stream) return this.listen()
    if (this.snap.keyboard)
      this.set({ phase: 'error', error: this.micError, saying: '' })
  }

  private listen(): void {
    if (!this.stream) return
    this.set({ phase: 'listening', saying: '' })
    // A recording already running may hold the start of the next question.
    if (!this.recorder) this.beginRecording()
  }

  private beginRecording(): void {
    this.dropRecording()
    if (!this.stream || this.snap.muted) return
    const mime = pickMime()
    try {
      this.recorder = mime
        ? new MediaRecorder(this.stream, { mimeType: mime })
        : new MediaRecorder(this.stream)
    } catch {
      this.set({ phase: 'error', error: 'voice.error.recorder' })
      return
    }
    this.chunks = []
    this.spoke = false
    this.loudSince = 0
    this.quietSince = 0
    this.recordStartedAt = performance.now()
    this.recorder.ondataavailable = e => {
      if (e.data.size) this.chunks.push(e.data)
    }
    this.recorder.start(250)
  }

  private dropRecording(): void {
    const r = this.recorder
    this.recorder = null
    if (r && r.state !== 'inactive') {
      r.ondataavailable = null
      r.onstop = null
      try {
        r.stop()
      } catch {
        /* already stopped */
      }
    }
    this.chunks = []
  }

  private rms(): number {
    const a = this.micAnalyser
    if (!a) return 0
    const buf = this.level.subarray(0, a.fftSize)
    a.getFloatTimeDomainData(buf)
    let sum = 0
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
    return Math.sqrt(sum / buf.length)
  }

  private tick(): void {
    if (!this.micAnalyser || this.snap.muted) return
    const now = performance.now()
    const level = this.rms()
    const agentTalking = this.snap.phase === 'speaking'
    // The floor follows quiet slowly and loud never: speech must not raise it.
    if (!this.spoke && level < this.floor * 2.5) {
      this.floor = this.floor * 0.97 + level * 0.03
    }
    const threshold = agentTalking
      ? Math.max(0.05, this.floor * 7)
      : Math.max(0.014, this.floor * 3.2)
    const loud = level > threshold

    if (loud) {
      if (!this.loudSince) this.loudSince = now
      this.quietSince = 0
    } else {
      this.loudSince = 0
      if (!this.quietSince) this.quietSince = now
    }

    // Barge-in: the person talks over the agent.
    if (agentTalking && this.loudSince && now - this.loudSince > BARGE_IN_MS) {
      this.silence()
      this.set({ phase: 'listening', saying: '' })
      this.spoke = true
      if (!this.recorder) this.beginRecording()
      return
    }

    if (!this.recorder) {
      // Listen during thinking too, so barge-in has a recording to land in.
      if (this.snap.phase === 'thinking') this.beginRecording()
      return
    }

    if (
      !agentTalking &&
      !this.spoke &&
      this.loudSince &&
      now - this.loudSince > SPEECH_ONSET_MS
    ) {
      this.spoke = true
    }
    const long = now - this.recordStartedAt
    if (this.spoke) {
      const ended = this.quietSince && now - this.quietSince > END_OF_TURN_MS
      if (ended || long > MAX_UTTERANCE_MS) void this.finishUtterance()
    } else if (long > IDLE_RESTART_MS) {
      // Keep the recording short while nobody talks.
      this.beginRecording()
    }
  }

  private async finishUtterance(): Promise<void> {
    const r = this.recorder
    if (!r) return
    this.recorder = null
    const gen = this.generation
    const blob = await new Promise<Blob>(resolve => {
      r.onstop = () =>
        resolve(new Blob(this.chunks, { type: r.mimeType || 'audio/webm' }))
      try {
        r.requestData?.()
        r.stop()
      } catch {
        resolve(new Blob(this.chunks, { type: r.mimeType || 'audio/webm' }))
      }
    })
    if (gen !== this.generation) return
    const wasThinking = this.snap.phase === 'thinking'
    this.set({ phase: 'hearing' })
    let text = ''
    // Named when known, except one phrase in RELEARN_EVERY, which re-checks.
    const hint =
      this.phrases++ % RELEARN_EVERY === RELEARN_EVERY - 1
        ? null
        : this.spokenLang
    try {
      text = await (this.deps.transcribe || httpTranscribe)(blob, {
        lang: hint,
      })
      // Only an undirected transcript says which language it was: a directed
      // one is written in the language it was told.
      if (!hint) this.spokenLang = guessSpokenLang(text) || this.spokenLang
    } catch {
      if (gen !== this.generation) return
      this.set({ error: 'voice.error.hear' })
    }
    if (gen !== this.generation) return
    if (!text || isNoise(text)) {
      // Nothing worth sending: back to whatever was going on before.
      if (wasThinking && this.follower) {
        this.set({ phase: 'thinking' })
        this.beginRecording()
      } else this.listen()
      return
    }
    this.set({ heard: text, error: null })
    this.follower = new ReplyFollower(this.deps.messages())
    this.deps.send(text)
    this.set({ phase: 'thinking' })
    this.beginRecording()
    this.onThread()
  }

  // ---- speaking -----------------------------------------------------------

  private onThread(): void {
    const f = this.follower
    if (!f) return
    const sentences = f.update(this.deps.messages(), this.deps.answering())
    for (const text of sentences) this.queue.push({ text, audio: null })
    this.prefetch()
    void this.pump()
  }

  private prefetch(): void {
    for (let i = 0; i < Math.min(SYNTH_AHEAD + 1, this.queue.length); i++) {
      const item = this.queue[i]
      if (!item.audio) item.audio = this.render(item.text)
    }
  }

  private async render(text: string): Promise<AudioBuffer | null> {
    if (!this.ctx) return null
    try {
      const bytes = await (this.deps.synthesize || httpSynthesize)(
        text,
        this.deps.lang(),
        this.deps.voice()
      )
      return await this.ctx.decodeAudioData(bytes)
    } catch {
      return null
    }
  }

  private async pump(): Promise<void> {
    if (this.pumping) return
    this.pumping = true
    const gen = this.generation
    try {
      while (this.queue.length && gen === this.generation) {
        this.prefetch()
        const item = this.queue[0]
        const buffer = await item.audio
        if (gen !== this.generation) return
        this.set({ phase: 'speaking', saying: item.text })
        if (buffer) await this.playBuffer(buffer)
        else await this.speakWithDevice(item.text)
        if (gen !== this.generation) return
        this.queue.shift()
      }
      if (gen !== this.generation) return
      if (this.follower?.finished) {
        this.follower = null
        this.idle()
      } else if (this.follower) {
        this.set({ phase: 'thinking', saying: '' })
      }
    } finally {
      // silence() already freed the pump for the next generation.
      if (gen === this.generation) this.pumping = false
    }
  }

  private openContext(): void {
    if (this.ctx) {
      void this.ctx.resume()
      return
    }
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
    this.ctx = new Ctx()
    void this.ctx.resume()
  }

  /** The agent's voice goes through a gain and an analyser the visual reads. */
  private openOutput(): void {
    const ctx = this.ctx
    if (!ctx || this.outGain) return
    this.outAnalyser = ctx.createAnalyser()
    this.outAnalyser.fftSize = 2048
    this.outAnalyser.smoothingTimeConstant = 0.7
    this.outGain = ctx.createGain()
    this.outGain.connect(this.outAnalyser)
    this.outAnalyser.connect(ctx.destination)
  }

  private playBuffer(buffer: AudioBuffer): Promise<void> {
    return new Promise(resolve => {
      const ctx = this.ctx
      if (!ctx || !this.outGain) return resolve()
      const src = ctx.createBufferSource()
      src.buffer = buffer
      src.connect(this.outGain)
      src.onended = () => {
        if (this.playing === src) this.playing = null
        resolve()
      }
      this.playing = src
      this.set({ fallbackVoice: false })
      src.start()
    })
  }

  /** Our engine was unreachable: the device's own voice says it instead. */
  private speakWithDevice(text: string): Promise<void> {
    return new Promise(resolve => {
      const synth =
        typeof window !== 'undefined' ? window.speechSynthesis : undefined
      if (!synth) return resolve()
      const u = new SpeechSynthesisUtterance(text)
      u.lang = this.deps.lang() === 'ru' ? 'ru-RU' : 'en-US'
      u.onend = () => resolve()
      u.onerror = () => resolve()
      this.utterance = u
      this.set({ fallbackVoice: true })
      synth.speak(u)
    })
  }

  /** Stop speaking now and forget the rest of this answer. */
  private silence(): void {
    this.generation++
    this.queue = []
    this.follower = null
    this.pumping = false
    try {
      this.playing?.stop()
    } catch {
      /* already ended */
    }
    this.playing = null
    if (this.utterance) window.speechSynthesis?.cancel()
    this.utterance = null
  }

  private teardown(): void {
    this.silence()
    this.dropRecording()
    if (this.timer !== null) window.clearInterval(this.timer)
    this.timer = null
    this.unsub?.()
    this.unsub = null
    this.stream?.getTracks().forEach(t => t.stop())
    this.stream = null
    void this.ctx?.close().catch(() => undefined)
    this.ctx = null
    this.micAnalyser = null
    this.outAnalyser = null
    this.outGain = null
  }

  private set(patch: Partial<VoiceSnapshot>): void {
    this.snap = { ...this.snap, ...patch }
    for (const l of this.listeners) l()
  }
}

/*
 * Whisper's known hallucinations on near-silence (the Russian "to be
 * continued" and "subtitles by" captions, the English "thank you"). Sending
 * one to the agent because somebody coughed is worse than nothing.
 */
const NOISE = [
  /^[\s.,!?…-]*$/,
  // The whole utterance, not its start: "thank you, now open my calendar"
  // is a request.
  // cyrillic-ok-next-line
  /^(продолжение следует|субтитры[^.!?]*|редактор субтитров[^.!?]*|thank you|thanks for watching|thank you for watching)[\s.,!?…]*$/i,
]
export function isNoise(text: string): boolean {
  return NOISE.some(re => re.test(text.trim()))
}
