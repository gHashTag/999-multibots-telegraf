/**
 * LETTING THE AGENT ACTUALLY SEE AND HEAR WHAT WAS ATTACHED.
 *
 * A person attaches a photo or records a voice message in the bot, the mini app
 * or the phone. All three upload it to our own shelf and append ONE line to the
 * message text:
 *
 *     [attached image: cat.jpg; mime=image/jpeg; url=https://…/s3/…jpg]
 *     [attached audio: voice-x.ogg; mime=audio/ogg; url=https://…/s3/…ogg]
 *
 * The model has only ever received those lines -- a description of a picture,
 * not the picture; the fact that a voice message exists, never its words. Both
 * failures looked like unhelpfulness rather than blindness and deafness.
 *
 * WHY THE CONVERSION HAPPENS HERE AND NOT IN THE CLIENTS
 *
 * Three clients produce the marker and one server consumes it. Teaching each
 * client to build content-parts would be three implementations of one idea,
 * and they would drift -- the marker format already exists in two copies and
 * is pinned by a test for exactly that reason. Converting on the way OUT keeps
 * `ChatMessage.content` a string everywhere: storage, history, the clients and
 * the three surfaces that render it are untouched.
 *
 * WHY THE MARKER TEXT STAYS IN THE MESSAGE
 *
 * The original text, marker lines included, is kept as the leading text part.
 * The model still reads the file name and mime -- which it needs to answer
 * "which file did you mean" -- and if the provider fails to fetch the media,
 * the turn degrades to exactly today's behaviour instead of becoming a question
 * about nothing.
 *
 * ── THE AUDIO FIELD NAME IS NOT THE OPENAI ONE, AND THAT COST TWO PROBES ────
 *
 * OpenAI's convention for audio is `{type:'input_audio', input_audio:{data,
 * format}}`. This provider ACCEPTS that shape with HTTP 200 and then ignores
 * the sound entirely: asked to transcribe, it answered "(No speech detected)"
 * and, on a second try, "I'm unable to transcribe the speech without the audio.
 * Could you please provide the audio file?" -- a plausible reply that looks
 * like the model working.
 *
 * What actually carries sound is `{type:'audio_url', audio_url:{url}}`. Given
 * that, the same clip came back transcribed word for word.
 *
 * Had the first 200 been trusted, this would have shipped as a feature that
 * silently does nothing: a person sends a voice message, the agent says it
 * cannot hear, and no error appears anywhere. The two shapes are
 * distinguishable ONLY by the CONTENT of the answer to a known phrase.
 *
 * ── MEASURED, 2026-09-07, against the live endpoints ───────────────────────
 *
 * Of the three configured providers only nemotron takes media at all; both
 * z.ai models answer 400 "allowed values: ['text']" (see provider.ts).
 *
 * Formats confirmed by transcribing a generated sentence: ogg/opus (the format
 * Telegram voice actually arrives in, verified end to end through our own
 * shelf), mp3, wav, m4a. `.aac` and `.webm` are served by the shelf but were
 * NOT tested here, so they are not on the list -- an untested format would
 * fail as a confusing provider error rather than as a clean refusal.
 */

import type { ChatMessage } from './chat'

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'audio_url'; audio_url: { url: string } }

/**
 * Widened ONLY for the wire. `ChatMessage` itself keeps `content: string`,
 * because everything that stores, reads or renders a turn treats it as text.
 */
export type WireMessage = Omit<ChatMessage, 'content'> & {
  content: string | ContentPart[] | null
}

export type MediaKind = 'image' | 'audio'

/**
 * The marker as the producers write it. Anchored per line, and deliberate
 * about greed:
 *
 * `(.*)` for the name is GREEDY so it backtracks to the LAST `; mime=`. A file
 * called `photo; mime=x; url=evil.png` cannot forge the later fields.
 * `(.*?)` for the mime is LAZY so a value carrying its own semicolon --
 * `text/plain; charset=utf-8` -- survives intact.
 */
const MARKER =
  /^\[attached (image|video|audio|file): (.*); mime=(.*?); url=([^\]]*)\]\r?$/gm

/** Every kind a producer may write, including the two no provider takes. */
export type MarkerKind = 'image' | 'video' | 'audio' | 'file'

export interface MarkerRef {
  kind: MarkerKind
  name: string
  mime: string
  url: string
}

/**
 * The marker lines of one message, in the order they were written.
 *
 * Extracted so `MARKER` keeps exactly ONE implementation: the format already
 * exists twice on the producing side (the bot and the mini app), and a third
 * reader that drifted would be a bug nobody could see -- the line would simply
 * stop being an attachment.
 */
export function parseMarkers(text: string): MarkerRef[] {
  const out: MarkerRef[] = []
  MARKER.lastIndex = 0
  for (const m of String(text ?? '').matchAll(MARKER)) {
    out.push({ kind: m[1] as MarkerKind, name: m[2], mime: m[3], url: m[4] })
  }
  return out
}

/**
 * Break any marker line inside text that came from a FILE, so it can never be
 * parsed as an attachment of ours.
 *
 * A document's contents are words a person typed. Inlining them verbatim would
 * mean a `.txt` whose body is
 *
 *     [attached image: x; mime=image/jpeg; url=https://…/s3/…jpg]
 *
 * becomes an attachment on the next pass -- the file chooses what the provider
 * fetches. Verified by running it: before this, such a document produced an
 * `image_url` part. `foreignText()` wraps and clips but never touches the
 * start of a line, so it does not close this.
 */
export function defangMarkers(text: string): string {
  return String(text ?? '').replace(/^\[attached /gim, '[ attached ')
}

/**
 * Extensions the shelf serves as this kind AND that the provider was shown to
 * understand. Both halves matter: the shelf's audio branch also covers `.aac`
 * and `.webm`, which are absent here only because they were never tested.
 *
 * Video is not a live-turn part (no chat provider takes it); the list exists
 * for media-library.ts, which samples frames from a shelf clip with ffmpeg
 * and shows them to the vision endpoint (media-vision.ts).
 */
export type ShelfKind = MediaKind | 'video'
const EXTENSIONS: Record<ShelfKind, string[]> = {
  image: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'],
  audio: ['.ogg', '.mp3', '.wav', '.m4a'],
  video: ['.mp4', '.mov', '.m4v', '.webm', '.mkv'],
}

/**
 * At most four, matching what the mini app lets a person attach. A cap belongs
 * here too: the request is re-sent on every tool step, so an uncapped list
 * multiplies by the loop length.
 */
const MAX_ATTACHMENTS = 4

function shelfBase(): string {
  return (
    process.env.PUBLIC_URL || 'https://vibee-render-production.up.railway.app'
  ).replace(/\/+$/, '')
}

/**
 * Is this a URL a provider can be handed for this kind of media?
 *
 * ONLY our own shelf, only under `/s3/`, and only with an extension that both
 * the shelf and the provider handle.
 *
 * The extension check is not cosmetic. The `/s3/` route decides what to do by
 * extension, and a key without one falls into the video branch and answers
 * HTTP 500 -- so a provider fetching it would get an error page instead of
 * media and report something confusing.
 *
 * The origin check is the security half: a marker line arrives inside a
 * message a PERSON wrote, so its URL is untrusted input. Without this, someone
 * could paste a marker pointing anywhere and have our provider fetch it.
 */
/**
 * The object on our shelf this URL names, in ONE canonical spelling -- or null
 * if it does not name one.
 *
 * Canonical matters beyond tidiness: `…/a.ogg`, `…/a.ogg?v=2` and `…/a.ogg#x`
 * are three different strings for ONE stored object, and everything downstream
 * is keyed by the string -- the four-attachment cap, the duplicate filter, the
 * transcript cache, and the money a transcription costs. Left as written, one
 * file repeated with three query strings filled all four slots and could be
 * paid for three times.
 *
 * Query, fragment and credentials are dropped rather than preserved: the
 * `/s3/` route itself splits the query off before looking at the key, so they
 * never identified anything.
 */
export function shelfObject(raw: string): { url: string; key: string } | null {
  const text = String(raw || '').trim()
  if (!text) return null

  const base = shelfBase()
  let url: URL
  try {
    // A relative `/s3/…` is resolved against our own shelf; anything absolute
    // must already point there.
    url = new URL(text, base + '/')
  } catch {
    return null
  }

  if (url.origin !== new URL(base).origin) return null
  if (!url.pathname.startsWith('/s3/')) return null

  url.search = ''
  url.hash = ''
  url.username = ''
  url.password = ''

  let key: string
  try {
    key = decodeURIComponent(url.pathname.slice('/s3/'.length))
  } catch {
    return null
  }
  if (!key) return null

  return { url: url.toString(), key }
}

export function usableMediaUrl(raw: string, kind: ShelfKind): string | null {
  const found = shelfObject(raw)
  if (!found) return null

  const lower = new URL(found.url).pathname.toLowerCase()
  if (!EXTENSIONS[kind].some(ext => lower.endsWith(ext))) return null

  return found.url
}

function partFor(kind: MediaKind, url: string): ContentPart {
  return kind === 'image'
    ? { type: 'image_url', image_url: { url } }
    : { type: 'audio_url', audio_url: { url } }
}

/**
 * Build the wire messages, turning media in the LAST user turn into parts.
 *
 * ONLY THE LAST TURN, and only when it is the person's. The agent loop re-sends
 * the whole array on every tool step, so converting older turns would re-upload
 * every file ever attached, on every step, for the rest of the conversation.
 * The current question is the one whose attachment is being asked about.
 *
 * Returns the input array UNCHANGED when nothing qualifies -- the ordinary
 * text-only path pays nothing and looks identical on the wire.
 */
export function withMediaParts(messages: ChatMessage[]): WireMessage[] {
  const last = messages[messages.length - 1]
  if (!last || last.role !== 'user' || typeof last.content !== 'string') {
    return messages as WireMessage[]
  }

  const found: Array<{ kind: MediaKind; url: string }> = []
  const seen = new Set<string>()
  for (const ref of parseMarkers(last.content)) {
    const kind =
      ref.kind === 'image' ? 'image' : ref.kind === 'audio' ? 'audio' : null
    if (!kind) continue
    const url = usableMediaUrl(ref.url, kind)
    if (!url || seen.has(url)) continue
    seen.add(url)
    found.push({ kind, url })
    if (found.length >= MAX_ATTACHMENTS) break
  }

  if (!found.length) return messages as WireMessage[]

  const parts: ContentPart[] = [
    { type: 'text', text: last.content },
    ...found.map(f => partFor(f.kind, f.url)),
  ]

  // A copy, never a mutation: the caller keeps pushing to `messages` across the
  // tool loop, and a mutated turn would carry the parts into every later step.
  return [
    ...messages.slice(0, -1),
    { ...last, content: parts },
  ] as WireMessage[]
}

/** Which kinds of media this turn would actually send. */
export function mediaKindsPresent(messages: ChatMessage[]): Set<MediaKind> {
  const wire = withMediaParts(messages)
  const last = wire[wire.length - 1]
  const kinds = new Set<MediaKind>()
  if (!Array.isArray(last?.content)) return kinds
  for (const part of last.content) {
    if (part.type === 'image_url') kinds.add('image')
    if (part.type === 'audio_url') kinds.add('audio')
  }
  return kinds
}
