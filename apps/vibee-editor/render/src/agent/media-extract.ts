/**
 * THE FILES THAT ARE NOT PLAIN TEXT, OPENED -- OR NAMED AS NOT OPENED.
 *
 * Owner, 2026-09-22: "I asked for support for reading ALL files." Until this
 * module the agent read photos, voice notes and a list of plain-text formats,
 * and refused the rest by name: a PDF, a .docx, a spreadsheet, an archive all
 * came back as "this format cannot be opened here". A person who sends a
 * contract as a PDF -- the ordinary case -- got an agent that could not read
 * it.
 *
 * What is here, and how each is read:
 *
 *   PDF          `pdftotext` (poppler-utils), ported from #2414 commit
 *                12f09b597. A scan with no text layer yields nothing, and that
 *                is SAID -- it is not a document with no words in it.
 *   .docx .xlsx  the zip is opened and its XML read directly (office-text.ts):
 *   .pptx .odt   these formats are zipped XML, Node ships the inflater, and
 *   .ods .odp    a parser dependency would be megabytes to do forty lines of
 *                work. Parsed in a worker thread, on one budget per file.
 *   .rtf         a small control-word reader; the codepage is honoured, so a
 *                Russian RTF is Russian and not mojibake.
 *   archives     LISTED, NEVER UNPACKED: names and sizes. A zip is read here;
 *                rar, 7z and tar go through `bsdtar -t` (libarchive-tools),
 *                which lists without extracting anything.
 *   video sound  `ffmpeg` pulls the soundtrack out of a video too big for the
 *                transcriber (#2414's `videoAudio`, kept only as that
 *                fallback: the transcriber opens an mp4 itself).
 *
 * WHY SUBPROCESSES FOR PDF AND ARCHIVES. Two mature binaries, one apt line,
 * and a subprocess with a timeout is a sandbox a library call is not. Every
 * binary spawned here is named in `EXTERNAL_TOOLS` with its Debian package, and
 * a test holds the render Dockerfile to that list -- a reader whose binary is
 * missing from the image would refuse every file in production while passing
 * every test on a laptop that happens to have it.
 *
 * WHAT THIS NEVER DOES. It never fetches a URL: bytes come from OUR bucket by
 * key (`withShelfFile`), so a marker line pasted by a person cannot aim this
 * server anywhere. It never unpacks an archive. It never returns more than it
 * was asked for: every read is capped in bytes on the wire and in characters
 * on the way out. An office file is inflated against one budget for the whole
 * document and parsed in a worker thread with a deadline and a heap ceiling,
 * so a zip bomb -- or a parser mistake -- is a refusal, not an outage.
 */

import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { shelfObject } from './media-parts'
import { s3GetToFile } from '../lib/s3-put'
import { IsolatedReader } from './isolated-reader'
import {
  ZIP_MAX_ENTRIES,
  extracted,
  readZipDirectory,
  type Extracted,
  type ExtractFailure,
} from './office-text'

/* ── the lists: one statement of what opens ─────────────────────────────── */

/** Read with `pdftotext`. */
export const PDF_EXTENSIONS: readonly string[] = ['pdf']
/** Zipped XML (Office Open XML, OpenDocument) and RTF, read here. */
export const OFFICE_EXTENSIONS: readonly string[] = [
  'docx',
  'xlsx',
  'pptx',
  'odt',
  'ods',
  'odp',
  'rtf',
]
/** Listed by name and size, never unpacked. */
export const ARCHIVE_EXTENSIONS: readonly string[] = [
  'zip',
  'rar',
  '7z',
  'tar',
  'tgz',
  'gz',
]
/**
 * Formats named often enough to deserve being named back, and still not read:
 * the legacy binary Office formats need a converter this image does not have,
 * Apple's are packages of their own, and an .epub is a book, not a message.
 */
export const UNREADABLE_EXTENSIONS: readonly string[] = [
  'doc',
  'xls',
  'ppt',
  'pages',
  'numbers',
  'key',
  'epub',
]

/**
 * Every binary this module spawns, with the Debian package that provides it.
 * `dockerfile-has-the-readers.test.ts` holds the render image to this list.
 */
export const EXTERNAL_TOOLS: Readonly<Record<string, string>> = {
  pdftotext: 'poppler-utils',
  bsdtar: 'libarchive-tools',
  ffmpeg: 'ffmpeg',
}

export type DocumentFormat = 'pdf' | 'office' | 'archive'

/** The lower-case extension of a name, `tar.gz` folded into `tgz`. */
export function extensionOf(name: string | null | undefined): string {
  const lower = String(name ?? '')
    .trim()
    .toLowerCase()
  if (lower.endsWith('.tar.gz')) return 'tgz'
  const dot = lower.lastIndexOf('.')
  return dot >= 0 ? lower.slice(dot + 1) : ''
}

/** Which reader opens this file, or null when none here does. */
export function documentFormat(
  mime: string | null | undefined,
  name: string | null | undefined
): DocumentFormat | null {
  const ext = extensionOf(name)
  if (PDF_EXTENSIONS.includes(ext) || /^application\/pdf$/i.test(String(mime)))
    return 'pdf'
  if (OFFICE_EXTENSIONS.includes(ext)) return 'office'
  if (ARCHIVE_EXTENSIONS.includes(ext)) return 'archive'
  return null
}

/* ── results ────────────────────────────────────────────────────────────── */

export {
  DOCUMENT_TEXT_CAP,
  officeText,
  readZip,
  readZipDirectory,
  rtfText,
  xmlDecode,
  type Extracted,
  type ExtractFailure,
} from './office-text'

/**
 * Bytes a document may have before it is refused unread. The Bot API's own
 * download ceiling: nothing larger reaches us from Telegram, and the mini app's
 * 100 MB is for video, not for a spreadsheet.
 */
export const DOCUMENT_MAX_BYTES = 20 * 1024 * 1024
/** A long PDF is read from its start; page 300 is not worth a minute of CPU. */
const PDF_MAX_PAGES = 30
/** Seconds a reader may take before it is killed. */
const TOOL_TIMEOUT_MS = 60_000
/** An archive listing names this many entries and counts the rest. */
const LISTING_MAX_ENTRIES = 60

const ok = extracted

/* ── the process boundary ───────────────────────────────────────────────── */

interface ToolError {
  missing: boolean
  stderr: string
}

/**
 * Run one binary. The single place this module crosses into a subprocess, so
 * a test can stand at exactly this boundary and read the command line.
 */
function runTool(
  cmd: string,
  args: string[],
  timeoutMs: number,
  encoding: 'utf8' | 'buffer' = 'utf8'
): Promise<{ stdout: string | Buffer }> {
  return new Promise((resolve, reject) => {
    execFile(
      cmd,
      args,
      {
        timeout: timeoutMs,
        maxBuffer: 32 * 1024 * 1024,
        encoding: encoding === 'buffer' ? 'buffer' : 'utf8',
      },
      (error, stdout, stderr) => {
        if (error) {
          const code = (error as NodeJS.ErrnoException).code
          const e: ToolError = {
            missing: code === 'ENOENT',
            stderr: String(stderr ?? ''),
          }
          reject(e)
          return
        }
        resolve({ stdout })
      }
    )
  })
}

const failureOf = (e: unknown): ExtractFailure => {
  const t = e as Partial<ToolError> | undefined
  if (t?.missing) return 'tool-missing'
  if (/password|encrypt/i.test(String(t?.stderr ?? ''))) return 'encrypted'
  return 'damaged'
}

/* ── PDF ────────────────────────────────────────────────────────────────── */

/**
 * `pdftotext -layout` keeps columns and tables readable instead of
 * interleaving them (#2414). The long runs of spaces it pads a table with are
 * folded afterwards: they carry the alignment and spend the character budget
 * that should carry the words.
 */
export async function pdfTextFromFile(
  path: string,
  timeoutMs = TOOL_TIMEOUT_MS
): Promise<Extracted> {
  try {
    const { stdout } = await runTool(
      'pdftotext',
      ['-layout', '-enc', 'UTF-8', '-l', String(PDF_MAX_PAGES), path, '-'],
      timeoutMs
    )
    const text = String(stdout)
      .replace(/\f/g, '\n')
      .replace(/[ \t]{3,}/g, '  ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
    return ok(text)
  } catch (e) {
    return { ok: false, reason: failureOf(e) }
  }
}

/* ── office files, parsed in a thread of their own ───────────────────────── */

/**
 * WHY A WORKER THREAD (2026-09-22). The render server is one event loop:
 * every chat, upload and render shares it. Parsing a stranger's zipped XML on
 * it meant that a parser mistake -- and the review found three, one of which
 * held the loop for 74 s on a 1 KB workbook -- stopped all of them at once,
 * and a heap blown by one file would have killed the process, which no
 * try/catch can catch. office-text.ts is now bounded by its own budgets; this
 * is the second wall, for whatever those budgets miss: the parse runs in a
 * worker with a heap ceiling and a deadline, and a thread that overruns
 * either is terminated and the file refused as too big. The server keeps
 * answering while it happens.
 */
const officeReader = new IsolatedReader<
  { bytes: Buffer; ext: string },
  Extracted
>(new URL('./office-worker.mjs', import.meta.url), {
  heapMb: 256,
  idleMs: 60_000,
})

/** The longest an office file may take in the background. */
const OFFICE_TIMEOUT_MS = 20_000

/**
 * `officeText`, off the event loop. Never throws: a thread that ran out of
 * time or memory is `too-big`, one that could not start is `tool-missing`
 * (transient, so a stored row stays pending), one that crashed is `damaged`.
 */
export async function officeTextIsolated(
  bytes: Buffer,
  ext: string,
  timeoutMs = OFFICE_TIMEOUT_MS
): Promise<Extracted> {
  const got = await officeReader.run({ bytes, ext }, timeoutMs)
  if (typeof got !== 'string') return got
  console.warn(`[media-extract] office reader stopped: ${got} (.${ext})`)
  if (got === 'unavailable') return { ok: false, reason: 'tool-missing' }
  if (got === 'crashed') return { ok: false, reason: 'damaged' }
  return { ok: false, reason: 'too-big' }
}

/* ── archives: listed, never unpacked ───────────────────────────────────── */

export function humanBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '?'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`
}

/**
 * The table of contents. `truncated`: the archive holds more entries than were
 * read (ZIP_MAX_ENTRIES), and the counts say so instead of passing for totals.
 */
function listing(
  files: Array<{ name: string; size: number }>,
  truncated = false
): Extracted {
  if (!files.length) return { ok: false, reason: 'damaged' }
  const total = files.reduce(
    (n, f) => n + (Number.isFinite(f.size) ? f.size : 0),
    0
  )
  const shown = files.slice(0, LISTING_MAX_ENTRIES)
  const lines = [
    truncated
      ? `more than ${files.length} file(s); the first ${files.length} hold ${humanBytes(total)} unpacked:`
      : `${files.length} file(s), ${humanBytes(total)} unpacked:`,
    ...shown.map(f => `${f.name} — ${humanBytes(f.size)}`),
  ]
  if (files.length > shown.length || truncated)
    lines.push(
      `… and ${truncated ? 'more than ' : ''}${files.length - shown.length} more`
    )
  return ok(lines.join('\n'), true, truncated)
}

/** A lone `.gz`: the name in its header and the size in its trailer. */
function gzipListing(bytes: Buffer, fallbackName: string): Extracted {
  if (bytes.length < 18 || bytes[0] !== 0x1f || bytes[1] !== 0x8b)
    return { ok: false, reason: 'damaged' }
  const flags = bytes[3]
  let name = fallbackName.replace(/\.gz$/i, '')
  if (flags & 0x08) {
    let at = 10
    if (flags & 0x04) at += 2 + bytes.readUInt16LE(10)
    const end = bytes.indexOf(0, at)
    if (end > at) name = bytes.subarray(at, end).toString('latin1')
  }
  return listing([{ name, size: bytes.readUInt32LE(bytes.length - 4) }])
}

/**
 * A name as bsdtar prints it outside a UTF-8 locale: every byte that is not
 * printable ASCII becomes `\ooo`. Found by the real-archive test -- a Russian
 * file name came back as `\320\241\320\274...` -- so the octal is turned back
 * into bytes and the bytes into UTF-8, whatever locale the server has.
 */
function unescapeOctal(name: string): string {
  if (!name.includes('\\')) return name
  const bytes: number[] = []
  for (let i = 0; i < name.length; i += 1) {
    const oct = /^\\([0-7]{3})/.exec(name.slice(i, i + 4))
    if (oct) {
      bytes.push(parseInt(oct[1], 8))
      i += 3
    } else if (name.startsWith('\\\\', i)) {
      bytes.push(0x5c)
      i += 1
    } else {
      const cp = name.codePointAt(i) ?? 0
      bytes.push(...Buffer.from(String.fromCodePoint(cp), 'utf8'))
      if (cp > 0xffff) i += 1
    }
  }
  return Buffer.from(bytes).toString('utf8')
}

/**
 * `bsdtar -tvf` prints an `ls -l` line per entry; the size is the fifth
 * column and the name is everything after the date. At most `max` files are
 * taken: at the 32 MB output ceiling, octal-escaped names cost 1.7 s of the
 * server's event loop to parse whole, to show sixty of them.
 */
export function parseBsdtarListing(
  out: string,
  max = Infinity
): Array<{ name: string; size: number }> {
  const files: Array<{ name: string; size: number }> = []
  let at = 0
  while (at < out.length && files.length < max) {
    let end = out.indexOf('\n', at)
    if (end < 0) end = out.length
    const line = out.slice(at, end)
    at = end + 1
    const m =
      /^([dlrwxsStT-]{10})\s+\d+\s+\S+\s+\S+\s+(\d+)\s+\S+\s+\d+\s+[\d:]+\s+(.+)$/.exec(
        line.trim()
      )
    if (!m || m[1][0] === 'd') continue
    files.push({ name: unescapeOctal(m[3]), size: Number(m[2]) })
  }
  return files
}

export async function archiveListingFromFile(
  path: string,
  ext: string,
  name: string,
  timeoutMs = TOOL_TIMEOUT_MS
): Promise<Extracted> {
  if (ext === 'zip') {
    // At most ZIP_MAX_ENTRIES are read: a directory is cheap per entry, and a
    // 20 MB zip can still declare four hundred thousand of them.
    const dir = readZipDirectory(await readFile(path), ZIP_MAX_ENTRIES)
    if (!dir) return { ok: false, reason: 'damaged' }
    return listing(
      dir.entries
        .filter(e => !e.directory)
        .map(e => ({ name: e.name, size: e.size })),
      dir.truncated
    )
  }
  // A lone `.gz` is one compressed file; `.tar.gz` arrives here as `tgz`.
  if (ext === 'gz') return gzipListing(await readFile(path), name)
  try {
    const { stdout } = await runTool('bsdtar', ['-tvf', path], timeoutMs)
    const files = parseBsdtarListing(String(stdout), ZIP_MAX_ENTRIES + 1)
    return listing(
      files.slice(0, ZIP_MAX_ENTRIES),
      files.length > ZIP_MAX_ENTRIES
    )
  } catch (e) {
    return { ok: false, reason: failureOf(e) }
  }
}

/* ── video: the soundtrack, for a file too big for the transcriber ───────── */

/**
 * The soundtrack as m4a, or null when the video has none (#2414 `videoAudio`).
 *
 * `-vn` drops the picture; mono at 16 kHz is what speech recognition wants and
 * a fraction of the bytes; `-t` is a ceiling in seconds, so a two-hour film
 * cannot become a two-hour transcription bill. ffmpeg exits non-zero on a
 * video with no audio stream, which is the honest answer: nothing to hear.
 */
export async function soundtrackFromFile(
  path: string,
  timeoutMs = TOOL_TIMEOUT_MS,
  maxSeconds = 600
): Promise<Buffer | null> {
  const dir = await mkdtemp(join(tmpdir(), 'sound-'))
  const out = join(dir, 'sound.m4a')
  try {
    await runTool(
      'ffmpeg',
      [
        '-nostdin',
        '-y',
        '-i',
        path,
        '-vn',
        '-ac',
        '1',
        '-ar',
        '16000',
        '-t',
        String(maxSeconds),
        '-c:a',
        'aac',
        '-b:a',
        '64k',
        out,
      ],
      timeoutMs
    )
    const audio = await readFile(out)
    return audio.length ? audio : null
  } catch {
    return null
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

/* ── from the shelf ─────────────────────────────────────────────────────── */

/**
 * Put one shelf object in a private temporary file, hand it to `use`, and
 * remove it -- whatever `use` does. Straight out of the bucket by key: the
 * `/s3/` route would run a video or a PDF through its ffmpeg transcode branch
 * (see `s3GetBytes`), and a URL would be a thing a pasted marker could aim.
 */
export async function withShelfFile<T>(
  url: string,
  maxBytes: number,
  use: (path: string, size: number) => Promise<T>
): Promise<T | 'missing' | 'too-big'> {
  const found = shelfObject(url)
  if (!found) return 'missing'
  const ext = extensionOf(found.key)
  const dir = await mkdtemp(join(tmpdir(), 'shelf-'))
  const path = join(dir, ext ? `file.${ext}` : 'file')
  try {
    const size = await s3GetToFile(found.key, path, maxBytes)
    if (size === null) return 'too-big'
    if (size === 0) return 'missing'
    return await use(path, size)
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

/**
 * Read a PDF, an office document or an archive's table of contents from OUR
 * shelf. Never throws: every way it can fail is a reason the caller can say
 * out loud.
 *
 * `timeoutMs` is how long the reader itself may run -- pdftotext, bsdtar or
 * the office thread -- so a live turn that stops waiting also stops the work
 * (see `readShelfExtractedNow` below). The download is not covered.
 */
export async function readShelfExtracted(
  url: string,
  name: string | null,
  mime: string | null,
  timeoutMs?: number
): Promise<Extracted> {
  const format = documentFormat(mime, name)
  if (!format) return { ok: false, reason: 'damaged' }
  const ext = format === 'pdf' ? 'pdf' : extensionOf(name)
  try {
    const got = await withShelfFile(url, DOCUMENT_MAX_BYTES, async path => {
      if (format === 'pdf') return pdfTextFromFile(path, timeoutMs)
      if (format === 'archive')
        return archiveListingFromFile(
          path,
          ext,
          String(name ?? 'archive'),
          timeoutMs
        )
      return officeTextIsolated(await readFile(path), ext, timeoutMs)
    })
    if (got === 'missing' || got === 'too-big')
      return { ok: false, reason: got }
    return got
  } catch (e) {
    console.warn(
      `[media-extract] could not open ${String(name ?? '').slice(-60)}: ${String(e).slice(0, 160)}`
    )
    return { ok: false, reason: 'missing' }
  }
}

/**
 * A document read NOW, on a live caller's own clock: the text, or `'late'`
 * when the deadline passed first. The reader gets the same deadline, so a
 * caller that stops waiting does not leave a pdftotext running behind it.
 *
 * One wrapper for both live paths -- a chat turn that names a file
 * (media-inline.ts) and the owner's `tg_fetch_media` -- so the two cannot
 * disagree about what "late" means. Never throws.
 */
export async function readShelfExtractedNow(
  url: string,
  name: string | null,
  mime: string | null | undefined,
  timeoutMs: number
): Promise<Extracted | 'late'> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<'late'>(resolve => {
    timer = setTimeout(() => resolve('late'), timeoutMs)
  })
  try {
    return await Promise.race([
      readShelfExtracted(url, name, mime ?? null, timeoutMs).catch(
        (): Extracted => ({ ok: false, reason: 'damaged' })
      ),
      late,
    ])
  } finally {
    clearTimeout(timer)
  }
}
