/**
 * VOICE MODE: a hands-free conversation with the agent.
 *
 *   listening --(speech, then a pause)--> hearing --(words)--> thinking
 *       ^                                                         |
 *       +--------- speaking <--(first finished sentence)----------+
 *
 * - The mic stays open the whole time. Voice activity is detected on the
 *   device from the mic's own level against an adaptive noise floor, so no
 *   audio leaves the phone until somebody actually spoke (lib/voice/vad.ts;
 *   a fan or an engine is learned as the room, not heard as a phrase).
 * - Each utterance is transcribed by OUR whisper (render /api/voice/transcribe)
 *   and then sent as an ordinary chat message: the agent keeps every tool it
 *   has, and the transcript in the chat shows the turn like any other.
 * - The words are asked for 300 ms into the pause that ends a phrase, while
 *   the pause is still being judged, and thrown away if the person goes on
 *   (EAGER_HEAR_MS): the turn's end no longer waits for the words too.
 * - The answer is spoken sentence by sentence while it is still being written
 *   (lib/voice/sentences.ts), up to two sentences synthesised ahead.
 * - Speaking over the agent PAUSES it (barge-in): playback stops at once and
 *   the new words are recorded. Words become a new question; a cough, a
 *   "mm", or the agent's own voice coming back through the speaker resumes
 *   the answer from the sentence it was cut in (`paused`, `isEcho`). Until
 *   2026-10-02 any loud noise threw the rest of the answer away for good.
 * - Cards the agent proposes are not read as markup; their titles are named
 *   at the end of the answer, since a listener cannot see the buttons.
 * - A new question -- spoken, typed, or the
 *   Stop button -- also stops the answer on the server: otherwise it would
 *   queue behind the slow answer it was meant to replace (owner, 2026-10-02:
 *   "I want to interrupt when it is stuck").
 * - Each sentence is spoken in the language it is WRITTEN in, not the app's:
 *   a Russian answer under an English interface was read by the English
 *   voice (owner, 2026-10-02: "she does not speak Russian").
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
import { translations, type Language } from '@/atoms/language'
import type { Message } from '@/atoms/agentChat'
import { ReplyFollower } from './replyFollower'
import { hasMicApi, micErrorKey } from './micError'
import {
  RELEARN_EVERY,
  guessSpokenLang,
  seedSpokenLang,
  sentenceLang,
} from './spokenLang'
import {
  synthesize as httpSynthesize,
  transcribe as httpTranscribe,
  wakeRoad as httpWakeRoad,
  warmVoice as httpWarm,
} from './voiceApi'
import { END_OF_TURN_MS, LevelGate, TICK_MS, TurnClock, rms } from './vad'

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
  /** The app's language: the fallback when nothing better is known. */
  lang: () => Language
  /** The voice the person picked for this language, null for the default. */
  voice: (lang: Language) => string | null
  /** Send the words as a chat message in the current conversation. */
  send: (text: string) => void
  /** The current conversation's messages. */
  messages: () => readonly Message[]
  /** Is the current conversation answering (or has something queued)? */
  answering: () => boolean
  /** Call back whenever messages or the answering state change. */
  subscribe: (cb: () => void) => () => void
  /** Stop the answer being written (and anything queued behind it). */
  stop?: () => void
  transcribe?: typeof httpTranscribe
  synthesize?: typeof httpSynthesize
  warm?: typeof httpWarm
  /** Reopen a quiet connection to the server while the person talks. */
  wakeRoad?: () => void
}

/*
 * EAGER HEARING. The 850 ms of silence that ends a turn was, after GigaAM
 * (#3252), the longest wait left: Russian is heard in ~745 ms, so the person
 * waited for the pause to be judged, then for the words. Now the words are
 * asked for after the first EAGER_HEAR_MS of silence, while the pause is
 * still being judged. If the person speaks again the guess is thrown away;
 * if the turn ends, the words are usually already here. Only text is
 * guessed -- nothing is SENT to the agent before the turn ends, because a
 * question can have side effects (an invoice, a message). Deepgram Flux
 * (EagerEndOfTurn) and LiveKit (preemptive generation) do the same.
 */
const EAGER_HEAR_MS = 300
/*
 * The rate a phrase is recorded at. Chrome's own is 128 kbit/s (measured
 * 2026-10-02: 48 KB for 3 s), music quality, for ears that hear 16 kHz mono
 * anyway -- and every byte is uploaded after the person stops talking, across
 * an edge ~250 ms from the render: 33 KB took 0.5-1 s of the road. Opus
 * speech is clear at 32 kbit/s, a quarter of the bytes.
 */
const SPEECH_BITS_PER_SECOND = 32_000
const MAX_UTTERANCE_MS = 30_000
const IDLE_RESTART_MS = 12_000
/*
 * Talk over the agent this long to stop it. Was 280 ms, the most
 * trigger-happy setting of any stack surveyed on 2026-10-02 (LiveKit 500,
 * Hume 800): a cough or a door cut answers off.
 */
const BARGE_IN_MS = 500
/* The first moments of each sentence are its own onset in the mic, not a person. */
const ONSET_DEAF_MS = 150
const SYNTH_AHEAD = 2
/*
 * A sentence whose audio never reports its end -- iOS suspends the audio
 * context on a call or a lock and `ended` never fires -- would keep the
 * session "speaking" forever. Past its own length plus this, it is over.
 */
const PLAYBACK_GRACE_MS = 1500

/** Words asked for while the pause was still being judged. */
interface EagerHearing {
  hint: Language | null
  text: Promise<string>
  abort: AbortController
}

/*
 * A webm or ogg recording cut after any chunk is still a file the server can
 * read; Safari's mp4 writes its index at the end, so it is never guessed.
 */
function canHearEarly(mime: string): boolean {
  return /webm|ogg/i.test(mime)
}

interface Spoken {
  text: string
  audio: Promise<AudioBuffer | null> | null
}

/*
 * Echo cancellation for EVERYTHING the page plays. Plain `true` lets Chrome
 * cancel only audio arriving over WebRTC, and ours is Web Audio, so the agent
 * heard itself; Chrome 141 added 'all'. A browser that rejects the word gets
 * the old constraint -- a refusal of the microphone itself is not retried.
 */
async function openMic(): Promise<MediaStream> {
  const audio = (echoCancellation: boolean | string) =>
    ({
      echoCancellation,
      noiseSuppression: true,
      autoGainControl: true,
    }) as MediaTrackConstraints
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: audio('all') })
  } catch (err) {
    const name = (err as { name?: string } | null)?.name
    if (name !== 'TypeError' && name !== 'OverconstrainedError') throw err
    return navigator.mediaDevices.getUserMedia({ audio: audio(true) })
  }
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
  /** The words of the recording so far, asked for at the start of a pause. */
  private eager: EagerHearing | null = null
  /** A chunk was requested for the eager guess and has not come yet. */
  private eagerWanted = false
  private recordStartedAt = 0
  private timer: number | null = null
  private unsub: (() => void) | null = null
  /** Why the microphone failed, kept while the person types. */
  private micError: string | null = null

  // The language being spoken, once known (spokenLang.ts).
  private spokenLang: Language | null = null
  private phrases = 0

  // Voice activity state.
  private gate = new LevelGate()
  private turn = new TurnClock()

  // The answer being spoken.
  private follower: ReplyFollower | null = null
  private queue: Spoken[] = []
  private playing: AudioBufferSourceNode | null = null
  private utterance: SpeechSynthesisUtterance | null = null
  private pumping = false
  /** Barge-in held the answer: it resumes if the words turn out to be noise. */
  private paused = false
  /** When the current sentence began to sound. */
  private soundingSince = 0
  private threadCheck = false
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
    this.warm(lang)
    this.spokenLang = seedSpokenLang(
      lang,
      typeof navigator !== 'undefined' ? navigator.languages : undefined
    )
    this.phrases = 0
    let stream: MediaStream
    try {
      // Resumed inside the same tap that started us, or iOS keeps it silent.
      this.openContext()
      stream = await openMic()
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

    this.unsub = this.deps.subscribe(() => this.threadChanged())
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
    if (!this.unsub)
      this.unsub = this.deps.subscribe(() => this.threadChanged())
    this.ask(words)
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

  /**
   * The orb or the Stop button while the agent thinks or speaks: stop the
   * answer itself, not only its sound, and listen.
   */
  interrupt(): void {
    if (
      this.paused ||
      this.snap.phase === 'speaking' ||
      this.snap.phase === 'thinking'
    ) {
      if (this.follower || this.deps.answering()) this.deps.stop?.()
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
    const typed = mime ? { mimeType: mime } : {}
    try {
      this.recorder = new MediaRecorder(this.stream, {
        ...typed,
        audioBitsPerSecond: SPEECH_BITS_PER_SECOND,
      })
    } catch {
      // A browser that refuses the rate still records at its own.
      try {
        this.recorder = new MediaRecorder(this.stream, typed)
      } catch {
        this.set({ phase: 'error', error: 'voice.error.recorder' })
        return
      }
    }
    this.chunks = []
    this.turn.reset()
    this.recordStartedAt = performance.now()
    this.recorder.ondataavailable = e => {
      if (e.data.size) this.chunks.push(e.data)
      if (this.eagerWanted) this.hearEarly()
    }
    this.recorder.start(250)
  }

  private dropRecording(): void {
    this.dropEager()
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
    return rms(buf)
  }

  private tick(): void {
    if (!this.micAnalyser || this.snap.muted) return
    const now = performance.now()
    const agentTalking = this.snap.phase === 'speaking'
    const turn = this.turn
    const judged = this.gate.judge(now, this.rms(), !turn.spoke, agentTalking)
    if (judged === 'steady') {
      // The room got loud and stayed flat: whatever it started was no phrase.
      this.roomChanged()
      return
    }
    const loud = judged === 'loud'
    turn.mark(now, loud)
    // More words: the guess made at the start of the pause is short of them.
    if (loud) this.dropEager()

    // Barge-in: the person talks over the agent. Held, not dropped, until
    // the words say whether it was a question or a cough.
    if (
      agentTalking &&
      turn.loudSince &&
      now - turn.loudSince > BARGE_IN_MS &&
      turn.loudSince - this.soundingSince > ONSET_DEAF_MS
    ) {
      this.pause()
      this.set({ phase: 'listening', saying: '' })
      turn.spoke = true
      this.wakeRoad()
      if (!this.recorder) this.beginRecording()
      return
    }

    if (!this.recorder) {
      // Listen during thinking too, so barge-in has a recording to land in.
      if (this.snap.phase === 'thinking') this.beginRecording()
      return
    }

    if (!agentTalking && turn.onset(now)) this.wakeRoad()
    const long = now - this.recordStartedAt
    if (turn.spoke) {
      const quiet = turn.quiet(now)
      const ended = quiet > END_OF_TURN_MS
      if (ended || long > MAX_UTTERANCE_MS) void this.finishUtterance()
      else if (
        quiet > EAGER_HEAR_MS &&
        !this.eager &&
        !this.eagerWanted &&
        canHearEarly(this.recorder.mimeType)
      ) {
        // The chunk holding the last words comes with the next data event.
        this.eagerWanted = true
        try {
          this.recorder.requestData()
        } catch {
          this.eagerWanted = false
        }
      }
    } else if (long > IDLE_RESTART_MS) {
      // Keep the recording short while nobody talks.
      this.beginRecording()
    }
  }

  /** The language to name to the transcriber for the next phrase. */
  private nextHint(): Language | null {
    // Named when known, except one phrase in RELEARN_EVERY, which re-checks.
    return this.phrases % RELEARN_EVERY === RELEARN_EVERY - 1
      ? null
      : this.spokenLang
  }

  /**
   * A steady noise -- a fan, an engine -- is the room now (vad.ts). Before
   * cycle 8 it was a phrase that ran to MAX_UTTERANCE_MS, and a question
   * asked over it waited up to 30 s. What it started is dropped unheard; an
   * answer it held goes on.
   */
  private roomChanged(): void {
    if (this.paused) this.resumeHeld()
    else if (this.turn.spoke && this.recorder) this.beginRecording()
    else this.turn.reset()
  }

  /** The held answer goes on from the sentence it was cut in. */
  private resumeHeld(): void {
    this.paused = false
    this.beginRecording()
    void this.pump()
  }

  /** Ask for the words recorded so far, before the turn is known to be over. */
  private hearEarly(): void {
    this.eagerWanted = false
    const r = this.recorder
    if (!r || this.eager || !this.chunks.length) return
    const blob = new Blob(this.chunks, { type: r.mimeType || 'audio/webm' })
    const hint = this.nextHint()
    const abort = new AbortController()
    const text = (this.deps.transcribe || httpTranscribe)(blob, {
      lang: hint,
      signal: abort.signal,
    })
    // Thrown away unheard is not an error anybody should see.
    text.catch(() => {})
    this.eager = { hint, text, abort }
  }

  private dropEager(): void {
    this.eagerWanted = false
    this.eager?.abort.abort()
    this.eager = null
  }

  private async finishUtterance(): Promise<void> {
    const r = this.recorder
    if (!r) return
    this.recorder = null
    // Taken before the stop below, whose last chunk must not start a new one.
    const eager = this.eager
    this.eager = null
    this.eagerWanted = false
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
    const cut = this.paused ? this.queue[0]?.text || '' : ''
    this.set({ phase: 'hearing' })
    // Heard: the three-second wait for the words is not silence to wonder at.
    if (!this.paused) this.cue()
    let text = ''
    const hint = this.nextHint()
    this.phrases++
    try {
      // Nothing was said after the guess, so its words are the turn's words;
      // a guess that failed is not the end -- the whole recording is heard.
      let early: string | null = null
      if (eager && eager.hint === hint)
        early = await eager.text.catch(() => null)
      else eager?.abort.abort()
      if (gen !== this.generation) return
      text =
        early ??
        (await (this.deps.transcribe || httpTranscribe)(blob, {
          lang: hint,
        }))
      // Only an undirected transcript says which language it was: a directed
      // one is written in the language it was told.
      if (!hint) {
        const learned = guessSpokenLang(text)
        if (learned && learned !== this.spokenLang) this.warm(learned)
        this.spokenLang = learned || this.spokenLang
      }
    } catch {
      if (gen !== this.generation) return
      // A held answer goes on rather than wait for words that never came.
      if (!this.paused) this.set({ error: 'voice.error.hear' })
    }
    if (gen !== this.generation) return
    if (
      this.paused &&
      (!text || isNoise(text) || isBackchannel(text) || isEcho(text, cut))
    ) {
      // A false barge-in: the answer goes on from the sentence it was cut in.
      this.resumeHeld()
      return
    }
    if (!text || isNoise(text)) {
      // Nothing worth sending: back to whatever was going on before.
      if (wasThinking && this.follower) {
        this.set({ phase: 'thinking' })
        this.beginRecording()
      } else this.listen()
      return
    }
    this.ask(text)
    this.beginRecording()
  }

  /** Send a question; one still being answered is stopped, not queued behind. */
  private ask(text: string): void {
    if (this.follower || this.deps.answering()) {
      this.deps.stop?.()
      this.silence()
    }
    this.set({ heard: text, saying: '', error: null })
    this.follower = new ReplyFollower(this.deps.messages())
    this.deps.send(text)
    this.set({ phase: 'thinking' })
    this.onThread()
  }

  /*
   * The person has started a phrase: if the connection went quiet, reopen it
   * now, so its handshake runs while they talk (voiceApi.ts, THE ROAD).
   */
  private wakeRoad(): void {
    const wake = this.deps.wakeRoad || httpWakeRoad
    wake()
  }

  private warm(lang: Language): void {
    void (this.deps.warm || httpWarm)(lang, this.deps.voice(lang))
  }

  /** The language a sentence is spoken in: its own, else the person's. */
  private sentenceLang(text: string): Language {
    return sentenceLang(text) || this.spokenLang || this.deps.lang()
  }

  // ---- speaking -----------------------------------------------------------

  /*
   * Looked at on the next microtask, not inside the store's notification:
   * the chat queue drops a line BEFORE the line's stream registers as busy,
   * and in that instant "nobody is answering and there is no reply" made the
   * follower give up on an answer that was about to start -- so a question
   * asked while the agent was still answering was never spoken.
   */
  private threadChanged(): void {
    if (this.threadCheck) return
    this.threadCheck = true
    queueMicrotask(() => {
      this.threadCheck = false
      this.onThread()
    })
  }

  private onThread(): void {
    const f = this.follower
    if (!f) return
    const wasFinished = f.finished
    const sentences = f.update(this.deps.messages(), this.deps.answering())
    for (const text of sentences) this.queue.push({ text, audio: null })
    if (!wasFinished && f.finished && f.cards.length) {
      this.queue.push({ text: this.optionsSentence(f.cards), audio: null })
    }
    this.prefetch()
    void this.pump()
  }

  /** "Options: Make a reel, Write a post." in the language of the titles. */
  private optionsSentence(cards: readonly { title: string }[]): string {
    const list = cards.map(c => c.title.replace(/[.!?…]+$/, '')).join(', ')
    const lang = this.sentenceLang(list)
    return translations[lang]['voice.options'].replace('{list}', list)
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
      const lang = this.sentenceLang(text)
      const bytes = await (this.deps.synthesize || httpSynthesize)(
        text,
        lang,
        this.deps.voice(lang)
      )
      return await this.ctx.decodeAudioData(bytes)
    } catch {
      return null
    }
  }

  private async pump(): Promise<void> {
    // Held by a barge-in: new sentences queue up, nothing plays.
    if (this.pumping || this.paused) return
    this.pumping = true
    const gen = this.generation
    try {
      while (this.queue.length && gen === this.generation) {
        this.prefetch()
        const item = this.queue[0]
        const buffer = await item.audio
        if (gen !== this.generation) return
        this.set({ phase: 'speaking', saying: item.text })
        this.soundingSince = performance.now()
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

  /**
   * A soft rising tick: "I heard you, I am on it". Synthesised, so nothing is
   * fetched; quiet, so it never reads as the agent's speech.
   */
  private cue(): void {
    const ctx = this.ctx
    if (!ctx) return
    try {
      const t = ctx.currentTime
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(660, t)
      osc.frequency.exponentialRampToValueAtTime(990, t + 0.09)
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(0.05, t + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.13)
    } catch {
      /* a cue is a courtesy */
    }
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
      let watchdog: ReturnType<typeof setTimeout> | null = null
      const done = () => {
        if (watchdog !== null) clearTimeout(watchdog)
        watchdog = null
        if (this.playing === src) this.playing = null
        resolve()
      }
      src.onended = done
      this.playing = src
      this.set({ fallbackVoice: false })
      // A context the system suspended (a call, the lock screen) plays nothing.
      if (ctx.state !== 'running') void ctx.resume().catch(() => undefined)
      src.start()
      watchdog = setTimeout(
        () => {
          try {
            src.stop()
          } catch {
            /* never started */
          }
          done()
        },
        buffer.duration * 1000 + PLAYBACK_GRACE_MS
      )
    })
  }

  /** Our engine was unreachable: the device's own voice says it instead. */
  private speakWithDevice(text: string): Promise<void> {
    return new Promise(resolve => {
      const synth =
        typeof window !== 'undefined' ? window.speechSynthesis : undefined
      if (!synth) return resolve()
      const u = new SpeechSynthesisUtterance(text)
      u.lang = this.sentenceLang(text) === 'ru' ? 'ru-RU' : 'en-US'
      u.onend = () => resolve()
      u.onerror = () => resolve()
      this.utterance = u
      this.set({ fallbackVoice: true })
      synth.speak(u)
    })
  }

  /**
   * Stop the sound but keep the answer: the sentence cut short stays first in
   * the queue (the pump only drops a sentence it finished), and the follower
   * keeps collecting the rest.
   */
  private pause(): void {
    this.paused = true
    this.generation++
    this.pumping = false
    this.stopSound()
  }

  /** Stop speaking now and forget the rest of this answer. */
  private silence(): void {
    this.paused = false
    this.generation++
    this.queue = []
    this.follower = null
    this.pumping = false
    this.stopSound()
  }

  private stopSound(): void {
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

/*
 * "Uh-huh" said over the agent is listening, not interrupting (LiveKit,
 * Vapi and ElevenLabs all keep such a list). Only the whole utterance counts:
 * "yes, and open the calendar" is a request.
 */
const BACKCHANNEL =
  // cyrillic-ok-next-line
  /^(?:(?:ага|угу|ну|да|ок|окей|хорошо|понятно|так|mm+-?hmm+|uh-?huh|hmm+|mhm|ok|okay|yeah|yes|right|sure|got it|i see)[\s.,!?…-]*){1,3}$/i
export function isBackchannel(text: string): boolean {
  return BACKCHANNEL.test(text.trim())
}

/*
 * The agent hearing itself. Echo cancellation does not always take the
 * speaker out of the mic (measured on phones by every voice stack that ships
 * one), and a barge-in made of our own sentence came back from whisper as
 * that sentence -- then went to the agent as the person's question. Most of
 * the transcript's words found in the sentence being spoken means it was us.
 */
export function isEcho(heard: string, saying: string): boolean {
  const words = (s: string) =>
    s
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter(w => w.length > 1)
  const said = new Set(words(saying))
  const got = words(heard)
  if (!said.size || !got.length) return false
  const found = got.filter(w => said.has(w)).length
  return found / got.length >= 0.6
}
