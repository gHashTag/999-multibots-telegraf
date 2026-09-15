/**
 * MAKING THE AGENT ACTUALLY READ A DOCUMENT AND HEAR A VIDEO.
 *
 * WHAT WAS BROKEN. `media-parts.ts` recognises four marker kinds and converts
 * exactly two:
 *
 *     const kind = m[1] === 'image' ? 'image' : m[1] === 'audio' ? 'audio' : null
 *     if (!kind) continue
 *
 * So a photo is seen and a voice message is heard, while `video` and `file`
 * fall through with only their marker line surviving. A person attaches a PDF
 * and the model receives the sentence "[attached file: contract.pdf; mime=
 * application/pdf; url=…]" -- a file NAME and a link it cannot open. It then
 * answers about the name, confidently, which reads as the model ignoring the
 * document rather than never having been shown it. The owner, 2026-09-15, asked
 * for every file type the chat accepts to be READ -- PDF, photo and video
 * alike -- not merely attached.
 *
 * WHY THIS IS A SEPARATE, ASYNCHRONOUS PASS. `withMediaParts` is a pure
 * string-to-parts function called on the way to the provider. Reading a PDF or
 * pulling the soundtrack out of an mp4 is I/O and subprocesses. Doing it inside
 * that function would make a hot, per-tool-step conversion do network work on
 * every step of the agent loop. This runs ONCE, before the loop, and hands the
 * rest of the pipeline exactly what it already understands.
 *
 * THE TRICK THAT KEEPS THIS SMALL. Neither new kind needs a new content-part
 * type or a new provider capability:
 *
 *   a document  -> its text, inlined into the message as text
 *   a video     -> its soundtrack, re-attached as an `[attached audio: …]`
 *                  marker, which the EXISTING audio path then carries as an
 *                  `audio_url` part on a provider already proven to hear it
 *
 * So the two missing senses are built out of the two that already work, and
 * the wire format, the storage format and the three clients are untouched.
 *
 * WHY CLI TOOLS AND NOT NODE LIBRARIES. `pdftotext` (poppler-utils) and
 * `ffmpeg` are one apt line each in the Dockerfile; ffmpeg is already there for
 * muxing. The JavaScript equivalents are megabytes of bundle for a job two
 * mature binaries do faster and more robustly. The extraction is also sandboxed
 * by being a subprocess with a timeout, which a library call is not.
 *
 * WHAT THIS DELIBERATELY WILL NOT DO. It does not fetch arbitrary URLs. A
 * marker line arrives inside a message a PERSON wrote, so its URL is untrusted
 * input: only our own shelf, only under `/s3/`, exactly the rule
 * `usableMediaUrl` already enforces for pictures. Without that, a pasted marker
 * would turn the render service into someone's file-fetching proxy.
 *
 * WHAT HAPPENS WHEN IT FAILS. Nothing throws. Every failure becomes a short
 * note in the person's own language, appended to the message, so the model can
 * SAY that the file could not be read. The failure mode being replaced is a
 * confident answer about a file nobody opened; a stated refusal is strictly
 * better than that, and today's behaviour is the floor, never the ceiling.
 */

import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { ChatMessage } from './chat'

const run = promisify(execFile)

/** The same marker the three clients write; see media-parts.ts for the shape. */
const MARKER =
  /^\[attached (image|video|audio|file): (.*); mime=(.*?); url=([^\]]*)\]\r?$/gm

/**
 * Ceilings, each with a reason.
 *
 * BYTES: a Telegram document tops out at 20 MB and the mini app at 100 MB;
 * pulling 100 MB into memory on a service that also renders video is how a
 * render dies of an attachment. 32 MB covers every document anyone actually
 * sends and refuses the outliers out loud.
 *
 * CHARS: the extracted text joins the prompt, and a 300-page PDF would push the
 * conversation past the context window -- silently, because the provider simply
 * truncates. Cutting HERE means the cut is visible and can be announced.
 *
 * SECONDS: the soundtrack is transcribed by the provider, which charges by
 * length. Ten minutes is a long meeting recording; past that the person should
 * be told to send the part that matters.
 */
const MAX_FETCH_BYTES = 32 * 1024 * 1024
const MAX_TEXT_CHARS = 60_000
const MAX_AUDIO_SECONDS = 600
const TOOL_TIMEOUT_MS = 90_000
/** Matches media-parts.ts: the request is re-sent on every tool step. */
const MAX_ATTACHMENTS = 4

/**
 * Documents whose text we can extract, and how.
 *
 * `plain` means the bytes ARE the text -- decoding is the whole job. Formats
 * needing a real parser are listed only when the parser is in the image; an
 * untested format would fail as a confusing error rather than a clean refusal,
 * which is the exact trap media-parts.ts documents for `.aac` and `.webm`.
 */
type Extraction = 'pdf' | 'plain' | null

function extractionFor(name: string, mime: string): Extraction {
  const lower = String(name || '').toLowerCase()
  const type = String(mime || '').toLowerCase()
  if (type.includes('pdf') || lower.endsWith('.pdf')) return 'pdf'
  if (
    type.startsWith('text/') ||
    type.includes('json') ||
    type.includes('xml') ||
    type.includes('csv') ||
    /\.(txt|md|markdown|csv|tsv|json|ya?ml|log|srt|vtt|ts|js|py|sql|html?)$/.test(
      lower
    )
  ) {
    return 'plain'
  }
  return null
}

function shelfBase(): string {
  return (
    process.env.PUBLIC_URL || 'https://vibee-render-production.up.railway.app'
  ).replace(/\/+$/, '')
}

/**
 * Only our own shelf, only `/s3/`.
 *
 * Deliberately NOT reusing `usableMediaUrl`: that one also demands an extension
 * the provider understands, which is right for a URL handed to a provider and
 * wrong here, where the bytes are fetched by US and a document has no such
 * list.
 */
export function fetchableShelfUrl(raw: string): string | null {
  const text = String(raw || '').trim()
  if (!text) return null
  const base = shelfBase()
  let url: URL
  try {
    url = new URL(text, base + '/')
  } catch {
    return null
  }
  if (url.origin !== new URL(base).origin) return null
  if (!url.pathname.startsWith('/s3/')) return null
  return url.toString()
}

async function fetchBytes(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) })
    if (!res.ok) return null
    const declared = Number(res.headers.get('content-length'))
    if (Number.isFinite(declared) && declared > MAX_FETCH_BYTES) return null
    const buf = Buffer.from(await res.arrayBuffer())
    return buf.length > MAX_FETCH_BYTES ? null : buf
  } catch {
    return null
  }
}

/** `pdftotext -layout -` keeps columns and tables readable instead of interleaving them. */
async function pdfText(bytes: Buffer): Promise<string | null> {
  const dir = await mkdtemp(join(tmpdir(), 'perceive-'))
  const src = join(dir, 'in.pdf')
  try {
    await writeFile(src, bytes)
    const { stdout } = await run(
      'pdftotext',
      ['-layout', '-enc', 'UTF-8', src, '-'],
      { timeout: TOOL_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 }
    )
    const text = String(stdout || '').trim()
    return text || null
  } catch {
    return null
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

/**
 * The soundtrack, as m4a.
 *
 * `-vn` drops the picture, mono at 16 kHz is what speech recognition wants and
 * is a fraction of the bytes, and `-t` is the ceiling in seconds. A video with
 * NO audio stream makes ffmpeg exit non-zero, which is the honest answer: there
 * is nothing to hear.
 */
async function videoAudio(bytes: Buffer): Promise<Buffer | null> {
  const dir = await mkdtemp(join(tmpdir(), 'perceive-'))
  const src = join(dir, 'in.mp4')
  const out = join(dir, 'out.m4a')
  try {
    await writeFile(src, bytes)
    await run(
      'ffmpeg',
      [
        '-nostdin',
        '-y',
        '-i',
        src,
        '-vn',
        '-ac',
        '1',
        '-ar',
        '16000',
        '-t',
        String(MAX_AUDIO_SECONDS),
        '-c:a',
        'aac',
        '-b:a',
        '64k',
        out,
      ],
      { timeout: TOOL_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 }
    )
    const audio = await readFile(out)
    return audio.length ? audio : null
  } catch {
    return null
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

/**
 * Put the extracted soundtrack back on our own shelf.
 *
 * Through the live `/upload` endpoint rather than by importing the S3 client:
 * the same rule the agent tools already follow, so there is one uploader with
 * one set of limits and one place that can change.
 */
async function shelveAudio(
  bytes: Buffer,
  name: string
): Promise<string | null> {
  const base =
    process.env.SELF_URL || 'http://127.0.0.1:' + (process.env.PORT || '3000')
  try {
    const res = await fetch(`${base}/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'audio/mp4',
        'X-Filename': encodeURIComponent(name),
        ...(process.env.RENDER_API_KEY
          ? { 'X-Api-Key': process.env.RENDER_API_KEY }
          : {}),
      },
      body: new Uint8Array(bytes),
      signal: AbortSignal.timeout(120_000),
    })
    if (!res.ok) return null
    const data = (await res.json().catch(() => null)) as { url?: string } | null
    return data?.url ? String(data.url) : null
  } catch {
    return null
  }
}

/** `contract.pdf` -> `contract`, so the derived audio keeps a recognisable name. */
function stem(name: string): string {
  return (
    String(name || 'file')
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .slice(0, 80) || 'file'
  )
}

/* Single-line literals: the repository's guard does not exempt a multi-line
   template, and Cyrillic is allowed only inside a string literal. */
const OPEN_WHOLE = '[содержимое файла «{name}»]'
const OPEN_CUT = '[содержимое файла «{name}», первые {n} символов из {all}]'
const CLOSE = '[конец файла «{name}»]'

export interface Perceived {
  messages: ChatMessage[]
  /** One line per attachment that was read, or that could not be. For the log. */
  notes: string[]
}

/**
 * Read what the model cannot read by itself, and rewrite the last turn.
 *
 * Only the LAST user turn, for the reason media-parts.ts gives: the agent loop
 * re-sends the whole array on every tool step, and re-reading every file ever
 * attached would repeat all of this work on each step.
 */
export async function perceiveAttachments(
  messages: ChatMessage[]
): Promise<Perceived> {
  const last = messages[messages.length - 1]
  if (!last || last.role !== 'user' || typeof last.content !== 'string') {
    return { messages, notes: [] }
  }

  const text = last.content
  MARKER.lastIndex = 0
  const hits = [...text.matchAll(MARKER)]
    .filter(m => m[1] === 'file' || m[1] === 'video')
    .slice(0, MAX_ATTACHMENTS)
  if (!hits.length) return { messages, notes: [] }

  const notes: string[] = []
  /** Text blocks appended after the original message, in attachment order. */
  const blocks: string[] = []
  /** New marker lines, so the existing audio path picks the soundtrack up. */
  const markers: string[] = []

  for (const m of hits) {
    const kind = m[1]
    const name = String(m[2] || 'файл').trim()
    const mime = String(m[3] || '').trim()
    const url = fetchableShelfUrl(m[4])

    if (!url) {
      notes.push(`${name}: ссылка не на нашу полку — не читаю`)
      blocks.push(
        `[файл «${name}» прочитать не удалось: он лежит не на нашей полке]`
      )
      continue
    }

    if (kind === 'file') {
      const how = extractionFor(name, mime)
      if (!how) {
        notes.push(`${name}: формат ${mime || '?'} не извлекается`)
        blocks.push(
          `[файл «${name}» (${mime || 'неизвестный формат'}) прочитать нечем — ` +
            `скажи об этом человеку и попроси прислать текстом или PDF]`
        )
        continue
      }
      const bytes = await fetchBytes(url)
      if (!bytes) {
        notes.push(`${name}: не скачался или больше ${MAX_FETCH_BYTES} байт`)
        blocks.push(
          `[файл «${name}» не скачался или слишком большой — прочитать не удалось]`
        )
        continue
      }
      const body =
        how === 'pdf' ? await pdfText(bytes) : bytes.toString('utf8').trim()
      if (!body) {
        notes.push(`${name}: текста нет`)
        blocks.push(
          `[в файле «${name}» не нашлось текста — возможно, это скан-картинка; ` +
            `скажи человеку, что распознавания картинок в документах пока нет]`
        )
        continue
      }
      const cut = body.length > MAX_TEXT_CHARS
      const shown = cut ? body.slice(0, MAX_TEXT_CHARS) : body
      notes.push(
        `${name}: прочитано ${shown.length} символов${cut ? ' (обрезано)' : ''}`
      )
      const head = cut
        ? OPEN_CUT.replace('{name}', name)
            .replace('{n}', String(MAX_TEXT_CHARS))
            .replace('{all}', String(body.length))
        : OPEN_WHOLE.replace('{name}', name)
      blocks.push(head + '\n' + shown + '\n' + CLOSE.replace('{name}', name))
      continue
    }

    // kind === 'video'
    const bytes = await fetchBytes(url)
    if (!bytes) {
      notes.push(`${name}: видео не скачалось или слишком большое`)
      blocks.push(
        `[видео «${name}» не скачалось или слишком большое — посмотреть не удалось]`
      )
      continue
    }
    const audio = await videoAudio(bytes)
    if (!audio) {
      notes.push(`${name}: звуковой дорожки нет`)
      blocks.push(
        `[в видео «${name}» нет звуковой дорожки — слушать нечего; ` +
          `скажи человеку, что немое видео пока не разбираю]`
      )
      continue
    }
    const shelved = await shelveAudio(audio, `${stem(name)}-audio.m4a`)
    if (!shelved) {
      notes.push(`${name}: звук не загрузился на полку`)
      blocks.push(
        `[звук из видео «${name}» не удалось подготовить — послушать не вышло]`
      )
      continue
    }
    notes.push(`${name}: звук извлечён (${audio.length} байт)`)
    markers.push(
      `[attached audio: ${stem(name)}-audio.m4a; mime=audio/mp4; url=${shelved}]`
    )
    blocks.push(
      `[из видео «${name}» взята звуковая дорожка — она прикреплена ниже; ` +
        `картинку видео ты не видишь, говори о том, что СКАЗАНО]`
    )
  }

  if (!blocks.length && !markers.length) return { messages, notes }

  const rebuilt = [text, ...blocks, ...markers].join('\n\n')
  return {
    messages: [...messages.slice(0, -1), { ...last, content: rebuilt }],
    notes,
  }
}
