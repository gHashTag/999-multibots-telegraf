/**
 * The two doors of voice mode on the render server (render src/voice/voice.ts):
 * one utterance in, words out; one sentence in, mp3 out.
 */
import { API_BASE } from '@/config'
import { authHeaders } from '@/lib/apiFetch'
import type { Language } from '@/atoms/language'

export class VoiceHttpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
  }
}

/*
 * THE ROAD. Every request crosses Railway's edge, and the edge closes a
 * connection left idle for about a minute (measured 2026-10-02: alive after
 * 50 s, closed after 60 s). Opening a new one costs DNS + TCP + TLS, 150-400 ms
 * (tri road), and it used to be paid by the first phrase after a quiet spell
 * -- on top of the ~250 ms the edge already spends reaching the render.
 * So every call notes the time, and `wakeRoad` reopens a quiet road with one
 * cheap GET as the person STARTS talking: the handshake then hides inside
 * their phrase instead of following it.
 */
export const ROAD_IDLE_MS = 15_000
let roadUsedAt = -Infinity

// Not `useRoad`: React's lint reads any use* call outside a component as a
// hook, and the four call sites below pushed the player-lint ratchet to 413.
function noteRoadUse(): void {
  roadUsedAt = Date.now()
}

/**
 * Reopen the road to the render if it has been quiet. Best effort, never
 * awaited: a failed ping only means the phrase pays the handshake itself.
 * Returns whether a ping was sent.
 */
export function wakeRoad(now = Date.now()): boolean {
  if (now - roadUsedAt < ROAD_IDLE_MS) return false
  roadUsedAt = now
  // Public, GET, no custom header: no CORS preflight, so the one request
  // that goes out is the one that opens the connection.
  fetch(`${API_BASE}/api/voice/status`).then(
    r => void r.body?.cancel(),
    () => {}
  )
  return true
}

export async function transcribe(
  audio: Blob,
  opts: { lang?: Language | null; signal?: AbortSignal } = {}
): Promise<string> {
  // The language, when known, saves whisper a detection pass (spokenLang.ts).
  const q = opts.lang ? `?lang=${opts.lang}` : ''
  noteRoadUse()
  const r = await fetch(`${API_BASE}/api/voice/transcribe${q}`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': audio.type || 'audio/webm' }),
    body: audio,
    signal: opts.signal,
  })
  if (!r.ok) throw new VoiceHttpError(r.status, `transcribe ${r.status}`)
  const body = (await r.json()) as { text?: unknown }
  return typeof body.text === 'string' ? body.text.trim() : ''
}

export async function synthesize(
  text: string,
  lang: Language,
  voice: string | null,
  signal?: AbortSignal
): Promise<ArrayBuffer> {
  noteRoadUse()
  const r = await fetch(`${API_BASE}/api/voice/speak`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ text, lang, voice }),
    signal,
  })
  if (!r.ok) throw new VoiceHttpError(r.status, `speak ${r.status}`)
  return r.arrayBuffer()
}

/**
 * Ask the server to load the transcriber and this voice now, while the person
 * is still drawing breath: a cold voice costs its first sentence 2-5 s. Best
 * effort -- a failed warm-up only means the first phrase is slower.
 */
export async function warmVoice(
  lang: Language,
  voice: string | null
): Promise<void> {
  noteRoadUse()
  try {
    await fetch(`${API_BASE}/api/voice/warm`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ lang, voice }),
    })
  } catch {
    /* the first phrase will simply load what it needs */
  }
}

export interface VoiceStatus {
  hear: boolean
  speak: boolean
  /** The server's own list (render VOICES) -- never copied here. */
  voices: Partial<Record<Language, string[]>>
}

/** What the server can do. Unreachable means "nothing", not "everything". */
export async function fetchVoiceStatus(): Promise<VoiceStatus> {
  noteRoadUse()
  try {
    const r = await fetch(`${API_BASE}/api/voice/status`)
    if (!r.ok) throw new Error(String(r.status))
    const b = (await r.json()) as Partial<VoiceStatus>
    return {
      hear: Boolean(b.hear),
      speak: Boolean(b.speak),
      voices: b.voices || {},
    }
  } catch {
    return { hear: false, speak: false, voices: {} }
  }
}

/** "af_heart" -> "Heart", "irina" -> "Irina". */
export function voiceLabel(id: string): string {
  const name = id.replace(/^[a-z]{2}_/, '')
  return name.charAt(0).toUpperCase() + name.slice(1)
}
