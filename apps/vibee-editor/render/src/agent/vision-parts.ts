/**
 * LETTING THE AGENT ACTUALLY SEE AN ATTACHED IMAGE.
 *
 * A person attaches a photo in the bot, the mini app or the phone. All three
 * upload it to our own shelf and append ONE line to the message text:
 *
 *     [attached image: cat.jpg; mime=image/jpeg; url=https://…/s3/…jpg]
 *
 * The model has only ever received that line -- a description of a picture, not
 * the picture. "What is written on this receipt" could not be answered, and the
 * failure looked like the agent being unhelpful rather than blind.
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
 * "which file did you mean" -- and if the provider fails to fetch the image,
 * the turn degrades to exactly today's behaviour instead of becoming a
 * question about nothing.
 *
 * MEASURED, 2026-09-07
 *
 * Of the three configured providers only nemotron accepts an image; both z.ai
 * models answer 400 "allowed values: ['text']" (see provider.ts). So the
 * caller must ask a sighted provider -- this module only builds the shape.
 */

import type { ChatMessage } from './chat'

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

/**
 * Widened ONLY for the wire. `ChatMessage` itself keeps `content: string`,
 * because everything that stores, reads or renders a turn treats it as text.
 */
export type WireMessage = Omit<ChatMessage, 'content'> & {
  content: string | ContentPart[] | null
}

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

/** Extensions the shelf serves as an image; see the `/s3/` route. */
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']

/**
 * At most four, matching what the mini app lets a person attach. A cap belongs
 * here too: the request is re-sent on every tool step, so an uncapped list
 * multiplies by the loop length.
 */
const MAX_IMAGES = 4

function shelfBase(): string {
  return (
    process.env.PUBLIC_URL || 'https://vibee-render-production.up.railway.app'
  ).replace(/\/+$/, '')
}

/**
 * Is this a URL a provider can be handed?
 *
 * ONLY our own shelf, only under `/s3/`, and only with an image extension.
 *
 * The extension check is not cosmetic. The `/s3/` route decides what to do by
 * extension, and a key without one falls into the video branch and answers
 * HTTP 500 -- so a provider fetching it would get an error page instead of a
 * picture and report something confusing.
 *
 * The origin check is the security half: a marker line arrives inside a
 * message a PERSON wrote, so its URL is untrusted input. Without this, someone
 * could paste a marker pointing anywhere and have our provider fetch it.
 */
export function usableImageUrl(raw: string): string | null {
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

  const lower = url.pathname.toLowerCase()
  if (!IMAGE_EXTENSIONS.some(ext => lower.endsWith(ext))) return null

  return url.toString()
}

/**
 * Build the wire messages, turning images in the LAST user turn into parts.
 *
 * ONLY THE LAST TURN, and only when it is the person's. The agent loop re-sends
 * the whole array on every tool step, so converting older turns would re-upload
 * every picture ever attached, on every step, for the rest of the conversation.
 * The current question is the one whose picture is being asked about.
 *
 * Returns the input array UNCHANGED when nothing qualifies -- the ordinary
 * text-only path pays nothing and looks identical on the wire.
 */
export function withImageParts(messages: ChatMessage[]): WireMessage[] {
  const last = messages[messages.length - 1]
  if (!last || last.role !== 'user' || typeof last.content !== 'string') {
    return messages as WireMessage[]
  }

  const urls: string[] = []
  MARKER.lastIndex = 0
  for (const m of last.content.matchAll(MARKER)) {
    if (m[1] !== 'image') continue
    const url = usableImageUrl(m[4])
    if (url && !urls.includes(url)) urls.push(url)
    if (urls.length >= MAX_IMAGES) break
  }

  if (!urls.length) return messages as WireMessage[]

  const parts: ContentPart[] = [
    { type: 'text', text: last.content },
    ...urls.map(url => ({ type: 'image_url' as const, image_url: { url } })),
  ]

  // A copy, never a mutation: the caller keeps pushing to `messages` across the
  // tool loop, and a mutated turn would carry the parts into every later step.
  return [
    ...messages.slice(0, -1),
    { ...last, content: parts },
  ] as WireMessage[]
}

/** Does this turn carry an image the model could look at? */
export function hasImageToSee(messages: ChatMessage[]): boolean {
  const wire = withImageParts(messages)
  const last = wire[wire.length - 1]
  return Array.isArray(last?.content)
}
