/**
 * WHAT THE PROVIDER CHAIN CANNOT PERCEIVE, THIS READS -- OR SAYS IT DID NOT.
 *
 * ── THE COMPLAINT ──────────────────────────────────────────────────────────
 *
 * 17.09.2026, from the owner: a voice message came back as (translated from
 * the Russian the agent actually sent)
 *
 *     "Thank you for the audio, but I cannot listen to it. Please describe
 *      what the audio is about -- which topics and competitor examples
 *      interest you, what clip length you need..."
 *
 * -- and the topics it went on to list were the ones IN the recording. The
 * model had guessed from the surrounding conversation and been right. That is
 * the worst available outcome: a turn that declares it perceived nothing and
 * then answers as though it had. Nobody can tell such an answer from a real
 * one, so nobody can tell when it is wrong.
 *
 * ── WHY IT HAPPENED, EXACTLY ───────────────────────────────────────────────
 *
 * `chat.ts` builds native media parts only when a configured provider declares
 * the matching sense. Of five providers exactly ONE declares `audio` or
 * `vision` -- nemotron -- and on the day of the complaint nemotron was
 * answering `ResourceExhausted: Worker local total request limit reached
 * (16/16)`, which is in the owner's own error report an hour earlier. With it
 * out, `capable` is empty, parts are not built, and the turn degrades to the
 * marker line:
 *
 *     [attached audio: voice.ogg; mime=audio/ogg; url=https://…/s3/….ogg]
 *
 * A line that names a file and says nothing about what is in it. The degrade
 * was deliberate and is still right -- failing the turn would be worse -- but
 * it left the model with a filename and no contents, and models do not leave
 * that gap empty.
 *
 * Attachments of kind `file` were worse off: they had no path at all.
 * `describeMedia` has a text-document branch, but it fetched over HTTP, and
 * the `/s3/` route streams images, audio and `.json` while sending every other
 * extension into an ffmpeg transcode. A `.txt` on our own shelf has never once
 * been readable in production.
 *
 * ── THE FIX, AND WHY IT IS TEXT ────────────────────────────────────────────
 *
 * Before the chain is chosen, anything it will not be able to perceive is read
 * here and APPENDED AS TEXT to the person's turn. Text is the one thing every
 * provider takes, so the answer no longer depends on which provider happened
 * to be up. And because this runs once per turn in `runAgent` rather than per
 * request in `streamModel`, the words persist across every tool step -- native
 * parts only ever travel on step 0, since after that the last message is a
 * tool result.
 *
 * Nothing here narrows the provider choice. Documents and video never enter
 * the kind set, so a turn carrying only a PDF is still answerable by a
 * text-only model, which is the common case.
 *
 * ── THE PART THAT IS NOT A FEATURE ─────────────────────────────────────────
 *
 * When a file cannot be read, a line saying so is added. That is the actual
 * subject of the complaint: not "the agent cannot hear" but "the agent cannot
 * hear AND proceeds as if it could". The refusal is composed HERE, in code,
 * rather than left to an instruction in the system prompt, because an
 * instruction is something a model can smooth over and a sentence in the
 * transcript is not.
 *
 * ── WHAT IS HONESTLY NOT SUPPORTED ─────────────────────────────────────────
 *
 * `.pdf`, `.docx`, `.xlsx` and every other packed format. This repository has
 * no extractor for any of them -- no pdf-parse, no pdfjs, no mammoth, no
 * officeparser, no xlsx, no tika, in any package.json. They produce an
 * explicit refusal naming the format and the ones that do work. Guessing at
 * their bytes would produce mojibake, and mojibake is how a model invents a
 * document that does not exist.
 */

import type { ChatMessage } from './chat'
import {
  parseMarkers,
  defangMarkers,
  shelfObject,
  usableMediaUrl,
  type MarkerRef,
} from './media-parts'
import { allProviders } from './provider'
import {
  isTextLikeDocument,
  mediaByUrls,
  readShelfDocument,
  transcribeShelfAudioNow,
  type Pool,
} from './media-library'
import { foreignText } from './telegram-tools'

/**
 * Caps are COUNTS AND BYTES, never "until it feels long". A person is waiting
 * on this, and every one of these numbers is the difference between a slow
 * answer and a turn that never returns.
 *
 * MAX_INLINE is deliberately separate from `MAX_ATTACHMENTS` in media-parts:
 * they bound different things, and sharing one number would let a document
 * evict a photo from the four native slots.
 */
const MAX_INLINE = 6
/** Roughly 2-3k tokens. The system prompt and the history are also in there. */
const INLINE_BUDGET = 8_000
/**
 * At most one recording is transcribed live per turn, by distinct object.
 * Transcription is the only step here that costs money and the only one that
 * can take a minute; a turn naming six voice notes must not do six of them
 * while somebody watches. The rest are answered from the cache or named as
 * not heard, and the sweep picks them up afterwards as it always has.
 */
const MAX_LIVE_TRANSCRIPTS = 1
/**
 * Short on purpose -- see `transcribeShelfAudioNow`. The sweep's own deadline
 * is 180 s because nothing waits on it.
 */
const LIVE_TRANSCRIBE_MS = Math.max(
  5_000,
  Number(process.env.MEDIA_LIVE_TRANSCRIBE_MS) || 45_000
)

/** Formats named often enough to deserve being named back. */
const KNOWN_UNREADABLE =
  /\.(pdf|docx?|xlsx?|pptx?|pages|numbers|key|epub|rtf|odt|ods|zip|rar|7z|gz|tar)$/i

const READABLE_HINT = '.txt, .md, .csv, .json or plain text in the message'

interface InlineOptions {
  pool?: Pool | null
  owner?: string | null
  /** Mirrors `runAgent`'s option so the capability test matches chat.ts. */
  toolsOnly?: boolean
}

/**
 * Will the chain about to be picked actually perceive this turn's media?
 *
 * Kept identical to the test in `chat.ts` on purpose, including its
 * all-or-nothing shape: parts are built only when ONE provider satisfies every
 * sense the turn needs, so a turn with a photo and a voice note either travels
 * whole or not at all. Reading that differently here would produce the exact
 * bug this file exists to remove -- a file inlined as text AND sent as a part,
 * or neither.
 */
function chainPerceives(kinds: Set<'image' | 'audio'>, toolsOnly?: boolean) {
  if (!kinds.size) return false
  const configured = allProviders().filter(p => !toolsOnly || p.tools)
  return configured.some(
    p => (!kinds.has('image') || p.vision) && (!kinds.has('audio') || p.audio)
  )
}

/** One line of machine-added context, clearly labelled as such. */
function note(label: string, name: string, body?: string): string {
  const head = `[${label}: ${name}]`
  return body ? `${head}\n${foreignText(defangMarkers(body))}` : head
}

/**
 * The refusal for a document we will not read, in the ORDER THAT MATTERS.
 *
 * The format is judged BEFORE the location. A `.docx` sitting on our own shelf
 * is refused for being a `.docx`; checking the origin first would tell the
 * person their file "is not on our shelf" -- a false statement about a file
 * they had just uploaded, and one that would send them to upload it again,
 * forever.
 */
function documentRefusal(ref: MarkerRef): string | null {
  const name = ref.name || 'file'
  const known = KNOWN_UNREADABLE.exec(name)
  if (known) {
    return `[not read: ${name} — the ${known[0].toLowerCase()} format cannot be opened here; ask the person for ${READABLE_HINT}]`
  }
  if (!isTextLikeDocument(ref.mime, name)) {
    return `[not read: ${name} — this format cannot be opened here; ask the person for ${READABLE_HINT}]`
  }
  if (!shelfObject(ref.url)) {
    return `[not read: ${name} — the file is not on our own storage, so it cannot be opened]`
  }
  return null
}

/**
 * Read what the chain cannot perceive and append it to the last user turn.
 *
 * Returns the SAME array when there is nothing to add, so the ordinary
 * text-only turn costs one regex pass and allocates nothing. Never mutates:
 * `runAgent` keeps pushing to the array it passed in, and a mutated turn would
 * carry this into every later step.
 */
export async function inlineUnperceivedMedia(
  messages: ChatMessage[],
  opts: InlineOptions = {}
): Promise<ChatMessage[]> {
  const last = messages[messages.length - 1]
  if (!last || last.role !== 'user' || typeof last.content !== 'string') {
    return messages
  }

  const refs = parseMarkers(last.content)
  if (!refs.length) return messages

  /*
   * The kinds that would travel natively -- computed the same way
   * media-parts.ts computes them, from USABLE urls only. A photo on somebody
   * else's host is not a photo the chain can see, so it must not make the turn
   * look perceivable.
   */
  const kinds = new Set<'image' | 'audio'>()
  for (const ref of refs) {
    if (ref.kind !== 'image' && ref.kind !== 'audio') continue
    if (usableMediaUrl(ref.url, ref.kind)) kinds.add(ref.kind)
  }
  const perceived = chainPerceives(kinds, opts.toolsOnly)

  /* Which refs actually need work, canonical and de-duplicated. */
  const todo: Array<{ ref: MarkerRef; key: string; url: string }> = []
  const seen = new Set<string>()
  for (const ref of refs) {
    if (ref.kind === 'image' || ref.kind === 'audio') {
      // Handled natively: the provider will fetch it itself.
      if (perceived && usableMediaUrl(ref.url, ref.kind)) continue
    }
    const found = shelfObject(ref.url)
    // The canonical URL is the identity. `a.ogg`, `a.ogg?v=2` and `a.ogg#x`
    // are one object, and were three before this -- three cache misses, three
    // transcriptions, three of the four native slots.
    const key = found ? found.url : `raw:${ref.url}`
    if (seen.has(key)) continue
    seen.add(key)
    todo.push({ ref, key, url: found ? found.url : ref.url })
    if (todo.length >= MAX_INLINE) break
  }
  if (!todo.length) return messages

  /* One round trip for every transcript already on record. */
  let cached = new Map<string, string>()
  if (opts.pool && opts.owner) {
    cached = await mediaByUrls(
      opts.pool,
      opts.owner,
      todo.map(t => t.url)
    ).catch(() => new Map<string, string>())
  }

  const lines: string[] = []
  let budget = INLINE_BUDGET
  let live = 0

  const add = (line: string) => {
    if (budget <= 0) return
    lines.push(line.length > budget ? line.slice(0, budget) : line)
    budget -= line.length
  }

  for (const { ref, url } of todo) {
    const name = ref.name || 'file'
    const stored = cached.get(url)

    if (ref.kind === 'file') {
      const refusal = documentRefusal(ref)
      if (refusal) {
        add(refusal)
        continue
      }
      const text = await readShelfDocument(url).catch(() => null)
      add(
        text
          ? note('read', name, text)
          : `[not read: ${name} — the file could not be opened from storage; ask the person to send it again]`
      )
      continue
    }

    if (ref.kind === 'audio') {
      if (stored) {
        add(note('heard earlier', name, stored))
        continue
      }
      if (live < MAX_LIVE_TRANSCRIPTS) {
        live += 1
        const text = await transcribeShelfAudioNow(
          url,
          name,
          LIVE_TRANSCRIBE_MS
        ).catch(() => null)
        if (text) {
          add(note('heard', name, text))
          continue
        }
      }
      add(
        `[not heard: ${name} — nothing here could listen to this recording, and no transcript is on record. Say so plainly and ask what was said; do NOT infer it from the conversation.]`
      )
      continue
    }

    if (ref.kind === 'image') {
      if (stored) {
        add(note('seen earlier', name, stored))
        continue
      }
      add(
        `[not seen: ${name} — nothing here could look at this image, and no description is on record. Say so plainly; do NOT describe it from the conversation.]`
      )
      continue
    }

    // Video. Frame sampling takes minutes, so it belongs to the sweep; a live
    // turn either has yesterday's description or admits it has none.
    add(
      stored
        ? note('watched earlier', name, stored)
        : `[not watched: ${name} — nothing here could watch this video, and no description is on record. Say so plainly.]`
    )
  }

  if (!lines.length) return messages

  const block =
    '\n\n[ATTACHMENTS — opened by the server, not typed by the person]\n' +
    lines.join('\n')

  return [...messages.slice(0, -1), { ...last, content: last.content + block }]
}
