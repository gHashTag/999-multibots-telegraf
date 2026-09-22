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
 * ── WHAT IS READ, AND WHAT IS HONESTLY NOT (2026-09-22) ────────────────────
 *
 * PDF, .docx/.xlsx/.pptx, OpenDocument and RTF are read by media-extract.ts;
 * an archive is LISTED by name and size and never unpacked, and the line says
 * so; a video's soundtrack is transcribed on the turn. What is still refused
 * -- legacy .doc/.xls/.ppt, Apple's formats, .epub, anything unknown -- is
 * refused BY NAME, with the formats that do work. Guessing at bytes would
 * produce mojibake, and mojibake is how a model invents a document that does
 * not exist.
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
  describeShelfImageNow,
  isTextLikeDocument,
  mediaByUrls,
  readShelfDocument,
  transcribeShelfAudioNow,
  transcribeShelfVideoNow,
  whisperConfig,
  type Pool,
} from './media-library'
import {
  DOCUMENT_MAX_BYTES,
  UNREADABLE_EXTENSIONS,
  documentFormat,
  readShelfExtractedNow,
  type Extracted,
} from './media-extract'
import { visionConfig } from './media-vision'
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
 * Two photos, not one: people send a screenshot and the thing it is about in
 * the same breath, and the second one carries the question half the time.
 * Measured on our own vision service 20.09.2026, one photo answered in about
 * six seconds -- cheap enough for two and not for six.
 */
const MAX_LIVE_DESCRIPTIONS = 2
/**
 * Short on purpose -- see `transcribeShelfAudioNow`. The sweep's own deadline
 * is 180 s because nothing waits on it.
 */
const LIVE_TRANSCRIBE_MS = Math.max(
  5_000,
  Number(process.env.MEDIA_LIVE_TRANSCRIBE_MS) || 45_000
)
/** The same clock, for sight. See `describeShelfImageNow`. */
const LIVE_DESCRIBE_MS = Math.max(
  5_000,
  Number(process.env.MEDIA_LIVE_DESCRIBE_MS) || 45_000
)
/**
 * PDFs, office files and archives opened on one turn, by distinct object.
 * The same contract as sound and sight (2026-09-22): a PDF costs a download
 * and a pdftotext of up to a minute, and six of them in a row were six
 * minutes of somebody watching. The rest wait for the background read, whose
 * stored text a later turn uses.
 */
const MAX_LIVE_DOCUMENTS = 2
/** And the clock for each: the reader is stopped when the turn stops waiting. */
const LIVE_READ_MS = Math.max(
  5_000,
  Number(process.env.MEDIA_LIVE_READ_MS) || 20_000
)

/**
 * Formats named often enough to deserve being named back. Built from the one
 * list the prompt also reads (media-extract.ts), so the refusal and the
 * promise cannot disagree about a format.
 */
const KNOWN_UNREADABLE = new RegExp(
  `\\.(${UNREADABLE_EXTENSIONS.join('|')})$`,
  'i'
)

const READABLE_HINT = '.pdf, .docx, .xlsx, .txt or plain text in the message'

/** The character count past which `note` shows only the beginning. */
const NOTE_SHOWS = 2000

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
 *
 * The one difference is the SET it is given: our own senses are subtracted
 * first (`ownSenses`), because what we read here stops being an attachment
 * before `chat.ts` ever looks. Same question, asked about what is left.
 */
function chainPerceives(kinds: Set<'image' | 'audio'>, toolsOnly?: boolean) {
  if (!kinds.size) return false
  const configured = allProviders().filter(p => !toolsOnly || p.tools)
  return configured.some(
    p => (!kinds.has('image') || p.vision) && (!kinds.has('audio') || p.audio)
  )
}

/**
 * THE SENSES WE OWN, AND WHY THEY GO FIRST (21.09.2026).
 *
 * This file used to stand aside whenever ANY configured provider declared the
 * matching sense -- and exactly one ever has, nemotron. So every turn carrying
 * a photo or a voice note was handed to a single third-party model, and when
 * that model was rate-limited, slow, or simply did not look, the person got a
 * filename back. Meanwhile this service runs its own transcriber and its own
 * vision endpoint on the private network: faster-whisper and a Qwen3-VL served
 * by llama.cpp, both paid for, both up, both never asked on a live turn for
 * sight at all.
 *
 * So the order is inverted. What we can read, we read here, on our own
 * hardware, where a failure is visible and a success is words in the
 * transcript that survive every later tool step. The provider chain is asked
 * only about what is LEFT -- which keeps the invariant this file was built on:
 * a file is inlined as text OR sent as a native part, never both, never
 * neither. `handled` below carries that through to the text, by breaking the
 * marker of anything we read so `withMediaParts` cannot send it again.
 */
function ownSenses(): Set<'image' | 'audio'> {
  const mine = new Set<'image' | 'audio'>()
  if (visionConfig()) mine.add('image')
  if (whisperConfig()) mine.add('audio')
  return mine
}

/**
 * Break the marker lines of the files we read ourselves, and only those.
 *
 * Line by line through the one parser, so the format keeps a single
 * implementation: a line that `parseMarkers` does not recognise is not a
 * marker and is left exactly as the person wrote it.
 */
function defangHandled(text: string, handled: Set<string>): string {
  if (!handled.size) return text
  return text
    .split('\n')
    .map(line => {
      const [ref] = parseMarkers(line)
      if (!ref || !handled.has(markerKey(ref))) return line
      return line.replace(/^\[attached /, '[ attached ')
    })
    .join('\n')
}

/**
 * The identity of an attachment: its canonical shelf URL when it is ours.
 * `a.ogg`, `a.ogg?v=2` and `a.ogg#x` are one object, and were three before
 * this -- three cache misses, three transcriptions, three native slots.
 */
function markerKey(ref: MarkerRef): string {
  const found = shelfObject(ref.url)
  return found ? found.url : `raw:${ref.url}`
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
  if (!isTextLikeDocument(ref.mime, name) && !documentFormat(ref.mime, name)) {
    return `[not read: ${name} — this format cannot be opened here; ask the person for ${READABLE_HINT}]`
  }
  if (!shelfObject(ref.url)) {
    return `[not read: ${name} — the file is not on our own storage, so it cannot be opened]`
  }
  return null
}

/**
 * What a PDF, an office file or an archive gave back, as the line the model
 * reads. Every failure has its own sentence, because each one asks the person
 * for something different -- a scan needs the text or a photo of the page, a
 * locked file needs the password removed, a broken one needs sending again.
 */
function extractedLine(name: string, got: Extracted): string {
  if (got.ok) {
    const body = foreignText(defangMarkers(got.text), { limit: NOTE_SHOWS })
    if (got.listing) {
      return `[listed, not unpacked: ${name} — only the names and sizes inside are known; say so, and to read one of these files ask the person to send it on its own]\n${body}`
    }
    // `more`: reading stopped early, so the count is not the document's.
    const shown = got.more
      ? ' — a long document, only its beginning was read and is shown'
      : got.chars > NOTE_SHOWS
        ? ` — ${got.chars} characters, only the beginning is shown`
        : ''
    return `[read: ${name}${shown}]\n${body}`
  }
  switch (got.reason) {
    case 'no-text':
      return `[not read: ${name} — this PDF has no text layer (a scan or pictures of pages), so there is nothing to read in it. Say so plainly and ask for the text or a photo of the page; do NOT guess what it says.]`
    case 'encrypted':
      return `[not read: ${name} — the file is password-protected; ask the person for a copy without the password]`
    case 'too-big':
      return `[not read: ${name} — the file is too big to open here (over ${Math.round(DOCUMENT_MAX_BYTES / 1024 / 1024)} MB, or too much packed inside it); ask the person for the part that matters]`
    case 'tool-missing':
      return `[not read: ${name} — the reader for this format is not installed on the server yet. Say so plainly; do NOT guess what it says.]`
    default:
      return `[not read: ${name} — the file could not be opened (damaged, or not really this format); ask the person to send it again]`
  }
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
  /*
   * The chain is asked about what is LEFT once our own senses have taken
   * their share -- the same set `chat.ts` will compute for itself, because
   * everything we read gets its marker broken below. Asking about the whole
   * set would produce the one outcome this file exists to prevent: a photo
   * described here AND sent as a part, or a voice note refused in the text
   * while its bytes travel beside the refusal.
   */
  const mine = ownSenses()
  const left = new Set([...kinds].filter(k => !mine.has(k)))
  const perceived = chainPerceives(left, opts.toolsOnly)

  /* Which refs actually need work, canonical and de-duplicated. */
  const todo: Array<{ ref: MarkerRef; key: string; url: string }> = []
  const seen = new Set<string>()
  for (const ref of refs) {
    if (ref.kind === 'image' || ref.kind === 'audio') {
      // Handled natively: the provider will fetch it itself. Only ever for a
      // sense we do not own -- ours are read here, on this turn's clock.
      if (perceived && !mine.has(ref.kind) && usableMediaUrl(ref.url, ref.kind))
        continue
    }
    const found = shelfObject(ref.url)
    const key = markerKey(ref)
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
  /*
   * Everything here is answered in the text, so its marker must stop being
   * one. Both outcomes count: a photo we described and a photo we admitted we
   * could not look at are equally settled, and a native part sent beside
   * either would contradict the sentence the model is reading.
   */
  const handled = new Set<string>()
  /** Names nothing could perceive -- the line the owner greps for. */
  const blind: string[] = []
  let budget = INLINE_BUDGET
  let live = 0
  let looked = 0
  let opened = 0

  const add = (line: string) => {
    if (budget <= 0) return
    lines.push(line.length > budget ? line.slice(0, budget) : line)
    budget -= line.length
  }

  for (const { ref, key, url } of todo) {
    const name = ref.name || 'file'
    const stored = cached.get(url)
    if (ref.kind === 'image' || ref.kind === 'audio') handled.add(key)

    if (ref.kind === 'file') {
      const refusal = documentRefusal(ref)
      if (refusal) {
        add(refusal)
        continue
      }
      if (!isTextLikeDocument(ref.mime, name)) {
        /*
         * Read before, by the background pass: its words, and no wait. An
         * archive's stored text is still only a listing, and says so.
         */
        if (stored) {
          add(
            documentFormat(ref.mime, name) === 'archive'
              ? extractedLine(name, {
                  ok: true,
                  text: stored,
                  chars: stored.length,
                  listing: true,
                })
              : note('read earlier', name, stored)
          )
          continue
        }
        if (opened >= MAX_LIVE_DOCUMENTS) {
          add(
            `[not read on this turn: ${name} — only ${MAX_LIVE_DOCUMENTS} documents are opened per message. Say so plainly and do NOT guess what it says; it can be read if the person sends it again on its own.]`
          )
          continue
        }
        opened += 1
        const got = await readShelfExtractedNow(
          url,
          name,
          ref.mime,
          LIVE_READ_MS
        )
        add(
          got === 'late'
            ? `[still reading: ${name} — the file is taking longer to open than this answer can wait. Say so plainly and do NOT guess what it says; ask the person to send it again in a minute, or to paste the part that matters.]`
            : extractedLine(name, got)
        )
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
      blind.push(name)
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
      /*
       * Sight, live, at last. The shape is the transcriber's, deliberately:
       * a cap on how many one turn may do, a short deadline, one attempt,
       * and a refusal that names the file when it does not come back.
       */
      if (looked < MAX_LIVE_DESCRIPTIONS) {
        looked += 1
        const sight = await describeShelfImageNow(
          url,
          name,
          LIVE_DESCRIBE_MS
        ).catch(() => null)
        if (sight) {
          add(note('seen', name, sight))
          continue
        }
      }
      blind.push(name)
      add(
        `[not seen: ${name} — nothing here could look at this image, and no description is on record. Say so plainly; do NOT describe it from the conversation.]`
      )
      continue
    }

    // Video. Frame sampling takes minutes, so the PICTURE belongs to the
    // sweep; a live turn has yesterday's description or admits it has none.
    if (stored) {
      add(note('watched earlier', name, stored))
      continue
    }
    /*
     * THE SOUND, LIVE (2026-09-22). A video note is somebody talking, and the
     * transcriber that hears a voice note hears it too. It spends the same
     * one-per-turn budget as a recording: it is the same cost and the same
     * wait.
     */
    let heard: string | null = null
    if (live < MAX_LIVE_TRANSCRIPTS && whisperConfig()) {
      live += 1
      heard = await transcribeShelfVideoNow(
        url,
        name,
        LIVE_TRANSCRIBE_MS
      ).catch(() => null)
    }
    add(
      heard
        ? `[heard in the video: ${name} — its soundtrack only; nothing has looked at the picture yet, so do NOT describe what is on screen]\n${foreignText(defangMarkers(heard))}`
        : `[not watched: ${name} — nothing here could watch this video or hear speech in it, and no description is on record. Say so plainly.]`
    )
  }

  if (!lines.length) return messages

  /*
   * The warning `chat.ts` used to print lived there because the marker
   * survived this far. It no longer does for anything we settled, so the
   * signal moves here, where the failure actually happened -- and it now
   * names the files, which the old line never did.
   */
  if (blind.length) {
    console.warn(
      `[media] nothing could perceive: ${blind.join(', ')} — ` +
        'check the whisper and vision services and WHISPER_API_KEY/VISION_API_KEY'
    )
  }

  const block =
    '\n\n[ATTACHMENTS — opened by the server, not typed by the person]\n' +
    lines.join('\n')

  return [
    ...messages.slice(0, -1),
    { ...last, content: defangHandled(last.content, handled) + block },
  ]
}
